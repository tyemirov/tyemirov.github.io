package gallery

import "net/http"

func (service *Service) updateOrder(writer http.ResponseWriter, request *http.Request) {
	record, ok := service.authorizeOrder(writer, request)
	if !ok {
		return
	}
	var input orderUpdate
	if !readJSON(writer, request, &input) {
		return
	}
	if input.Status != orderCancelled {
		problem(writer, http.StatusUnprocessableEntity, "invalid_order_update", "The buyer can only cancel an unpaid order.")
		return
	}
	// The first persisted capture attempt excludes cancellation, including when
	// its provider result is uncertain. This predicate shares the database's
	// serialization boundary with capture-attempt creation.
	if _, err := service.database.ExecContext(request.Context(), `UPDATE orders SET status=?,approval_url='' WHERE id=? AND status IN (?,?) AND NOT EXISTS (SELECT 1 FROM payment_attempts WHERE order_id=orders.id)`, orderCancelled, record.ID, orderPending, orderAwaitingApproval); err != nil {
		service.storageError(writer, request, "cancel unpaid order", err)
		return
	}
	record, err := service.readOrder(request.Context(), record.ID)
	if err != nil {
		service.storageError(writer, request, "read cancellation state", err)
		return
	}
	if record.Status != orderCancelled {
		problem(writer, http.StatusConflict, "cancellation_unavailable", "Payment has started. Wait for its result before requesting a refund.")
		return
	}
	respond(writer, http.StatusOK, record.view())
}
