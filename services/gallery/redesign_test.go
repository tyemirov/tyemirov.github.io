package gallery_test

import (
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
)

func catalogDigest(t *testing.T, server *httptest.Server) string {
	t.Helper()
	response, payload := request(t, server, "GET", "/gallery/readyz", nil, nil, nil)
	requireStatus(t, response, payload, 200)
	value := response.Header.Get("X-Catalog-Digest")
	if len(value) != 64 {
		t.Fatal("readiness omitted the selected catalog digest")
	}
	return value
}
func buyerPayload(t *testing.T, server *httptest.Server, email string, offers []string) []byte {
	t.Helper()
	return encodeObject(t, map[string]any{"offerIds": offers, "email": email, "catalogDigest": catalogDigest(t, server)})
}

func TestGalleryNativePrefixAndClosedSchema(t *testing.T) {
	server, closeService := start(t, filepath.Join(t.TempDir(), "gallery.db"))
	defer closeService()
	owner := session(t, "owner@example.test", "gallery-test")
	for _, path := range []string{"/draft", "/orders", "/assets"} {
		response, payload := request(t, server, "GET", path, nil, owner, nil)
		requireStatus(t, response, payload, 404)
	}
	response, payload := request(t, server, "GET", "/gallery/draft", nil, owner, nil)
	requireStatus(t, response, payload, 200)
	draft := decodeObject(t, payload)
	draft["gallery"].(map[string]any)["siteUrl"] = "https://obsolete.example/gallery/"
	response, payload = request(t, server, "PUT", "/gallery/draft", encodeObject(t, draft), owner, map[string]string{"Content-Type": "application/json", "If-Match": response.Header.Get("ETag")})
	requireStatus(t, response, payload, 400)
}

func TestPurchaseRejectsStaleCatalogBeforeProviderCreation(t *testing.T) {
	server, provider, closeService, _ := saleFixture(t)
	defer closeService()
	response, payload := request(t, server, "POST", "/gallery/orders", encodeObject(t, map[string]any{"offerIds": []string{"study-download"}, "email": "buyer@example.test", "catalogDigest": strings.Repeat("0", 64)}), nil, buyerHeaders("ab795f10-91d8-4cd3-a6c4-1d495c6cb60d"))
	requireStatus(t, response, payload, 409)
	if decodeObject(t, payload)["code"] != "catalog_changed" {
		t.Fatal("missing catalog conflict")
	}
	provider.mutex.Lock()
	defer provider.mutex.Unlock()
	if len(provider.createKeys) != 0 {
		t.Fatal("stale catalog created a provider order")
	}
}

func TestPublicationRetryRetainsIdentityAfterDraftChange(t *testing.T) {
	server, closeService := startWithCatalog(t, filepath.Join(t.TempDir(), "gallery.db"))
	defer closeService()
	owner := session(t, "owner@example.test", "gallery-test")
	res, body := request(t, server, "GET", "/gallery/draft", nil, owner, nil)
	requireStatus(t, res, body, 200)
	draft := decodeObject(t, body)
	etag := res.Header.Get("ETag")
	input := encodeObject(t, map[string]any{"draftEtag": etag, "baseCatalogDigest": catalogDigest(t, server)})
	headers := map[string]string{"Content-Type": "application/json"}
	res, body = request(t, server, "POST", "/gallery/publications", input, owner, headers)
	requireStatus(t, res, body, 201)
	original := string(body)
	draft["gallery"].(map[string]any)["description"] = "A later draft."
	res, body = request(t, server, "PUT", "/gallery/draft", encodeObject(t, draft), owner, map[string]string{"Content-Type": "application/json", "If-Match": etag})
	requireStatus(t, res, body, 200)
	res, body = request(t, server, "POST", "/gallery/publications", input, owner, headers)
	requireStatus(t, res, body, 200)
	if string(body) != original {
		t.Fatal("publication retry changed its result")
	}
}
