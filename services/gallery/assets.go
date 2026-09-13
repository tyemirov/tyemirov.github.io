package gallery

import (
	"bytes"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"image"
	_ "image/jpeg"
	"image/png"
	"io"
	"log/slog"
	"math"
	"mime"
	"net/http"
	"regexp"
	"strconv"
	"strings"

	"golang.org/x/image/draw"
	_ "golang.org/x/image/webp"
)

const maxUploadBytes = 25 << 20
const maxImagePixels = 40000000

var assetIDPattern = regexp.MustCompile(`^[a-f0-9]{64}$`)
var imageFormats = map[string]struct{ label, mediaType string }{"png": {"PNG", "image/png"}, "jpeg": {"JPEG", "image/jpeg"}, "webp": {"WebP", "image/webp"}}

func (service *Service) createAsset(writer http.ResponseWriter, request *http.Request) {
	mediaType, _, err := mime.ParseMediaType(request.Header.Get("Content-Type"))
	if err != nil || (mediaType != "image/png" && mediaType != "image/jpeg" && mediaType != "image/webp") {
		problem(writer, http.StatusUnsupportedMediaType, "unsupported_image_type", "Upload a PNG, JPEG, or WebP image.")
		return
	}
	select {
	case service.uploads <- struct{}{}:
		defer func() { <-service.uploads }()
	case <-request.Context().Done():
		return
	}
	payload, err := io.ReadAll(http.MaxBytesReader(writer, request.Body, maxUploadBytes))
	if err != nil {
		var tooLarge *http.MaxBytesError
		if errors.As(err, &tooLarge) {
			problem(writer, http.StatusRequestEntityTooLarge, "image_too_large", "Images must be at most 25 MiB.")
		} else {
			problem(writer, http.StatusBadRequest, "upload_interrupted", "The image upload did not complete.")
		}
		return
	}
	dimensions, format, err := image.DecodeConfig(bytes.NewReader(payload))
	if err != nil || dimensions.Width <= 0 || dimensions.Height <= 0 || int64(dimensions.Width)*int64(dimensions.Height) > maxImagePixels {
		problem(writer, http.StatusUnprocessableEntity, "invalid_image", "Upload a valid image with at most 40 million pixels.")
		return
	}
	formatInfo, known := imageFormats[format]
	if !known || formatInfo.mediaType != mediaType {
		problem(writer, http.StatusUnprocessableEntity, "image_type_mismatch", "The image bytes must match the supplied media type.")
		return
	}
	decoded, _, err := image.Decode(bytes.NewReader(payload))
	if err != nil {
		problem(writer, http.StatusUnprocessableEntity, "invalid_image", "The image could not be decoded completely.")
		return
	}
	sum := sha256.Sum256(payload)
	id := hex.EncodeToString(sum[:])
	card, err := preview(decoded, 640)
	if err != nil {
		service.storageError(writer, request, "prepare card image", err)
		return
	}
	lightbox, err := preview(decoded, 1600)
	if err != nil {
		service.storageError(writer, request, "prepare lightbox image", err)
		return
	}
	createdAt := timestamp()
	result, err := service.database.ExecContext(request.Context(), `INSERT INTO assets (id,width,height,format,mime,created_at,original,card,lightbox) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING`, id, dimensions.Width, dimensions.Height, formatInfo.label, mediaType, createdAt, payload, card, lightbox)
	if err != nil {
		service.storageError(writer, request, "save private asset", err)
		return
	}
	count, err := result.RowsAffected()
	if err != nil {
		service.storageError(writer, request, "read upload result", err)
		return
	}
	value, err := service.readAsset(request, id)
	if err != nil {
		service.storageError(writer, request, "read uploaded asset", err)
		return
	}
	status := http.StatusCreated
	if count == 0 {
		status = http.StatusOK
	}
	writer.Header().Set("Location", assetsPath+"/"+id)
	respond(writer, status, value)
}

func preview(source image.Image, longEdge int) ([]byte, error) {
	bounds := source.Bounds()
	scale := math.Min(1, float64(longEdge)/float64(max(bounds.Dx(), bounds.Dy())))
	width := max(1, int(math.Round(float64(bounds.Dx())*scale)))
	height := max(1, int(math.Round(float64(bounds.Dy())*scale)))
	target := image.NewNRGBA(image.Rect(0, 0, width, height))
	draw.CatmullRom.Scale(target, target.Bounds(), source, bounds, draw.Src, nil)
	var buffer bytes.Buffer
	if err := png.Encode(&buffer, target); err != nil {
		return nil, err
	}
	return buffer.Bytes(), nil
}

func (service *Service) readAsset(request *http.Request, id string) (asset, error) {
	value := asset{ID: id, Checksum: id}
	err := service.database.QueryRowContext(request.Context(), `SELECT width,height,format,created_at FROM assets WHERE id=?`, id).Scan(&value.Width, &value.Height, &value.Format, &value.CreatedAt)
	return value, err
}
func (service *Service) getAsset(writer http.ResponseWriter, request *http.Request) {
	id := request.PathValue("assetId")
	if !assetIDPattern.MatchString(id) {
		problem(writer, http.StatusNotFound, codeNotFound, "The asset does not exist.")
		return
	}
	value, err := service.readAsset(request, id)
	if errors.Is(err, sql.ErrNoRows) {
		problem(writer, http.StatusNotFound, codeNotFound, "The asset does not exist.")
		return
	}
	if err != nil {
		service.storageError(writer, request, "read asset", err)
		return
	}
	respond(writer, http.StatusOK, value)
}
func (service *Service) getRepresentation(writer http.ResponseWriter, request *http.Request) {
	id := request.PathValue("assetId")
	representation := request.PathValue("representation")
	column, valid := map[string]string{"master": "original", "card": "card", "lightbox": "lightbox"}[representation]
	if !assetIDPattern.MatchString(id) || !valid {
		problem(writer, http.StatusNotFound, codeNotFound, "The asset representation does not exist.")
		return
	}
	var payload []byte
	var mediaType string
	err := service.database.QueryRowContext(request.Context(), `SELECT `+column+`,mime FROM assets WHERE id=?`, id).Scan(&payload, &mediaType)
	if errors.Is(err, sql.ErrNoRows) {
		problem(writer, http.StatusNotFound, codeNotFound, "The asset does not exist.")
		return
	}
	if err != nil {
		service.storageError(writer, request, "read private image", err)
		return
	}
	if representation != "master" {
		mediaType = "image/png"
	}
	writer.Header().Set("Content-Type", mediaType)
	writer.Header().Set("Content-Length", strconv.Itoa(len(payload)))
	writer.Header().Set("ETag", `"`+id+"-"+representation+`"`)
	if representation == "master" {
		writer.Header().Set("Content-Disposition", `attachment; filename="`+id+"."+strings.TrimPrefix(mediaType, "image/")+`"`)
	}
	if request.Method == http.MethodHead {
		writer.WriteHeader(http.StatusOK)
		return
	}
	if _, err := writer.Write(payload); err != nil {
		slog.Error("write private image", "requestId", writer.Header().Get("X-Request-ID"), "error", err)
	}
}
func (service *Service) listAssets(writer http.ResponseWriter, request *http.Request) {
	query := request.URL.Query()
	limit := 50
	for key, values := range query {
		if (key != "limit" && key != "cursor") || len(values) != 1 {
			problem(writer, http.StatusBadRequest, codeInvalidInput, "Use only limit and cursor query fields.")
			return
		}
	}
	if query.Has("limit") {
		var err error
		limit, err = strconv.Atoi(query.Get("limit"))
		if err != nil || limit < 1 || limit > 100 {
			problem(writer, http.StatusBadRequest, codeInvalidInput, "The page limit must be between 1 and 100.")
			return
		}
	}
	cursor := query.Get("cursor")
	if query.Has("cursor") && !assetIDPattern.MatchString(cursor) {
		problem(writer, http.StatusBadRequest, codeInvalidInput, "The asset cursor is invalid.")
		return
	}
	rows, err := service.database.QueryContext(request.Context(), `SELECT id,width,height,format,created_at FROM assets WHERE id>? ORDER BY id LIMIT ?`, cursor, limit+1)
	if err != nil {
		service.storageError(writer, request, "list private assets", err)
		return
	}
	defer rows.Close()
	items := make([]asset, 0, limit+1)
	for rows.Next() {
		var item asset
		if err := rows.Scan(&item.ID, &item.Width, &item.Height, &item.Format, &item.CreatedAt); err != nil {
			service.storageError(writer, request, "read asset page", err)
			return
		}
		item.Checksum = item.ID
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		service.storageError(writer, request, "finish asset page", err)
		return
	}
	var nextCursor *string
	if len(items) > limit {
		items = items[:limit]
		value := items[len(items)-1].ID
		nextCursor = &value
	}
	respond(writer, http.StatusOK, assetPage{items, nextCursor})
}
