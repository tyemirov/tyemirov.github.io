package gallery

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"mime"
	"net/http"
	"regexp"
	"slices"
	"time"

	"github.com/google/uuid"
)

const eventCaptureCompleted = "PAYMENT.CAPTURE.COMPLETED"

var paymentEventIDPattern = regexp.MustCompile(`^[A-Za-z0-9-]{1,100}$`)
var paymentEventTypes = []string{eventCaptureCompleted, eventCaptureRefunded, eventCaptureReversed}

type paymentEvent struct {
	ID       string `json:"id"`
	Type     string `json:"event_type"`
	Resource struct {
		ID            string       `json:"id"`
		Status        string       `json:"status"`
		Amount        paypalAmount `json:"amount"`
		Supplementary struct {
			RelatedIDs struct {
				OrderID string `json:"order_id"`
			} `json:"related_ids"`
		} `json:"supplementary_data"`
	} `json:"resource"`
}

func (service *Service) createCapture(writer http.ResponseWriter, request *http.Request) {
	record, ok := service.authorizeOrder(writer, request)
	if !ok {
		return
	}
	var input emptyInput
	if !readJSON(writer, request, &input) {
		return
	}
	if service.paypal == nil {
		problem(writer, http.StatusServiceUnavailable, "sales_unavailable", "Gallery payments are not available.")
		return
	}
	if record.Status == orderComplete {
		respond(writer, http.StatusOK, record.view())
		return
	}
	if record.Status == orderRevoked || record.Status == orderCancelled || record.ProviderID == "" {
		problem(writer, http.StatusConflict, "capture_unavailable", "This order cannot start a payment capture.")
		return
	}
	key := captureRequestID(record.ID)
	transaction, err := service.database.BeginTx(request.Context(), nil)
	if err != nil {
		service.storageError(writer, request, "begin capture claim", err)
		return
	}
	defer rollback(transaction)
	attempt, err := transaction.ExecContext(request.Context(), `INSERT INTO payment_attempts(order_id,request_id) SELECT id,? FROM orders WHERE id=? AND status IN (?,?) AND provider_id!='' ON CONFLICT(order_id) DO NOTHING`, key, record.ID, orderPending, orderAwaitingApproval)
	if err != nil {
		service.storageError(writer, request, "create capture attempt", err)
		return
	}
	newAttempt, err := attempt.RowsAffected()
	if err != nil {
		service.storageError(writer, request, "read capture attempt", err)
		return
	}
	lease := uuid.NewString()
	now := time.Now().Unix()
	result, err := transaction.ExecContext(request.Context(), `UPDATE payment_attempts SET lease_id=?,lease_until=? WHERE order_id=? AND capture_id='' AND lease_until<=? AND EXISTS (SELECT 1 FROM orders WHERE id=payment_attempts.order_id AND status IN (?,?))`, lease, now+90, record.ID, now, orderPending, orderAwaitingApproval)
	if err != nil {
		service.storageError(writer, request, "claim capture attempt", err)
		return
	}
	changed, err := result.RowsAffected()
	if err != nil {
		service.storageError(writer, request, "read capture claim", err)
		return
	}
	if changed == 1 {
		if _, err := transaction.ExecContext(request.Context(), `UPDATE orders SET status=? WHERE id=? AND status=?`, orderPending, record.ID, orderAwaitingApproval); err != nil {
			service.storageError(writer, request, "record pending capture", err)
			return
		}
	}
	if err := transaction.Commit(); err != nil {
		service.storageError(writer, request, "commit capture claim", err)
		return
	}
	if changed == 1 {
		captureID, err := service.paypal.capture(request.Context(), record, key)
		if errors.Is(err, errPaymentApprovalRequired) && newAttempt == 1 {
			if err := service.restorePaymentApproval(request.Context(), record.ID, lease); err != nil {
				service.storageError(writer, request, "restore payment approval", err)
				return
			}
		} else if err != nil {
			slog.Error("capture payment result is pending", "orderId", record.ID, "requestId", writer.Header().Get("X-Request-ID"), "error", err)
			if _, releaseErr := service.database.ExecContext(request.Context(), `UPDATE payment_attempts SET lease_id='',lease_until=0 WHERE order_id=? AND lease_id=?`, record.ID, lease); releaseErr != nil {
				service.storageError(writer, request, "release capture claim", releaseErr)
				return
			}
		} else {
			if _, err := service.database.ExecContext(request.Context(), `UPDATE payment_attempts SET capture_id=?,lease_id='',lease_until=0 WHERE order_id=? AND lease_id=?`, captureID, record.ID, lease); err != nil {
				service.storageError(writer, request, "record provider capture", err)
				return
			}
		}
	}
	record, err = service.readOrder(request.Context(), record.ID)
	if err != nil {
		service.storageError(writer, request, "read capture state", err)
		return
	}
	writer.Header().Set("Location", ordersPath+"/"+record.ID)
	if record.Status == orderCancelled || record.Status == orderRevoked {
		problem(writer, http.StatusConflict, "capture_unavailable", "This order cannot start a payment capture.")
		return
	}
	if record.Status == orderComplete {
		respond(writer, http.StatusOK, record.view())
		return
	}
	respond(writer, http.StatusAccepted, record.view())
}
func (service *Service) restorePaymentApproval(ctx context.Context, orderID, lease string) error {
	transaction, err := service.database.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin approval restoration: %w", err)
	}
	defer rollback(transaction)
	// Remove only this claim: no capture was sent, and cancellation is safe again.
	result, err := transaction.ExecContext(ctx, `DELETE FROM payment_attempts WHERE order_id=? AND lease_id=? AND capture_id=''`, orderID, lease)
	if err != nil {
		return fmt.Errorf("remove unapproved capture claim: %w", err)
	}
	changed, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("read removed capture claim: %w", err)
	}
	if changed == 1 {
		if _, err := transaction.ExecContext(ctx, `UPDATE orders SET status=? WHERE id=? AND status=?`, orderAwaitingApproval, orderID, orderPending); err != nil {
			return fmt.Errorf("restore unapproved order: %w", err)
		}
	}
	if err := transaction.Commit(); err != nil {
		return fmt.Errorf("commit approval restoration: %w", err)
	}
	return nil
}

func (service *Service) receivePaymentEvent(writer http.ResponseWriter, request *http.Request) {
	if service.paypal == nil {
		problem(writer, http.StatusServiceUnavailable, "sales_unavailable", "Gallery payments are not available.")
		return
	}
	kind, _, err := mime.ParseMediaType(request.Header.Get("Content-Type"))
	if err != nil || kind != "application/json" {
		problem(writer, http.StatusUnsupportedMediaType, "json_required", "Use application/json.")
		return
	}
	body, err := io.ReadAll(http.MaxBytesReader(writer, request.Body, 1<<20))
	if err != nil {
		problem(writer, http.StatusBadRequest, codeInvalidInput, "The webhook body could not be read.")
		return
	}
	var event paymentEvent
	if err := json.Unmarshal(body, &event); err != nil || !paymentEventIDPattern.MatchString(event.ID) || !slices.Contains(paymentEventTypes, event.Type) || !paypalIDPattern.MatchString(event.Resource.ID) || event.Resource.Status != "COMPLETED" || (event.Type == eventCaptureCompleted && !paypalIDPattern.MatchString(event.Resource.Supplementary.RelatedIDs.OrderID)) {
		problem(writer, http.StatusUnprocessableEntity, "invalid_payment_event", "The webhook must describe a completed capture, refund, or reversal.")
		return
	}
	if err := service.paypal.verify(request.Context(), request.Header, body); err != nil {
		if errors.Is(err, errUnverifiedPaymentEvent) {
			problem(writer, http.StatusBadRequest, "unverified_payment_event", "The webhook could not be verified.")
		} else {
			problem(writer, http.StatusServiceUnavailable, "payment_verification_pending", "Provider verification is unavailable. Retry this event.")
		}
		return
	}
	// Canonical JSON makes a provider retry independent of insignificant whitespace.
	var canonical bytes.Buffer
	if err := json.Compact(&canonical, body); err != nil {
		problem(writer, http.StatusBadRequest, codeInvalidInput, "The webhook JSON is invalid.")
		return
	}
	hash := digest(canonical.Bytes())
	if _, err := service.database.ExecContext(request.Context(), `INSERT INTO payment_events(id,digest,body) VALUES(?,?,?) ON CONFLICT(id) DO NOTHING`, event.ID, hash, body); err != nil {
		service.storageError(writer, request, "store verified payment event", err)
		return
	}
	var storedHash string
	var processed int
	if err := service.database.QueryRowContext(request.Context(), `SELECT digest,processed FROM payment_events WHERE id=?`, event.ID).Scan(&storedHash, &processed); err != nil {
		service.storageError(writer, request, "read payment event identity", err)
		return
	}
	if storedHash != hash {
		problem(writer, http.StatusConflict, "payment_event_conflict", "This provider event ID identifies a different event.")
		return
	}
	if processed == 1 {
		writer.WriteHeader(http.StatusNoContent)
		return
	}
	service.respondToPaymentEvent(writer, request, event.ID)
}

func (service *Service) processCompletion(ctx context.Context, event paymentEvent) (eventDisposition, error) {
	providerOrder, err := service.paypal.read(ctx, event.Resource.Supplementary.RelatedIDs.OrderID)
	if err != nil {
		return eventPending, &eventRejection{status: http.StatusServiceUnavailable, code: "payment_reconciliation_pending", message: "Provider reconciliation is pending. Retry this event.", cause: err}
	}
	if len(providerOrder.PurchaseUnits) != 1 {
		return eventPending, &eventRejection{status: http.StatusUnprocessableEntity, code: "payment_mismatch", message: "The provider order has an unexpected purchase structure."}
	}
	record, err := service.readProviderPurchase(ctx, providerOrder.PurchaseUnits[0].CustomID, providerOrder.ID)
	if errors.Is(err, sql.ErrNoRows) {
		return eventPending, nil
	}
	if err != nil {
		return eventPending, err
	}
	if err := service.paypal.matchPurchase(providerOrder, record); err != nil {
		return eventPending, &eventRejection{status: http.StatusUnprocessableEntity, code: "payment_mismatch", message: err.Error()}
	}
	captures := providerOrder.PurchaseUnits[0].Payments.Captures
	if providerOrder.Status != "COMPLETED" || len(captures) != 1 || captures[0].ID != event.Resource.ID || (record.Status != orderRevoked && captures[0].Status != "COMPLETED") || !matchesPayPalAmount(event.Resource.Amount, record.Snapshot.Currency, record.Snapshot.TotalCents) {
		return eventPending, &eventRejection{status: http.StatusUnprocessableEntity, code: "payment_mismatch", message: "The verified event does not describe the provider capture."}
	}
	transaction, err := service.database.BeginTx(ctx, nil)
	if err != nil {
		return eventPending, fmt.Errorf("begin payment completion: %w", err)
	}
	defer rollback(transaction)
	var status orderStatus
	var boundProviderID string
	if err := transaction.QueryRowContext(ctx, `SELECT status,provider_id FROM orders WHERE id=?`, record.ID).Scan(&status, &boundProviderID); err != nil {
		return eventPending, fmt.Errorf("read completion state: %w", err)
	}
	if boundProviderID != "" && boundProviderID != providerOrder.ID {
		return eventPending, &eventRejection{status: http.StatusConflict, code: "payment_order_conflict", message: "This purchase was associated with another provider order."}
	}
	if status != orderRevoked {
		if err := bindCapture(ctx, transaction, record.ID, event.Resource.ID); err != nil {
			return eventPending, err
		}
		for _, item := range record.Snapshot.Items {
			if _, err := transaction.ExecContext(ctx, `INSERT INTO entitlements(order_id,offer_id,revision,status) VALUES(?,?,?,'active') ON CONFLICT(order_id,offer_id) DO NOTHING`, record.ID, item.Offer.ID, item.Offer.Revision); err != nil {
				return eventPending, fmt.Errorf("create purchase entitlement: %w", err)
			}
		}
		if _, err := transaction.ExecContext(ctx, `UPDATE orders SET status=?,provider_id=? WHERE id=?`, orderComplete, providerOrder.ID, record.ID); err != nil {
			return eventPending, fmt.Errorf("record verified completion: %w", err)
		}
		if _, err := transaction.ExecContext(ctx, `INSERT INTO receipt_outbox(order_id) VALUES(?) ON CONFLICT(order_id) DO NOTHING`, record.ID); err != nil {
			return eventPending, fmt.Errorf("queue purchase receipt: %w", err)
		}
	}
	if _, err := transaction.ExecContext(ctx, `UPDATE payment_events SET processed=1 WHERE id=?`, event.ID); err != nil {
		return eventPending, fmt.Errorf("record processed payment event: %w", err)
	}
	if err := transaction.Commit(); err != nil {
		return eventPending, fmt.Errorf("commit verified payment: %w", err)
	}
	return eventProcessed, nil
}

func captureRequestID(orderID string) string {
	return uuid.NewSHA1(uuid.NameSpaceOID, []byte(orderID+"/capture")).String()
}
func bindCapture(ctx context.Context, transaction *sql.Tx, orderID, captureID string) error {
	if _, err := transaction.ExecContext(ctx, `INSERT INTO payment_attempts(order_id,request_id,capture_id) VALUES(?,?,?) ON CONFLICT(order_id) DO UPDATE SET capture_id=excluded.capture_id WHERE payment_attempts.capture_id='' OR payment_attempts.capture_id=excluded.capture_id`, orderID, captureRequestID(orderID), captureID); err != nil {
		return fmt.Errorf("bind provider capture: %w", err)
	}
	var boundCaptureID string
	if err := transaction.QueryRowContext(ctx, `SELECT capture_id FROM payment_attempts WHERE order_id=?`, orderID).Scan(&boundCaptureID); err != nil {
		return fmt.Errorf("read bound capture identity: %w", err)
	}
	if boundCaptureID != captureID {
		return &eventRejection{status: http.StatusConflict, code: "capture_conflict", message: "This order already has another capture."}
	}
	return nil
}
