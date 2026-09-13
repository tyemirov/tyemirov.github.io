package gallery_test

import (
	"encoding/json"
	"path/filepath"
	"testing"
)

func TestGalleryHTTPResourceContract(t *testing.T) {
	server, closeService := start(t, filepath.Join(t.TempDir(), "gallery.db"))
	defer closeService()
	res, body := request(t, server, "GET", "/gallery/openapi.json", nil, nil, nil)
	requireStatus(t, res, body, 200)
	var schema struct {
		OpenAPI string                     `json:"openapi"`
		Paths   map[string]json.RawMessage `json:"paths"`
	}
	if err := json.Unmarshal(body, &schema); err != nil {
		t.Fatal(err)
	}
	if schema.OpenAPI != "3.1.1" {
		t.Fatal("canonical OpenAPI contract missing")
	}
	for _, path := range []string{"/gallery/assets", "/gallery/assets/{assetId}", "/gallery/assets/{assetId}/{representation}", "/gallery/draft", "/gallery/publications", "/gallery/publications/{publicationId}/archive"} {
		if _, exists := schema.Paths[path]; !exists {
			t.Fatalf("missing schema for %s", path)
		}
	}
	owner := session(t, "owner@example.test", "gallery-test")
	for _, entry := range []struct {
		method, path string
		status       int
		code         string
	}{{"GET", "/unknown", 404, "not_found"}, {"DELETE", "/gallery/draft", 405, "method_not_allowed"}} {
		res, body = request(t, server, entry.method, entry.path, nil, owner, nil)
		requireStatus(t, res, body, entry.status)
		var failure struct {
			Code      string `json:"code"`
			Message   string `json:"message"`
			RequestID string `json:"requestId"`
		}
		if err := json.Unmarshal(body, &failure); err != nil {
			t.Fatal(err)
		}
		if failure.Code != entry.code || failure.Message == "" || failure.RequestID == "" || res.Header.Get("Cache-Control") != "no-store" {
			t.Fatal("resource error is outside the documented contract")
		}
	}
}
