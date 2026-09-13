package gallery

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/google/uuid"
)

const defaultReconciliationInterval = 30 * time.Second
const eventRetryDelay = time.Minute
const eventProcessingTimeout = 45 * time.Second
const eventBatchLimit = 50

type eventDisposition int

const (
	eventPending eventDisposition = iota
	eventProcessed
)

type eventRejection struct {
	status  int
	code    string
	message string
	cause   error
}

func (rejection *eventRejection) Error() string {
	if rejection.cause != nil {
		return rejection.message + ": " + rejection.cause.Error()
	}
	return rejection.message
}
func (rejection *eventRejection) Unwrap() error { return rejection.cause }

func (service *Service) readProviderPurchase(ctx context.Context, localID, providerID string) (orderRecord, error) {
	parsed, err := uuid.Parse(localID)
	if err != nil || parsed.String() != localID || !paypalIDPattern.MatchString(providerID) {
		return orderRecord{}, &eventRejection{status: http.StatusUnprocessableEntity, code: "payment_mismatch", message: "The provider record does not identify a gallery purchase."}
	}
	record, err := service.readOrder(ctx, localID)
	if err != nil {
		return record, fmt.Errorf("read provider purchase %s: %w", localID, err)
	}
	if record.ProviderID != "" && record.ProviderID != providerID {
		return orderRecord{}, &eventRejection{status: http.StatusUnprocessableEntity, code: "payment_mismatch", message: "This purchase already identifies another provider order."}
	}
	// The caller must validate the full provider snapshot before persisting
	// this candidate association for an order with a lost creation response.
	record.ProviderID = providerID
	return record, nil
}

func (service *Service) respondToPaymentEvent(writer http.ResponseWriter, request *http.Request, id string) {
	result, err := service.processStoredEvent(request.Context(), id)
	if err != nil {
		var rejection *eventRejection
		if errors.As(err, &rejection) {
			problem(writer, rejection.status, rejection.code, rejection.message)
		} else {
			service.storageError(writer, request, "process verified payment event", err)
		}
		return
	}
	if result == eventPending {
		writer.WriteHeader(http.StatusAccepted)
		return
	}
	writer.WriteHeader(http.StatusNoContent)
}

func (service *Service) processStoredEvent(ctx context.Context, id string) (eventDisposition, error) {
	var body []byte
	var processed int
	if err := service.database.QueryRowContext(ctx, `SELECT body,processed FROM payment_events WHERE id=?`, id).Scan(&body, &processed); err != nil {
		return eventPending, fmt.Errorf("read verified event %s: %w", id, err)
	}
	if processed == 1 {
		return eventProcessed, nil
	}
	var event paymentEvent
	if err := json.Unmarshal(body, &event); err != nil {
		return eventPending, fmt.Errorf("decode verified event %s: %w", id, err)
	}
	if event.ID != id {
		return eventPending, fmt.Errorf("stored payment event %s has another identity", id)
	}
	switch event.Type {
	case eventCaptureCompleted:
		return service.processCompletion(ctx, event)
	case eventCaptureRefunded, eventCaptureReversed:
		return service.processRefund(ctx, event)
	default:
		return eventPending, fmt.Errorf("stored payment event %s has an unsupported type", id)
	}
}

func (service *Service) reconcileEvents(ctx context.Context) error {
	now := service.now().UnixNano()
	rows, err := service.database.QueryContext(ctx, `SELECT e.id FROM payment_events e LEFT JOIN payment_event_retries r ON r.event_id=e.id
 WHERE e.processed=0 AND COALESCE(r.next_attempt,0)<=? ORDER BY COALESCE(r.next_attempt,0),e.id LIMIT ?`, now, eventBatchLimit)
	if err != nil {
		return fmt.Errorf("list pending verified events: %w", err)
	}
	ids := []string{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return errors.Join(err, rows.Close())
		}
		ids = append(ids, id)
	}
	if err := errors.Join(rows.Err(), rows.Close()); err != nil {
		return fmt.Errorf("read pending verified events: %w", err)
	}
	for _, id := range ids {
		if err := ctx.Err(); err != nil {
			return err
		}
		// Reserve the next attempt before provider I/O. The persisted schedule
		// prevents a restart or another service instance from spinning on failures.
		now := service.now()
		result, err := service.database.ExecContext(ctx, `INSERT INTO payment_event_retries(event_id,next_attempt) VALUES(?,?)
 ON CONFLICT(event_id) DO UPDATE SET next_attempt=excluded.next_attempt WHERE payment_event_retries.next_attempt<=?`, id, now.Add(eventRetryDelay).UnixNano(), now.UnixNano())
		if err != nil {
			return fmt.Errorf("schedule payment event %s: %w", id, err)
		}
		changed, err := result.RowsAffected()
		if err != nil {
			return fmt.Errorf("read payment event %s schedule: %w", id, err)
		}
		if changed == 0 {
			continue
		}
		attempt, cancel := context.WithTimeout(ctx, eventProcessingTimeout)
		_, err = service.processStoredEvent(attempt, id)
		cancel()
		if err != nil && ctx.Err() == nil {
			slog.Error("reconcile verified payment event", "eventId", id, "error", err)
		}
	}
	return nil
}

func (service *Service) startReconciliation() {
	ctx, cancel := context.WithCancel(context.Background())
	service.stopReconciliation = cancel
	service.reconciliationStopped = make(chan struct{})
	go func() {
		defer close(service.reconciliationStopped)
		ticker := time.NewTicker(service.config.ReconcileInterval)
		defer ticker.Stop()
		for {
			if err := service.reconcileEvents(ctx); err != nil && ctx.Err() == nil {
				slog.Error("run payment event reconciliation", "error", err)
			}
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
			}
		}
	}()
}
