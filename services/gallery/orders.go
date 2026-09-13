package gallery

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"net/mail"
	"os"
	"path/filepath"
	"strings"

	"github.com/google/uuid"
)

type orderStatus string

const (
	orderPending          orderStatus = "payment-pending"
	orderAwaitingApproval orderStatus = "awaiting-approval"
	orderComplete         orderStatus = "complete"
	orderCancelled        orderStatus = "cancelled"
	orderRevoked          orderStatus = "revoked"
)

type orderRecord struct {
	ID           string
	Snapshot     orderSnapshot
	Entitlements []entitlement
	Status       orderStatus
	Secret       string
	ProviderID   string
	ApprovalURL  string
	Receipt      *receiptView
}

func (record orderRecord) view() orderView {
	var approval *string
	if record.ApprovalURL != "" {
		value := record.ApprovalURL
		approval = &value
	}
	return orderView{ID: record.ID, Status: record.Status, Email: record.Snapshot.Email, Items: record.Snapshot.Items, TotalCents: record.Snapshot.TotalCents, Currency: record.Snapshot.Currency, ApprovalURL: approval, Entitlements: record.Entitlements, Receipt: record.Receipt}
}
func digest(data []byte) string { sum := sha256.Sum256(data); return hex.EncodeToString(sum[:]) }
func newSecret() (string, error) {
	var data [32]byte
	if _, err := rand.Read(data[:]); err != nil {
		return "", fmt.Errorf("create order access: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(data[:]), nil
}
func (service *Service) createOrder(writer http.ResponseWriter, request *http.Request) {
	var input orderInput
	if !readJSON(writer, request, &input) {
		return
	}
	key := request.Header.Get("Idempotency-Key")
	if _, err := uuid.Parse(key); err != nil || len(key) != 36 {
		problem(writer, http.StatusBadRequest, "idempotency_required", "Supply a UUID Idempotency-Key for this purchase.")
		return
	}
	address, err := mail.ParseAddress(input.Email)
	if err != nil || address.Address != input.Email || len(input.Email) > 254 || len(input.OfferIDs) < 1 || len(input.OfferIDs) > 20 {
		problem(writer, http.StatusUnprocessableEntity, codeInvalidInput, "Supply a buyer email and between 1 and 20 distinct offers.")
		return
	}
	seen := map[string]bool{}
	for _, id := range input.OfferIDs {
		if !identifierPattern.MatchString(id) || seen[id] {
			problem(writer, http.StatusUnprocessableEntity, codeInvalidInput, "Select distinct current offer identifiers.")
			return
		}
		seen[id] = true
	}
	if service.paypal == nil {
		problem(writer, http.StatusServiceUnavailable, "sales_unavailable", "Gallery sales are not available.")
		return
	}
	payload, err := json.Marshal(input)
	if err != nil {
		service.storageError(writer, request, "encode purchase request", err)
		return
	}
	keyDigest := digest([]byte(key))
	requestDigest := digest(payload)
	var id, storedDigest string
	err = service.database.QueryRowContext(request.Context(), `SELECT id,request_digest FROM orders WHERE key_digest=?`, keyDigest).Scan(&id, &storedDigest)
	if err == nil {
		if storedDigest != requestDigest {
			problem(writer, http.StatusConflict, "idempotency_conflict", "This key already identifies a different purchase.")
			return
		}
		record, err := service.readOrder(request.Context(), id)
		if err != nil {
			service.storageError(writer, request, "read existing purchase", err)
			return
		}
		service.respondToCreation(writer, request, record, http.StatusOK)
		return
	}
	if !errors.Is(err, sql.ErrNoRows) {
		service.storageError(writer, request, "find purchase request", err)
		return
	}
	snapshot, err := service.priceOrder(request, input)
	if err != nil {
		var conflict *catalogConflict
		if errors.As(err, &conflict) {
			problem(writer, http.StatusConflict, "catalog_changed", "The catalog changed. Review the current offers before purchasing.")
			return
		}
		var invalid *publicationInputError
		if errors.As(err, &invalid) {
			problem(writer, http.StatusUnprocessableEntity, "offer_unavailable", invalid.Error())
		} else {
			service.storageError(writer, request, "price current offers", err)
		}
		return
	}
	encoded, err := json.Marshal(snapshot)
	if err != nil {
		service.storageError(writer, request, "encode purchase snapshot", err)
		return
	}
	secret, err := newSecret()
	if err != nil {
		service.storageError(writer, request, "create private order access", err)
		return
	}
	id = uuid.NewString()
	_, err = service.database.ExecContext(request.Context(), `INSERT INTO orders(id,key_digest,request_digest,access_secret,snapshot,status,created_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(key_digest) DO NOTHING`, id, keyDigest, requestDigest, secret, encoded, orderPending, timestamp())
	if err != nil {
		service.storageError(writer, request, "save purchase snapshot", err)
		return
	}
	// A simultaneous request with this key selects the same committed order.
	if err := service.database.QueryRowContext(request.Context(), `SELECT id,request_digest FROM orders WHERE key_digest=?`, keyDigest).Scan(&id, &storedDigest); err != nil {
		service.storageError(writer, request, "read committed purchase identity", err)
		return
	}
	if storedDigest != requestDigest {
		problem(writer, http.StatusConflict, "idempotency_conflict", "This key already identifies a different purchase.")
		return
	}
	record, err := service.readOrder(request.Context(), id)
	if err != nil {
		service.storageError(writer, request, "read committed purchase", err)
		return
	}
	service.respondToCreation(writer, request, record, http.StatusCreated)
}
func (service *Service) respondToCreation(writer http.ResponseWriter, request *http.Request, record orderRecord, status int) {
	if record.Status == orderPending && record.ProviderID == "" {
		providerID, approval, err := service.paypal.create(request.Context(), record, service.config.AllowedOrigin)
		if err != nil {
			slog.Error("create PayPal order", "orderId", record.ID, "requestId", writer.Header().Get("X-Request-ID"), "error", err)
		} else {
			if _, err := service.database.ExecContext(request.Context(), `UPDATE orders SET provider_id=?,approval_url=?,status=? WHERE id=? AND status=? AND provider_id=''`, providerID, approval, orderAwaitingApproval, record.ID, orderPending); err != nil {
				service.storageError(writer, request, "record PayPal order", err)
				return
			}
			record, err = service.readOrder(request.Context(), record.ID)
			if err != nil {
				service.storageError(writer, request, "read payment order", err)
				return
			}
		}
	}
	writer.Header().Set("Location", ordersPath+"/"+record.ID)
	respond(writer, status, orderCreation{Order: record.view(), AccessSecret: record.Secret})
}
func (service *Service) priceOrder(request *http.Request, input orderInput) (orderSnapshot, error) {
	result := orderSnapshot{Email: input.Email, Items: []orderItem{}}
	data, err := os.ReadFile(filepath.Join(service.config.PublicRoot, "data", "site.json"))
	if err != nil {
		return result, fmt.Errorf("read published prices: %w", err)
	}
	if digest(data) != input.CatalogDigest {
		return result, &catalogConflict{}
	}
	var site map[string]json.RawMessage
	if err := json.Unmarshal(data, &site); err != nil {
		return result, fmt.Errorf("decode published prices: %w", err)
	}
	var current catalog
	if err := decodeClosed(site["gallery"], &current); err != nil {
		return result, fmt.Errorf("decode published gallery: %w", err)
	}
	if err := validateCatalog(current); err != nil {
		return result, fmt.Errorf("validate published gallery: %w", err)
	}
	offers := map[string]artwork{}
	for _, work := range current.Artworks {
		if work.Offer != nil {
			offers[work.Offer.ID] = work
		}
	}
	for _, id := range input.OfferIDs {
		work, exists := offers[id]
		if !exists {
			return result, invalidPublication("Offer %s is not available.", id)
		}
		sale := *work.Offer
		if result.Currency != "" && sale.Currency != result.Currency {
			return result, invalidPublication("Select offers with the same currency.")
		}
		scale, supported := paypalCurrencies[sale.Currency]
		if !supported || (scale == 0 && sale.PriceCents%100 != 0) {
			return result, invalidPublication("Offer %s has an unsupported currency.", id)
		}
		var width, height int
		var format string
		err := service.database.QueryRowContext(request.Context(), `SELECT width,height,format FROM assets WHERE id=?`, sale.Revision).Scan(&width, &height, &format)
		if errors.Is(err, sql.ErrNoRows) {
			return result, invalidPublication("Offer %s has no available master revision.", id)
		}
		if err != nil {
			return result, fmt.Errorf("read master for offer %s: %w", id, err)
		}
		if width != sale.File.Width || height != sale.File.Height || format != sale.File.Format {
			return result, invalidPublication("Offer %s does not describe its available file.", id)
		}
		result.TotalCents += sale.PriceCents
		result.Currency = sale.Currency
		if result.TotalCents > 1000000000 {
			return result, invalidPublication("The purchase exceeds the maximum total.")
		}
		result.Items = append(result.Items, orderItem{ArtworkID: work.ID, Title: work.Title, Offer: sale})
	}
	return result, nil
}
func (service *Service) readOrder(ctx context.Context, id string) (orderRecord, error) {
	record := orderRecord{ID: id}
	var snapshot []byte
	var deliveryStatus receiptStatus
	err := service.database.QueryRowContext(ctx, `SELECT o.access_secret,o.snapshot,o.status,o.provider_id,o.approval_url,
 COALESCE(r.status,'')
 FROM orders o LEFT JOIN receipt_outbox r ON r.order_id=o.id WHERE o.id=?`, id).Scan(&record.Secret, &snapshot, &record.Status, &record.ProviderID, &record.ApprovalURL, &deliveryStatus)
	if err != nil {
		return record, err
	}
	if deliveryStatus != "" {
		record.Receipt = &receiptView{Status: deliveryStatus}
	}
	if err := decodeClosed(snapshot, &record.Snapshot); err != nil {
		return record, fmt.Errorf("decode stored purchase snapshot: %w", err)
	}
	record.Entitlements = []entitlement{}
	rows, err := service.database.QueryContext(ctx, `SELECT offer_id,revision,status FROM entitlements WHERE order_id=? ORDER BY offer_id`, id)
	if err != nil {
		return record, err
	}
	defer rows.Close()
	for rows.Next() {
		var item entitlement
		if err := rows.Scan(&item.OfferID, &item.Revision, &item.Status); err != nil {
			return record, err
		}
		record.Entitlements = append(record.Entitlements, item)
	}
	if err := rows.Err(); err != nil {
		return record, err
	}
	return record, nil
}
func (service *Service) authorizeOrder(writer http.ResponseWriter, request *http.Request) (orderRecord, bool) {
	authorization := request.Header.Get("Authorization")
	secret := strings.TrimPrefix(authorization, "Bearer ")
	if authorization == secret || len(secret) != 43 {
		problem(writer, http.StatusUnauthorized, "order_access_required", "Use the private access link for this order.")
		return orderRecord{}, false
	}
	id := request.PathValue("orderId")
	record, err := service.readOrder(request.Context(), id)
	if errors.Is(err, sql.ErrNoRows) {
		problem(writer, http.StatusUnauthorized, "order_access_required", "Use the private access link for this order.")
		return orderRecord{}, false
	}
	if err != nil {
		service.storageError(writer, request, "authorize order access", err)
		return orderRecord{}, false
	}
	if subtle.ConstantTimeCompare([]byte(record.Secret), []byte(secret)) != 1 {
		problem(writer, http.StatusUnauthorized, "order_access_required", "Use the private access link for this order.")
		return orderRecord{}, false
	}
	return record, true
}
func (service *Service) getOrder(writer http.ResponseWriter, request *http.Request) {
	if request.Header.Get("Authorization") == "" {
		service.getOwnerOrder(writer, request)
		return
	}
	record, ok := service.authorizeOrder(writer, request)
	if !ok {
		return
	}
	respond(writer, http.StatusOK, record.view())
}
