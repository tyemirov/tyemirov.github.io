package gallery_test

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/tyemirov/tauth/pkg/sessionvalidator"
	gallery "github.com/tyemirov/tyemirov.github.io/services/gallery"
)

const ownerOrigin = "https://studio.example.test"
const cookieName = "gallery_test_session"

var signingKey = []byte("gallery-test-signing-key-not-a-runtime-credential")

func config(database string) gallery.Config {
	return gallery.Config{DatabasePath: database, PublicRoot: filepath.Join("..", ".."), AllowedOrigin: ownerOrigin, SigningKey: signingKey, CookieName: cookieName, TenantID: "gallery-test", OwnerEmail: "owner@example.test"}
}
func session(t *testing.T, email, tenant string) *http.Cookie {
	t.Helper()
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, sessionvalidator.Claims{TenantID: tenant, UserID: "test-owner-id", UserEmail: email, RegisteredClaims: jwt.RegisteredClaims{Issuer: "tauth", IssuedAt: jwt.NewNumericDate(time.Now().Add(-time.Minute)), ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour))}})
	value, err := token.SignedString(signingKey)
	if err != nil {
		t.Fatal(err)
	}
	return &http.Cookie{Name: cookieName, Value: value}
}
func request(t *testing.T, server *httptest.Server, method, path string, body []byte, cookie *http.Cookie, headers map[string]string) (*http.Response, []byte) {
	t.Helper()
	req, err := http.NewRequest(method, server.URL+path, bytes.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Origin", ownerOrigin)
	if cookie != nil {
		req.AddCookie(cookie)
	}
	for name, value := range headers {
		req.Header.Set(name, value)
	}
	res, err := server.Client().Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	payload, err := io.ReadAll(res.Body)
	if err != nil {
		t.Fatal(err)
	}
	return res, payload
}
func requireStatus(t *testing.T, response *http.Response, body []byte, expected int) {
	t.Helper()
	if response.StatusCode != expected {
		t.Fatalf("HTTP %d, want %d: %.300s", response.StatusCode, expected, body)
	}
}
func start(t *testing.T, database string) (*httptest.Server, func()) {
	t.Helper()
	service, err := gallery.New(config(database))
	if err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(service)
	return server, func() {
		server.Close()
		if err := service.Close(); err != nil {
			t.Error(err)
		}
	}
}
func pngImage(t *testing.T, width, height int) []byte {
	t.Helper()
	img := image.NewNRGBA(image.Rect(0, 0, width, height))
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			img.Set(x, y, color.NRGBA{R: uint8(x % 255), G: uint8(y % 255), B: 100, A: 255})
		}
	}
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}
func TestPrivateAssetsRequireTheConfiguredTAuthOwner(t *testing.T) {
	server, closeService := start(t, filepath.Join(t.TempDir(), "gallery.db"))
	defer closeService()
	for _, item := range []struct {
		name   string
		cookie *http.Cookie
		status int
	}{
		{"anonymous", nil, 401}, {"other-user", session(t, "visitor@example.test", "gallery-test"), 403}, {"other-tenant", session(t, "owner@example.test", "other-tenant"), 403}, {"owner", session(t, "owner@example.test", "gallery-test"), 200},
	} {
		t.Run(item.name, func(t *testing.T) {
			res, body := request(t, server, "GET", "/gallery/assets", nil, item.cookie, nil)
			requireStatus(t, res, body, item.status)
		})
	}
	owner := session(t, "owner@example.test", "gallery-test")
	res, body := request(t, server, "POST", "/gallery/assets", pngImage(t, 3, 2), owner, map[string]string{"Content-Type": "image/png", "Origin": "https://untrusted.example.test"})
	requireStatus(t, res, body, 403)
	res, body = request(t, server, "OPTIONS", "/gallery/assets", nil, nil, map[string]string{"Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type"})
	requireStatus(t, res, body, 204)
	if res.Header.Get("Access-Control-Allow-Origin") != ownerOrigin || res.Header.Get("Access-Control-Allow-Credentials") != "true" {
		t.Fatal("owner CORS contract absent")
	}
}
func TestPrivateUploadCreatesImmutableRevisionsAndBoundedPreviews(t *testing.T) {
	database := filepath.Join(t.TempDir(), "gallery.db")
	server, closeService := start(t, database)
	owner := session(t, "owner@example.test", "gallery-test")
	original := pngImage(t, 2000, 1000)
	sum := sha256.Sum256(original)
	id := hex.EncodeToString(sum[:])
	res, body := request(t, server, "POST", "/gallery/assets", original, owner, map[string]string{"Content-Type": "image/png", "Content-Disposition": "attachment; filename=private-original.png"})
	requireStatus(t, res, body, 201)
	var asset struct {
		ID       string `json:"id"`
		Checksum string `json:"checksum"`
		Width    int    `json:"width"`
		Height   int    `json:"height"`
		Format   string `json:"format"`
	}
	if err := json.Unmarshal(body, &asset); err != nil {
		t.Fatal(err)
	}
	if asset.ID != id || asset.Checksum != id || asset.Width != 2000 || asset.Height != 1000 || asset.Format != "PNG" {
		t.Fatalf("incorrect asset metadata: %s", body)
	}
	if res.Header.Get("Location") != "/gallery/assets/"+id {
		t.Fatal("missing canonical resource location")
	}
	for _, rep := range []struct {
		name          string
		width, height int
	}{{"card", 640, 320}, {"lightbox", 1600, 800}} {
		res, body = request(t, server, "GET", "/gallery/assets/"+id+"/"+rep.name, nil, owner, nil)
		requireStatus(t, res, body, 200)
		dimensions, _, err := image.DecodeConfig(bytes.NewReader(body))
		if err != nil {
			t.Fatal(err)
		}
		if dimensions.Width != rep.width || dimensions.Height != rep.height {
			t.Fatalf("%s dimensions: %v", rep.name, dimensions)
		}
	}
	res, body = request(t, server, "POST", "/gallery/assets", original, owner, map[string]string{"Content-Type": "image/png"})
	requireStatus(t, res, body, 200)
	res, body = request(t, server, "POST", "/gallery/assets", pngImage(t, 600, 900), owner, map[string]string{"Content-Type": "image/png"})
	requireStatus(t, res, body, 201)
	closeService()
	server, closeService = start(t, database)
	defer closeService()
	res, body = request(t, server, "GET", "/gallery/assets/"+id+"/master", nil, owner, nil)
	requireStatus(t, res, body, 200)
	if !bytes.Equal(body, original) {
		t.Fatal("master revision changed after upload or restart")
	}
	for _, path := range []string{"/gallery/assets/" + id, "/gallery/assets/" + id + "/master", "/gallery/assets/" + id + "/card"} {
		res, body = request(t, server, "GET", path, nil, nil, nil)
		requireStatus(t, res, body, 401)
	}
	res, body = request(t, server, "GET", "/gallery/assets?limit=1", nil, owner, nil)
	requireStatus(t, res, body, 200)
	var list struct {
		Items      []json.RawMessage `json:"items"`
		NextCursor string            `json:"nextCursor"`
	}
	if err := json.Unmarshal(body, &list); err != nil {
		t.Fatal(err)
	}
	if len(list.Items) != 1 || list.NextCursor == "" {
		t.Fatal("missing bounded asset pagination")
	}
	res, body = request(t, server, "GET", "/gallery/assets?limit=1&cursor="+list.NextCursor, nil, owner, nil)
	requireStatus(t, res, body, 200)
	if bytes.Contains(body, []byte(`"nextCursor":"`+list.NextCursor+`"`)) {
		t.Fatal("pagination did not advance")
	}
	res, body = request(t, server, "PUT", "/gallery/assets/"+id, nil, owner, nil)
	requireStatus(t, res, body, 405)
	if res.Header.Get("Allow") == "" {
		t.Fatal("missing allowed methods")
	}
}
func TestInvalidUploadsDoNotCreateAssets(t *testing.T) {
	server, closeService := start(t, filepath.Join(t.TempDir(), "gallery.db"))
	defer closeService()
	owner := session(t, "owner@example.test", "gallery-test")
	original := pngImage(t, 12, 8)
	for index, example := range []struct {
		body   []byte
		kind   string
		status int
	}{{[]byte("invalid"), "image/png", 422}, {original[:len(original)/2], "image/png", 422}, {original, "image/jpeg", 422}, {original, "application/octet-stream", 415}, {bytes.Repeat([]byte("x"), 26<<20), "image/png", 413}} {
		t.Run(fmt.Sprint(index), func(t *testing.T) {
			res, body := request(t, server, "POST", "/gallery/assets", example.body, owner, map[string]string{"Content-Type": example.kind})
			requireStatus(t, res, body, example.status)
		})
	}
	res, body := request(t, server, "GET", "/gallery/assets", nil, owner, nil)
	requireStatus(t, res, body, 200)
	var list struct {
		Items []json.RawMessage `json:"items"`
	}
	if err := json.Unmarshal(body, &list); err != nil {
		t.Fatal(err)
	}
	if len(list.Items) != 0 {
		t.Fatal("failed uploads left asset records")
	}
}
