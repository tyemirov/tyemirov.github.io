package gallery

import (
	"database/sql"
	"errors"
	"fmt"
	"net/http"
	"net/mail"
	"net/url"
	"strconv"
	"strings"

	"github.com/google/uuid"
)

type ownerOrderQuery struct {
	limit         int
	cursor, email string
	status        orderStatus
}

func canonicalUUID(value string) bool {
	id, err := uuid.Parse(value)
	return err == nil && id.String() == value
}
func validOrderStatus(value orderStatus) bool {
	switch value {
	case orderPending, orderAwaitingApproval, orderComplete, orderCancelled, orderRevoked:
		return true
	default:
		return false
	}
}
func parseOwnerOrderQuery(raw string) (ownerOrderQuery, error) {
	result := ownerOrderQuery{limit: 50}
	query, err := url.ParseQuery(raw)
	if err != nil {
		return result, fmt.Errorf("decode order query: %w", err)
	}
	for key, values := range query {
		if len(values) != 1 || (key != "limit" && key != "cursor" && key != "email" && key != "status") {
			return result, errors.New("use only one limit, cursor, email, and status field")
		}
	}
	if query.Has("limit") {
		result.limit, err = strconv.Atoi(query.Get("limit"))
		if err != nil || result.limit < 1 || result.limit > 100 {
			return result, errors.New("page limit must be between 1 and 100")
		}
	}
	result.cursor = query.Get("cursor")
	if query.Has("cursor") && !canonicalUUID(result.cursor) {
		return result, errors.New("order cursor must be a canonical UUID")
	}
	result.email = query.Get("email")
	if query.Has("email") {
		address, err := mail.ParseAddress(result.email)
		if err != nil || address.Address != result.email || len(result.email) > 254 {
			return result, errors.New("supply one complete buyer email address")
		}
	}
	result.status = orderStatus(query.Get("status"))
	if query.Has("status") && !validOrderStatus(result.status) {
		return result, errors.New("supply a current order status")
	}
	return result, nil
}

func (service *Service) listOrders(writer http.ResponseWriter, request *http.Request) {
	query, err := parseOwnerOrderQuery(request.URL.RawQuery)
	if err != nil {
		problem(writer, http.StatusBadRequest, codeInvalidInput, "Use a valid order limit, cursor, email, and status.")
		return
	}
	rows, err := service.database.QueryContext(request.Context(), `SELECT o.id,o.created_at,o.status,o.snapshot,COALESCE(r.status,'')
 FROM orders o LEFT JOIN receipt_outbox r ON r.order_id=o.id
 WHERE o.id>? AND (?='' OR o.status=?) AND (?='' OR json_extract(CAST(o.snapshot AS TEXT),'$.email')=? COLLATE NOCASE)
 ORDER BY o.id LIMIT ?`, query.cursor, query.status, query.status, query.email, query.email, query.limit+1)
	if err != nil {
		service.storageError(writer, request, "list owner orders", err)
		return
	}
	defer rows.Close()
	items := make([]ownerOrderSummary, 0, query.limit+1)
	for rows.Next() {
		var item ownerOrderSummary
		var encoded []byte
		var deliveryStatus receiptStatus
		if err := rows.Scan(&item.ID, &item.CreatedAt, &item.Status, &encoded, &deliveryStatus); err != nil {
			service.storageError(writer, request, "read owner order page", err)
			return
		}
		var snapshot orderSnapshot
		if err := decodeClosed(encoded, &snapshot); err != nil {
			service.storageError(writer, request, "decode owner purchase snapshot", err)
			return
		}
		item.Email = snapshot.Email
		item.TotalCents = snapshot.TotalCents
		item.Currency = snapshot.Currency
		if deliveryStatus != "" {
			item.Receipt = &receiptView{Status: deliveryStatus}
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		service.storageError(writer, request, "finish owner order page", err)
		return
	}
	var nextCursor *string
	if len(items) > query.limit {
		items = items[:query.limit]
		id := items[len(items)-1].ID
		nextCursor = &id
	}
	respond(writer, http.StatusOK, ownerOrderPage{Items: items, NextCursor: nextCursor})
}

func (service *Service) getOwnerOrder(writer http.ResponseWriter, request *http.Request) {
	id := request.PathValue("orderId")
	if !canonicalUUID(id) {
		problem(writer, http.StatusNotFound, codeNotFound, "The order does not exist.")
		return
	}
	record, err := service.readOrder(request.Context(), id)
	if errors.Is(err, sql.ErrNoRows) {
		problem(writer, http.StatusNotFound, codeNotFound, "The order does not exist.")
		return
	}
	if err != nil {
		service.storageError(writer, request, "read owner purchase", err)
		return
	}
	respond(writer, http.StatusOK, record.view())
}

func (service *Service) createAccessReissue(writer http.ResponseWriter, request *http.Request) {
	id := request.PathValue("orderId")
	if !canonicalUUID(id) {
		problem(writer, http.StatusNotFound, codeNotFound, "The order does not exist.")
		return
	}
	if request.URL.RawQuery != "" {
		problem(writer, http.StatusBadRequest, codeInvalidInput, "Access reissues do not accept query fields.")
		return
	}
	var input accessReissueInput
	if !readJSON(writer, request, &input) {
		return
	}
	key := request.Header.Get("Idempotency-Key")
	if !canonicalUUID(key) {
		problem(writer, http.StatusBadRequest, "idempotency_required", "Supply a UUID Idempotency-Key for this access reissue.")
		return
	}
	address, err := mail.ParseAddress(input.VerifiedEmail)
	if err != nil || address.Address != input.VerifiedEmail || len(input.VerifiedEmail) > 254 {
		problem(writer, http.StatusUnprocessableEntity, codeInvalidInput, "Confirm the buyer email before an access reissue.")
		return
	}
	input.VerifiedEmail = strings.ToLower(input.VerifiedEmail)
	tx, err := service.database.BeginTx(request.Context(), nil)
	if err != nil {
		service.storageError(writer, request, "begin access reissue", err)
		return
	}
	defer tx.Rollback()
	var result accessReissue
	keyDigest := digest([]byte(key))
	err = tx.QueryRowContext(request.Context(), `SELECT id,order_id,verified_email,owner_email,created_at FROM access_reissues WHERE key_digest=?`, keyDigest).Scan(&result.ID, &result.OrderID, &result.VerifiedEmail, &result.OwnerEmail, &result.CreatedAt)
	status := http.StatusOK
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		service.storageError(writer, request, "read access reissue identity", err)
		return
	}
	if err == nil {
		if result.OrderID != id || result.VerifiedEmail != input.VerifiedEmail {
			problem(writer, http.StatusConflict, "idempotency_conflict", "This key already identifies a different access reissue.")
			return
		}
	} else {
		status = http.StatusCreated
		result = accessReissue{ID: uuid.NewString(), OrderID: id, VerifiedEmail: input.VerifiedEmail, OwnerEmail: service.config.OwnerEmail, CreatedAt: timestamp()}
	}
	var secret string
	var encoded []byte
	err = tx.QueryRowContext(request.Context(), `SELECT access_secret,snapshot FROM orders WHERE id=?`, id).Scan(&secret, &encoded)
	if errors.Is(err, sql.ErrNoRows) {
		problem(writer, http.StatusNotFound, codeNotFound, "The order does not exist.")
		return
	}
	if err != nil {
		service.storageError(writer, request, "read access reissue purchase", err)
		return
	}
	var snapshot orderSnapshot
	if err := decodeClosed(encoded, &snapshot); err != nil {
		service.storageError(writer, request, "decode access reissue purchase", err)
		return
	}
	if !strings.EqualFold(snapshot.Email, input.VerifiedEmail) {
		problem(writer, http.StatusUnprocessableEntity, "buyer_verification_required", "The confirmed email must match the buyer for this order.")
		return
	}
	if status == http.StatusCreated {
		if _, err := tx.ExecContext(request.Context(), `INSERT INTO access_reissues(id,order_id,key_digest,verified_email,owner_email,created_at) VALUES(?,?,?,?,?,?)`, result.ID, result.OrderID, keyDigest, result.VerifiedEmail, result.OwnerEmail, result.CreatedAt); err != nil {
			service.storageError(writer, request, "record verified access reissue", err)
			return
		}
	}
	if err := tx.Commit(); err != nil {
		service.storageError(writer, request, "commit access reissue", err)
		return
	}
	writer.Header().Set("Location", ordersPath+"/"+id+"/access-reissues/"+result.ID)
	respond(writer, status, accessReissueCreation{Reissue: result, AccessSecret: secret, OrderURL: service.config.AllowedOrigin + "/gallery/order/?order=" + id})
}

func (service *Service) getAccessReissue(writer http.ResponseWriter, request *http.Request) {
	orderID, id := request.PathValue("orderId"), request.PathValue("reissueId")
	if !canonicalUUID(orderID) || !canonicalUUID(id) {
		problem(writer, http.StatusNotFound, codeNotFound, "The access reissue does not exist.")
		return
	}
	if request.URL.RawQuery != "" {
		problem(writer, http.StatusBadRequest, codeInvalidInput, "Access reissues do not accept query fields.")
		return
	}
	var result accessReissue
	err := service.database.QueryRowContext(request.Context(), `SELECT id,order_id,verified_email,owner_email,created_at FROM access_reissues WHERE id=? AND order_id=?`, id, orderID).Scan(&result.ID, &result.OrderID, &result.VerifiedEmail, &result.OwnerEmail, &result.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		problem(writer, http.StatusNotFound, codeNotFound, "The access reissue does not exist.")
		return
	}
	if err != nil {
		service.storageError(writer, request, "read access reissue audit", err)
		return
	}
	respond(writer, http.StatusOK, result)
}
