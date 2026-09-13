package gallery

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/google/uuid"
	pinguinclient "github.com/tyemirov/pinguin/pkg/client"
	"github.com/tyemirov/pinguin/pkg/grpcapi"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
)

const receiptRetryDelay = time.Minute
const receiptTimeout = 30 * time.Second
const receiptBatchLimit = 50

type receiptStatus string

const (
	receiptPending   receiptStatus = "pending"
	receiptQueued    receiptStatus = "queued"
	receiptSent      receiptStatus = "sent"
	receiptAttention receiptStatus = "attention"
)

type receiptDelivery struct {
	connection *grpc.ClientConn
	client     grpcapi.NotificationServiceClient
	apiKey     string
}

func newReceiptDelivery(config ReceiptConfig) (*receiptDelivery, error) {
	if strings.TrimSpace(config.Address) == "" || strings.TrimSpace(config.APIKey) == "" {
		return nil, errors.New("configure receipts: Pinguin address and API key are required")
	}
	settings, err := pinguinclient.NewSettings(config.Address, config.APIKey, 10, int(receiptTimeout/time.Second))
	if err != nil {
		return nil, fmt.Errorf("configure receipts: %w", err)
	}
	// The generated client supplies caller contexts for both submission and status.
	// The released convenience client's status helper creates a background context.
	connection, err := grpc.NewClient(settings.ServerAddress(), grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		return nil, fmt.Errorf("configure receipt connection: %w", err)
	}
	return &receiptDelivery{connection: connection, client: grpcapi.NewNotificationServiceClient(connection), apiKey: settings.APIKey()}, nil
}

func (delivery *receiptDelivery) process(ctx context.Context, record orderRecord, origin, notificationID string) (string, receiptStatus, error) {
	ctx = metadata.AppendToOutgoingContext(ctx, "authorization", "Bearer "+delivery.apiKey)
	message := receiptMessage(record, origin)
	var response *grpcapi.NotificationResponse
	var err error
	if notificationID == "" {
		response, err = delivery.client.SendNotification(ctx, message)
	} else {
		response, err = delivery.client.GetNotificationStatus(ctx, &grpcapi.GetNotificationStatusRequest{NotificationId: notificationID})
	}
	if err != nil {
		// Provider errors can echo buyer content. Retain only the gRPC status code.
		return notificationID, record.Receipt.Status, fmt.Errorf("Pinguin receipt request: %s", status.Code(err))
	}
	if response == nil || response.NotificationId == "" || (notificationID != "" && response.NotificationId != notificationID) || response.NotificationType != grpcapi.NotificationType_EMAIL || response.Recipient != message.Recipient || response.Subject != message.Subject || response.Message != message.Message {
		return notificationID, record.Receipt.Status, errors.New("Pinguin receipt response does not identify the submitted message")
	}
	switch response.Status {
	case grpcapi.Status_SENT:
		return response.NotificationId, receiptSent, nil
	case grpcapi.Status_QUEUED:
		return response.NotificationId, receiptQueued, nil
	case grpcapi.Status_ERRORED:
		// Pinguin has ended this delivery attempt. A later gallery attempt creates
		// a new notification; it never changes the completed purchase.
		return "", receiptPending, errors.New("Pinguin receipt delivery failed")
	default:
		// Unknown or cancelled notifications require operator review. Keep their
		// identity so polling cannot accidentally submit another notification.
		return response.NotificationId, receiptAttention, errors.New("Pinguin receipt status requires review")
	}
}

func receiptMessage(record orderRecord, origin string) *grpcapi.NotificationRequest {
	var body strings.Builder
	fmt.Fprintf(&body, "Thank you for your purchase.\n\nOrder: %s\nTotal: %s %d.%02d\n", record.ID, record.Snapshot.Currency, record.Snapshot.TotalCents/100, record.Snapshot.TotalCents%100)
	for _, item := range record.Snapshot.Items {
		fmt.Fprintf(&body, "\n%s\n%s %d.%02d\nLicense: %s\nFile: %s (%s, %d x %d pixels)\nRevision: %s\nDelivery: %s\n", item.Title, item.Offer.Currency, item.Offer.PriceCents/100, item.Offer.PriceCents%100, item.Offer.License, item.Offer.File.Label, item.Offer.File.Format, item.Offer.File.Width, item.Offer.File.Height, item.Offer.Revision, item.Offer.DeliveryTerms)
	}
	fmt.Fprintf(&body, "\nOpen your order page:\n%s/gallery/order/?order=%s\n\nAccess code: %s\nKeep this code private. Enter it on the order page to view your purchase and request a download.\nDownload links expire after ten minutes. You can request a new link from your order page.\n", origin, record.ID, record.Secret)
	return &grpcapi.NotificationRequest{NotificationType: grpcapi.NotificationType_EMAIL, Recipient: record.Snapshot.Email, Subject: "Gallery receipt for order " + record.ID, Message: body.String()}
}

func (service *Service) processReceipts(ctx context.Context) error {
	rows, err := service.database.QueryContext(ctx, `SELECT r.order_id FROM receipt_outbox r JOIN orders o ON o.id=r.order_id
 WHERE r.status<>? AND r.next_attempt<=? AND o.status=? ORDER BY r.next_attempt,r.order_id LIMIT ?`, receiptSent, service.now().UnixNano(), orderComplete, receiptBatchLimit)
	if err != nil {
		return fmt.Errorf("list pending receipts: %w", err)
	}
	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return errors.Join(err, rows.Close())
		}
		ids = append(ids, id)
	}
	if err := errors.Join(rows.Err(), rows.Close()); err != nil {
		return fmt.Errorf("read pending receipts: %w", err)
	}
	for _, id := range ids {
		if err := ctx.Err(); err != nil {
			return err
		}
		lease, now := uuid.NewString(), service.now()
		result, err := service.database.ExecContext(ctx, `UPDATE receipt_outbox SET lease_id=?,next_attempt=?
 WHERE order_id=? AND status<>? AND next_attempt<=? AND EXISTS(SELECT 1 FROM orders WHERE id=? AND status=?)`, lease, now.Add(receiptRetryDelay).UnixNano(), id, receiptSent, now.UnixNano(), id, orderComplete)
		if err != nil {
			return fmt.Errorf("claim receipt %s: %w", id, err)
		}
		changed, err := result.RowsAffected()
		if err != nil {
			return fmt.Errorf("read receipt claim %s: %w", id, err)
		}
		if changed == 0 {
			continue
		}
		if err := service.processReceipt(ctx, id, lease); err != nil && ctx.Err() == nil {
			slog.Error("process purchase receipt", "orderId", id, "error", err)
		}
	}
	return nil
}

func (service *Service) processReceipt(ctx context.Context, id, lease string) error {
	var notificationID string
	if err := service.database.QueryRowContext(ctx, `SELECT notification_id FROM receipt_outbox WHERE order_id=? AND lease_id=?`, id, lease).Scan(&notificationID); err != nil {
		return fmt.Errorf("read receipt %s: %w", id, err)
	}
	record, err := service.readOrder(ctx, id)
	if err != nil {
		return fmt.Errorf("read receipt purchase %s: %w", id, err)
	}
	if record.Status != orderComplete {
		return nil
	}
	attempt, cancel := context.WithTimeout(ctx, receiptTimeout)
	notificationID, deliveryStatus, deliveryErr := service.receipts.process(attempt, record, service.config.AllowedOrigin, notificationID)
	cancel()
	if _, err := service.database.ExecContext(ctx, `UPDATE receipt_outbox SET notification_id=?,status=?,lease_id='' WHERE order_id=? AND lease_id=?`, notificationID, deliveryStatus, id, lease); err != nil {
		return fmt.Errorf("record receipt attempt %s: %w", id, err)
	}
	return deliveryErr
}

func (service *Service) startReceipts() {
	ctx, cancel := context.WithCancel(context.Background())
	service.stopReceipts = cancel
	service.receiptsStopped = make(chan struct{})
	go func() {
		defer close(service.receiptsStopped)
		ticker := time.NewTicker(service.config.ReconcileInterval)
		defer ticker.Stop()
		for {
			if err := service.processReceipts(ctx); err != nil && ctx.Err() == nil {
				slog.Error("run receipt delivery", "error", err)
			}
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
			}
		}
	}()
}
