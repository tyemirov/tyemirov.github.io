package gallery

import (
	"archive/zip"
	"bytes"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
)

type publicationInputError struct{ message string }

func (failure *publicationInputError) Error() string { return failure.message }
func invalidPublication(message string, arguments ...any) error {
	return &publicationInputError{message: fmt.Sprintf(message, arguments...)}
}

type catalogConflict struct{}

func (*catalogConflict) Error() string { return "The selected public catalog changed." }

func (service *Service) createPublication(writer http.ResponseWriter, request *http.Request) {
	var input publicationRequest
	if !readJSON(writer, request, &input) {
		return
	}
	transaction, err := service.database.BeginTx(request.Context(), nil)
	if err != nil {
		service.storageError(writer, request, "begin publication", err)
		return
	}
	defer rollback(transaction)
	var existingID string
	err = transaction.QueryRowContext(request.Context(), `SELECT publication_id FROM publication_requests WHERE draft_etag=? AND base_digest=?`, input.DraftETag, input.BaseCatalogDigest).Scan(&existingID)
	if err == nil {
		archiveURL := publicationsPath + "/" + existingID + "/archive"
		writer.Header().Set("Location", archiveURL)
		respond(writer, http.StatusOK, publication{ID: existingID, DraftETag: input.DraftETag, BaseCatalogDigest: input.BaseCatalogDigest, ArchiveURL: archiveURL})
		return
	}
	if !errors.Is(err, sql.ErrNoRows) {
		service.storageError(writer, request, "read publication request", err)
		return
	}
	baseCatalog, err := os.ReadFile(filepath.Join(service.config.PublicRoot, "data", "site.json"))
	if err != nil {
		service.storageError(writer, request, "read publication base", err)
		return
	}
	baseSum := sha256.Sum256(baseCatalog)
	if hex.EncodeToString(baseSum[:]) != input.BaseCatalogDigest {
		problem(writer, http.StatusConflict, "catalog_changed", "Review the current catalog before publication.")
		return
	}
	var revision int64
	var body []byte
	if err := transaction.QueryRowContext(request.Context(), `SELECT revision,body FROM draft WHERE id=1`).Scan(&revision, &body); err != nil {
		service.storageError(writer, request, "read publication draft", err)
		return
	}
	if input.DraftETag != draftETag(revision) {
		problem(writer, http.StatusPreconditionFailed, "stale_draft", "Review the current draft before exporting a publication.")
		return
	}
	var value draft
	if err := decodeClosed(body, &value); err != nil {
		service.storageError(writer, request, "decode stored draft", err)
		return
	}
	if err := validateCatalog(value.Gallery); err != nil {
		problem(writer, http.StatusUnprocessableEntity, "invalid_publication", err.Error())
		return
	}
	files, err := service.publicationFiles(request, transaction, value, revision, baseCatalog)
	if err != nil {
		var invalid *publicationInputError
		if errors.As(err, &invalid) {
			problem(writer, http.StatusUnprocessableEntity, "invalid_publication", invalid.Error())
		} else {
			service.storageError(writer, request, "prepare publication files", err)
		}
		return
	}
	var buffer bytes.Buffer
	archive := zip.NewWriter(&buffer)
	names := make([]string, 0, len(files))
	for name := range files {
		names = append(names, name)
	}
	sort.Strings(names)
	for _, name := range names {
		entry, err := archive.Create(name)
		if err != nil {
			service.storageError(writer, request, "create archive entry", err)
			return
		}
		if _, err := entry.Write(files[name]); err != nil {
			service.storageError(writer, request, "write archive entry", err)
			return
		}
	}
	if err := archive.Close(); err != nil {
		service.storageError(writer, request, "finish publication archive", err)
		return
	}
	data := buffer.Bytes()
	sum := sha256.Sum256(data)
	id := hex.EncodeToString(sum[:])
	result, err := transaction.ExecContext(request.Context(), `INSERT INTO publications (id,draft_revision,archive,created_at) VALUES (?,?,?,?) ON CONFLICT(id) DO NOTHING`, id, revision, data, timestamp())
	if err != nil {
		service.storageError(writer, request, "save publication", err)
		return
	}
	count, err := result.RowsAffected()
	if err != nil {
		service.storageError(writer, request, "read publication result", err)
		return
	}
	if _, err := transaction.ExecContext(request.Context(), `INSERT INTO publication_requests(draft_etag,base_digest,publication_id) VALUES(?,?,?)`, input.DraftETag, input.BaseCatalogDigest, id); err != nil {
		service.storageError(writer, request, "save publication request", err)
		return
	}
	if err := transaction.Commit(); err != nil {
		service.storageError(writer, request, "commit publication", err)
		return
	}
	status := http.StatusCreated
	if count == 0 {
		status = http.StatusOK
	}
	archiveURL := publicationsPath + "/" + id + "/archive"
	writer.Header().Set("Location", archiveURL)
	respond(writer, status, publication{ID: id, DraftETag: input.DraftETag, BaseCatalogDigest: input.BaseCatalogDigest, ArchiveURL: archiveURL})
}
func (service *Service) publicationFiles(request *http.Request, transaction *sql.Tx, value draft, revision int64, source []byte) (map[string][]byte, error) {
	files := map[string][]byte{}
	works := map[string]artwork{}
	for _, work := range value.Gallery.Artworks {
		works[work.ID] = work
	}
	for id := range value.Masters {
		if _, exists := works[id]; !exists {
			return nil, invalidPublication("master refers to absent artwork %s", id)
		}
	}
	for _, work := range value.Gallery.Artworks {
		master, private := value.Masters[work.ID]
		if private {
			var width, height int
			var format string
			var card, lightbox []byte
			err := transaction.QueryRowContext(request.Context(), `SELECT width,height,format,card,lightbox FROM assets WHERE id=?`, master).Scan(&width, &height, &format, &card, &lightbox)
			if errors.Is(err, sql.ErrNoRows) {
				return nil, invalidPublication("artwork %s has no stored master", work.ID)
			}
			if err != nil {
				return nil, fmt.Errorf("read images for artwork %s: %w", work.ID, err)
			}
			expected := publicImage{CardURL: "/gallery/images/previews/" + master + ".png", LightboxURL: "/gallery/images/full/" + master + ".png", Width: width, Height: height, Format: format}
			if work.Image != expected {
				return nil, invalidPublication("artwork %s image metadata differs from its stored asset", work.ID)
			}
			if sale := work.Offer; sale != nil && (sale.Revision != master || sale.File.Width != width || sale.File.Height != height || sale.File.Format != format) {
				return nil, invalidPublication("artwork %s offer does not describe its master revision", work.ID)
			}
			files[strings.TrimPrefix(expected.CardURL, "/")] = card
			files[strings.TrimPrefix(expected.LightboxURL, "/")] = lightbox
		} else {
			if work.Offer != nil {
				return nil, invalidPublication("artwork %s needs a private master before an offer can be published", work.ID)
			}
			for _, path := range []string{work.Image.CardURL, work.Image.LightboxURL} {
				data, err := os.ReadFile(filepath.Join(service.config.PublicRoot, strings.TrimPrefix(path, "/")))
				if err != nil {
					return nil, fmt.Errorf("read public image for artwork %s: %w", work.ID, err)
				}
				files[strings.TrimPrefix(path, "/")] = data
			}
		}
	}
	var site map[string]json.RawMessage
	if err := json.Unmarshal(source, &site); err != nil {
		return nil, fmt.Errorf("decode base site catalog: %w", err)
	}
	galleryJSON, err := json.Marshal(value.Gallery)
	if err != nil {
		return nil, fmt.Errorf("encode public gallery: %w", err)
	}
	site["gallery"] = galleryJSON
	publicJSON, err := json.MarshalIndent(site, "", "  ")
	if err != nil {
		return nil, fmt.Errorf("encode public site: %w", err)
	}
	publicJSON = append(publicJSON, '\n')
	files["data/site.json"] = publicJSON
	baseHash := sha256.Sum256(source)
	catalogHash := sha256.Sum256(publicJSON)
	manifest, err := json.MarshalIndent(struct {
		BaseCatalogSHA256 string `json:"baseCatalogSha256"`
		CatalogSHA256     string `json:"catalogSha256"`
		DraftETag         string `json:"draftEtag"`
	}{hex.EncodeToString(baseHash[:]), hex.EncodeToString(catalogHash[:]), draftETag(revision)}, "", "  ")
	if err != nil {
		return nil, fmt.Errorf("encode publication identity: %w", err)
	}
	files["publication.json"] = append(manifest, '\n')
	return files, nil
}
func (service *Service) getPublicationArchive(writer http.ResponseWriter, request *http.Request) {
	id := request.PathValue("publicationId")
	if !assetIDPattern.MatchString(id) {
		problem(writer, http.StatusNotFound, codeNotFound, "The publication does not exist.")
		return
	}
	var data []byte
	err := service.database.QueryRowContext(request.Context(), `SELECT archive FROM publications WHERE id=?`, id).Scan(&data)
	if errors.Is(err, sql.ErrNoRows) {
		problem(writer, http.StatusNotFound, codeNotFound, "The publication does not exist.")
		return
	}
	if err != nil {
		service.storageError(writer, request, "read publication archive", err)
		return
	}
	writer.Header().Set("Content-Type", "application/zip")
	writer.Header().Set("Content-Disposition", `attachment; filename="gallery-`+id+`.zip"`)
	writer.Header().Set("Content-Length", strconv.Itoa(len(data)))
	writer.Header().Set("ETag", `"`+id+`"`)
	if request.Method == http.MethodHead {
		writer.WriteHeader(http.StatusOK)
		return
	}
	if _, err := writer.Write(data); err != nil {
		slog.Error("write publication archive", "requestId", writer.Header().Get("X-Request-ID"), "error", err)
	}
}
