package gallery

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
)

const maxDraftBytes = 2 << 20

func (service *Service) initializeDraft() error {
	data, err := os.ReadFile(filepath.Join(service.config.PublicRoot, "data", "site.json"))
	if err != nil {
		return fmt.Errorf("read public catalog: %w", err)
	}
	var site map[string]json.RawMessage
	if err := json.Unmarshal(data, &site); err != nil {
		return fmt.Errorf("decode public site: %w", err)
	}
	var initial catalog
	if err := decodeClosed(site["gallery"], &initial); err != nil {
		return fmt.Errorf("decode initial gallery: %w", err)
	}
	if err := validateCatalog(initial); err != nil {
		return fmt.Errorf("validate initial gallery: %w", err)
	}
	initialDraft, err := json.Marshal(draft{Gallery: initial, Masters: map[string]string{}})
	if err != nil {
		return fmt.Errorf("encode initial draft: %w", err)
	}
	if _, err := service.database.Exec(`INSERT INTO draft (id,revision,body) VALUES (1,1,?) ON CONFLICT(id) DO NOTHING`, initialDraft); err != nil {
		return fmt.Errorf("initialize Studio draft: %w", err)
	}
	var stored []byte
	if err := service.database.QueryRow(`SELECT body FROM draft WHERE id=1`).Scan(&stored); err != nil {
		return fmt.Errorf("read retained draft: %w", err)
	}
	var current draft
	if err := decodeClosed(stored, &current); err != nil {
		return fmt.Errorf("validate retained draft; run the explicit draft migration before startup: %w", err)
	}
	return nil
}
func draftETag(revision int64) string { return `"draft-` + strconv.FormatInt(revision, 10) + `"` }
func readJSON(writer http.ResponseWriter, request *http.Request, target any) bool {
	kind, _, err := mime.ParseMediaType(request.Header.Get("Content-Type"))
	if err != nil || kind != "application/json" {
		problem(writer, http.StatusUnsupportedMediaType, "json_required", "Use application/json.")
		return false
	}
	payload, err := io.ReadAll(http.MaxBytesReader(writer, request.Body, maxDraftBytes))
	if err != nil {
		var tooLarge *http.MaxBytesError
		if errors.As(err, &tooLarge) {
			problem(writer, http.StatusRequestEntityTooLarge, "document_too_large", "The document exceeds the maximum size.")
		} else {
			problem(writer, http.StatusBadRequest, codeInvalidInput, "The request did not complete.")
		}
		return false
	}
	if err := decodeClosed(payload, target); err != nil {
		problem(writer, inputErrorStatus(err), codeInvalidInput, "The request does not match the gallery contract.")
		return false
	}
	return true
}
func (service *Service) getDraft(writer http.ResponseWriter, request *http.Request) {
	var revision int64
	var body []byte
	if err := service.database.QueryRowContext(request.Context(), `SELECT revision,body FROM draft WHERE id=1`).Scan(&revision, &body); err != nil {
		service.storageError(writer, request, "read Studio draft", err)
		return
	}
	writer.Header().Set("ETag", draftETag(revision))
	respond(writer, http.StatusOK, json.RawMessage(body))
}
func (service *Service) putDraft(writer http.ResponseWriter, request *http.Request) {
	expected := request.Header.Get("If-Match")
	if expected == "" {
		problem(writer, http.StatusPreconditionRequired, "revision_required", "Read the draft and send its ETag in If-Match.")
		return
	}
	var value draft
	if !readJSON(writer, request, &value) {
		return
	}
	if err := validateCatalog(value.Gallery); err != nil {
		problem(writer, http.StatusUnprocessableEntity, codeInvalidInput, err.Error())
		return
	}
	works := make(map[string]artwork, len(value.Gallery.Artworks))
	for _, work := range value.Gallery.Artworks {
		works[work.ID] = work
		if work.Offer != nil && value.Masters[work.ID] != work.Offer.Revision {
			problem(writer, http.StatusUnprocessableEntity, codeInvalidInput, "An offer must refer to its private master revision.")
			return
		}
	}
	for id := range value.Masters {
		if _, exists := works[id]; !exists {
			problem(writer, http.StatusUnprocessableEntity, codeInvalidInput, "A private master must refer to an existing artwork.")
			return
		}
	}
	body, err := json.Marshal(value)
	if err != nil {
		service.storageError(writer, request, "encode Studio draft", err)
		return
	}
	transaction, err := service.database.BeginTx(request.Context(), nil)
	if err != nil {
		service.storageError(writer, request, "begin draft save", err)
		return
	}
	defer rollback(transaction)
	var revision int64
	var previous []byte
	if err := transaction.QueryRowContext(request.Context(), `SELECT revision,body FROM draft WHERE id=1`).Scan(&revision, &previous); err != nil {
		service.storageError(writer, request, "read draft revision", err)
		return
	}
	if expected != draftETag(revision) {
		problem(writer, http.StatusPreconditionFailed, "stale_draft", "The draft changed. Reload it before saving.")
		return
	}
	for id, master := range value.Masters {
		var width, height int
		var format string
		err := transaction.QueryRowContext(request.Context(), `SELECT width,height,format FROM assets WHERE id=?`, master).Scan(&width, &height, &format)
		if errors.Is(err, sql.ErrNoRows) {
			problem(writer, http.StatusUnprocessableEntity, codeInvalidInput, "The private master does not exist.")
			return
		}
		if err != nil {
			service.storageError(writer, request, "read draft master", err)
			return
		}
		work := works[id]
		expected := publicImage{CardURL: "/gallery/images/previews/" + master + ".png", LightboxURL: "/gallery/images/full/" + master + ".png", Width: width, Height: height, Format: format}
		if work.Image != expected || (work.Offer != nil && (work.Offer.File.Width != width || work.Offer.File.Height != height || work.Offer.File.Format != format)) {
			problem(writer, http.StatusUnprocessableEntity, codeInvalidInput, "The artwork must describe its selected private master.")
			return
		}
	}
	if !bytes.Equal(body, previous) {
		revision++
		if _, err := transaction.ExecContext(request.Context(), `UPDATE draft SET revision=?,body=? WHERE id=1`, revision, body); err != nil {
			service.storageError(writer, request, "save Studio draft", err)
			return
		}
	}
	if err := transaction.Commit(); err != nil {
		service.storageError(writer, request, "commit Studio draft", err)
		return
	}
	writer.Header().Set("ETag", draftETag(revision))
	respond(writer, http.StatusOK, value)
}
func rollback(transaction *sql.Tx) {
	if err := transaction.Rollback(); err != nil && !errors.Is(err, sql.ErrTxDone) {
		slog.Error("roll back gallery transaction", "error", err)
	}
}
