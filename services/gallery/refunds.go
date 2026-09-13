package gallery

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"
)

const eventCaptureRefunded = "PAYMENT.CAPTURE.REFUNDED"
const eventCaptureReversed = "PAYMENT.CAPTURE.REVERSED"
const paypalRefundsPath = "/v2/payments/refunds"
const paypalCapturesPath = "/v2/payments/captures"

type paypalRefund struct {
	ID     string       `json:"id"`
	Status string       `json:"status"`
	Amount paypalAmount `json:"amount"`
	Links  []struct {
		Relation string `json:"rel"`
		Method   string `json:"method"`
		URL      string `json:"href"`
	} `json:"links"`
}

func (client *paypalClient) refundCaptureID(refund paypalRefund) (string, bool) {
	var captureID string
	for _, link := range refund.Links {
		if link.Relation != "up" {
			continue
		}
		if captureID != "" || link.Method != http.MethodGet {
			return "", false
		}
		parsed, err := url.Parse(link.URL)
		if err != nil || parsed.Scheme+"://"+parsed.Host != client.config.BaseURL || parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" || parsed.RawPath != "" {
			return "", false
		}
		captureID = strings.TrimPrefix(parsed.Path, paypalCapturesPath+"/")
		if captureID == parsed.Path || !paypalIDPattern.MatchString(captureID) {
			return "", false
		}
	}
	return captureID, captureID != ""
}

func (service *Service) processRefund(ctx context.Context, event paymentEvent) (eventDisposition, error) {
	var refund paypalRefund
	if err := service.paypal.call(ctx, http.MethodGet, paypalRefundsPath+"/"+event.Resource.ID, "", nil, &refund); err != nil {
		return eventPending, &eventRejection{status: http.StatusServiceUnavailable, code: "payment_reconciliation_pending", message: "Provider reconciliation is pending. Retry this event.", cause: err}
	}
	cents, validAmount := payPalAmountCents(refund.Amount)
	captureID, validCapture := service.paypal.refundCaptureID(refund)
	if refund.ID != event.Resource.ID || refund.Status != "COMPLETED" || !validAmount || cents <= 0 || !matchesPayPalAmount(event.Resource.Amount, refund.Amount.Currency, cents) || !validCapture {
		return eventPending, &eventRejection{status: http.StatusUnprocessableEntity, code: "payment_mismatch", message: "The verified event does not describe a completed provider refund."}
	}
	var capture paypalCaptureDetails
	if err := service.paypal.call(ctx, http.MethodGet, paypalCapturesPath+"/"+captureID, "", nil, &capture); err != nil {
		return eventPending, &eventRejection{status: http.StatusServiceUnavailable, code: "payment_reconciliation_pending", message: "Provider reconciliation is pending. Retry this event.", cause: err}
	}
	if capture.ID != captureID {
		return eventPending, &eventRejection{status: http.StatusUnprocessableEntity, code: "payment_mismatch", message: "The provider returned another capture identity."}
	}
	record, err := service.readProviderPurchase(ctx, capture.CustomID, capture.Supplementary.RelatedIDs.OrderID)
	if errors.Is(err, sql.ErrNoRows) {
		return eventPending, nil
	}
	if err != nil {
		return eventPending, err
	}
	if capture.Payee.MerchantID != service.paypal.config.MerchantID || !matchesPayPalAmount(capture.Amount, record.Snapshot.Currency, record.Snapshot.TotalCents) {
		return eventPending, &eventRejection{status: http.StatusUnprocessableEntity, code: "payment_mismatch", message: "The provider capture does not match this purchase."}
	}
	providerOrder, err := service.paypal.read(ctx, record.ProviderID)
	if err != nil {
		return eventPending, &eventRejection{status: http.StatusServiceUnavailable, code: "payment_reconciliation_pending", message: "Provider reconciliation is pending. Retry this event.", cause: err}
	}
	if err := service.paypal.matchPurchase(providerOrder, record); err != nil {
		return eventPending, &eventRejection{status: http.StatusUnprocessableEntity, code: "payment_mismatch", message: err.Error()}
	}
	captures := providerOrder.PurchaseUnits[0].Payments.Captures
	if len(captures) != 1 || captures[0].ID != captureID || refund.Amount.Currency != record.Snapshot.Currency || cents > record.Snapshot.TotalCents {
		return eventPending, &eventRejection{status: http.StatusUnprocessableEntity, code: "payment_mismatch", message: "The provider refund does not identify this purchase."}
	}
	transaction, err := service.database.BeginTx(ctx, nil)
	if err != nil {
		return eventPending, fmt.Errorf("begin refund revocation: %w", err)
	}
	defer rollback(transaction)
	var boundProviderID string
	if err := transaction.QueryRowContext(ctx, `SELECT provider_id FROM orders WHERE id=?`, record.ID).Scan(&boundProviderID); err != nil {
		return eventPending, fmt.Errorf("read refund association: %w", err)
	}
	if boundProviderID != "" && boundProviderID != record.ProviderID {
		return eventPending, &eventRejection{status: http.StatusConflict, code: "payment_order_conflict", message: "This purchase was associated with another provider order."}
	}
	if err := bindCapture(ctx, transaction, record.ID, captureID); err != nil {
		return eventPending, err
	}
	if _, err := transaction.ExecContext(ctx, `UPDATE entitlements SET status='revoked' WHERE order_id=?`, record.ID); err != nil {
		return eventPending, fmt.Errorf("revoke refunded entitlements: %w", err)
	}
	if _, err := transaction.ExecContext(ctx, `UPDATE orders SET status=?,provider_id=?,approval_url='' WHERE id=?`, orderRevoked, record.ProviderID, record.ID); err != nil {
		return eventPending, fmt.Errorf("record refunded order: %w", err)
	}
	if _, err := transaction.ExecContext(ctx, `UPDATE payment_events SET processed=1 WHERE id=?`, event.ID); err != nil {
		return eventPending, fmt.Errorf("record processed refund: %w", err)
	}
	if err := transaction.Commit(); err != nil {
		return eventPending, fmt.Errorf("commit refund revocation: %w", err)
	}
	return eventProcessed, nil
}
