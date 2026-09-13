package gallery

import (
	"bytes"
	"database/sql"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
)

const downloadPrefix = "/gallery/downloads/"
const downloadLifetime = 10 * time.Minute

func (service *Service) createDownloadLink(writer http.ResponseWriter, request *http.Request) {
	record, ok := service.authorizeOrder(writer, request)
	if !ok {
		return
	}
	var input downloadLinkInput
	if !readJSON(writer, request, &input) {
		return
	}
	if !identifierPattern.MatchString(input.OfferID) {
		problem(writer, http.StatusUnprocessableEntity, codeInvalidInput, "Select a purchased offer identifier.")
		return
	}
	secret, err := newSecret()
	if err != nil {
		service.storageError(writer, request, "create download access", err)
		return
	}
	id := uuid.NewString()
	expires := service.now().UTC().Add(downloadLifetime)
	// This insert shares the revocation transaction's database boundary, so a
	// refund cannot authorize a new grant from an earlier order representation.
	result, err := service.database.ExecContext(request.Context(), `INSERT INTO download_links(id,secret_digest,order_id,offer_id,revision,expires_at)
 SELECT ?,?,e.order_id,e.offer_id,e.revision,? FROM entitlements e JOIN orders o ON o.id=e.order_id
 WHERE e.order_id=? AND e.offer_id=? AND e.status='active' AND o.status=?`, id, digest([]byte(secret)), expires.UnixNano(), record.ID, input.OfferID, orderComplete)
	if err != nil {
		service.storageError(writer, request, "create download grant", err)
		return
	}
	changed, err := result.RowsAffected()
	if err != nil {
		service.storageError(writer, request, "read download grant result", err)
		return
	}
	if changed == 0 {
		problem(writer, http.StatusForbidden, "entitlement_required", "An active purchased entitlement is required before file access.")
		return
	}
	value := download{ID: id, OfferID: input.OfferID, ExpiresAt: expires.Format(time.RFC3339Nano), Href: downloadPrefix + id}
	if err := service.database.QueryRowContext(request.Context(), `SELECT revision FROM download_links WHERE id=?`, id).Scan(&value.Revision); err != nil {
		service.storageError(writer, request, "read purchased download revision", err)
		return
	}
	writer.Header().Set("Location", value.Href)
	respond(writer, http.StatusCreated, downloadCreation{Download: value, AccessSecret: secret})
}

func (service *Service) getDownload(writer http.ResponseWriter, request *http.Request) {
	if request.URL.RawQuery != "" {
		problem(writer, http.StatusBadRequest, codeInvalidInput, "Download access uses the Authorization header, without query fields.")
		return
	}
	authorization := request.Header.Get("Authorization")
	secret := strings.TrimPrefix(authorization, "Bearer ")
	id := request.PathValue("downloadId")
	parsed, err := uuid.Parse(id)
	if authorization == secret || len(secret) != 43 || err != nil || parsed.String() != id {
		problem(writer, http.StatusUnauthorized, "download_access_required", "Supply the private access secret for this download.")
		return
	}
	var expires int64
	var entitlementStatus, status, revision, mediaType string
	var payload []byte
	now := service.now()
	// A grant selects only its purchased revision. Authorization state and file
	// bytes come from one database snapshot; a completed refund excludes later reads.
	err = service.database.QueryRowContext(request.Context(), `SELECT d.expires_at,e.status,o.status,d.revision,a.mime,
 CASE WHEN d.expires_at>? AND e.status='active' AND o.status=? THEN a.original ELSE NULL END
 FROM download_links d JOIN entitlements e ON e.order_id=d.order_id AND e.offer_id=d.offer_id AND e.revision=d.revision
 JOIN orders o ON o.id=d.order_id JOIN assets a ON a.id=d.revision WHERE d.id=? AND d.secret_digest=?`, now.UnixNano(), orderComplete, id, digest([]byte(secret))).Scan(&expires, &entitlementStatus, &status, &revision, &mediaType, &payload)
	if errors.Is(err, sql.ErrNoRows) {
		problem(writer, http.StatusUnauthorized, "download_access_required", "Supply the private access secret for this download.")
		return
	}
	if err != nil {
		service.storageError(writer, request, "read protected download", err)
		return
	}
	if !now.Before(time.Unix(0, expires)) {
		problem(writer, http.StatusGone, "download_expired", "This download has expired. Request a new link from the order page.")
		return
	}
	if entitlementStatus != "active" || orderStatus(status) != orderComplete {
		problem(writer, http.StatusForbidden, "entitlement_required", "This purchase no longer authorizes file access.")
		return
	}
	filename := revision + "." + strings.TrimPrefix(mediaType, "image/")
	writer.Header().Set("Content-Type", mediaType)
	writer.Header().Set("Content-Disposition", `attachment; filename="`+filename+`"`)
	writer.Header().Set("ETag", `"`+revision+`"`)
	http.ServeContent(&downloadResponse{ResponseWriter: writer}, request, filename, time.Time{}, bytes.NewReader(payload))
}

// downloadResponse translates ServeContent's HTTP failures into the API error
// representation while retaining its range and conditional-request semantics.
type downloadResponse struct {
	http.ResponseWriter
	rejected bool
}

func (writer *downloadResponse) WriteHeader(status int) {
	writer.Header().Set("Cache-Control", "no-store")
	if status >= http.StatusBadRequest {
		writer.rejected = true
		writer.Header().Del("Content-Length")
		writer.Header().Del("Content-Disposition")
		problem(writer.ResponseWriter, status, "download_request_rejected", "The requested file condition or byte range cannot be satisfied.")
		return
	}
	writer.ResponseWriter.WriteHeader(status)
}

func (writer *downloadResponse) Write(payload []byte) (int, error) {
	if writer.rejected {
		// WriteHeader already sent the JSON error. Consume ServeContent's plain
		// text error body so the response has exactly one representation.
		return len(payload), nil
	}
	written, err := writer.ResponseWriter.Write(payload)
	if err != nil {
		slog.Error("write protected download", "requestId", writer.Header().Get("X-Request-ID"), "error", err)
	}
	return written, err
}
