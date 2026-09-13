package gallery_test

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"io"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	gallery "github.com/tyemirov/tyemirov.github.io/services/gallery"
)

func startWithCatalog(t *testing.T, database string) (*httptest.Server, func()) {
	t.Helper()
	configuration := config(database)
	configuration.PublicRoot = filepath.Join("..", "..")
	service, err := gallery.New(configuration)
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
func decodeObject(t *testing.T, payload []byte) map[string]any {
	t.Helper()
	var value map[string]any
	if err := json.Unmarshal(payload, &value); err != nil {
		t.Fatal(err)
	}
	return value
}
func encodeObject(t *testing.T, value any) []byte {
	t.Helper()
	data, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	return data
}
func TestStudioDraftsPersistAndRequireCurrentRevision(t *testing.T) {
	database := filepath.Join(t.TempDir(), "gallery.db")
	server, closeService := startWithCatalog(t, database)
	owner := session(t, "owner@example.test", "gallery-test")
	res, body := request(t, server, "GET", "/gallery/draft", nil, owner, nil)
	requireStatus(t, res, body, 200)
	etag := res.Header.Get("ETag")
	if etag == "" {
		t.Fatal("draft has no revision")
	}
	draft := decodeObject(t, body)
	catalog := draft["gallery"].(map[string]any)
	artworks := catalog["artworks"].([]any)
	artworks[0].(map[string]any)["title"] = "Saved study"
	headers := map[string]string{"Content-Type": "application/json", "If-Match": etag}
	res, body = request(t, server, "PUT", "/gallery/draft", encodeObject(t, draft), owner, headers)
	requireStatus(t, res, body, 200)
	updated := res.Header.Get("ETag")
	if updated == etag {
		t.Fatal("draft revision did not change")
	}
	res, body = request(t, server, "PUT", "/gallery/draft", encodeObject(t, draft), owner, headers)
	requireStatus(t, res, body, 412)
	res, body = request(t, server, "PUT", "/gallery/draft", encodeObject(t, draft), owner, map[string]string{"Content-Type": "application/json"})
	requireStatus(t, res, body, 428)
	closeService()
	server, closeService = startWithCatalog(t, database)
	defer closeService()
	res, body = request(t, server, "GET", "/gallery/draft", nil, owner, nil)
	requireStatus(t, res, body, 200)
	if res.Header.Get("ETag") != updated || !bytes.Contains(body, []byte("Saved study")) {
		t.Fatal("saved draft did not survive restart")
	}
	published, err := os.ReadFile(filepath.Join("..", "..", "data", "site.json"))
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(published, []byte("Saved study")) {
		t.Fatal("saving a draft published content")
	}
}
func TestReviewedPublicationExportsOneCompletePublicSnapshot(t *testing.T) {
	server, closeService := startWithCatalog(t, filepath.Join(t.TempDir(), "gallery.db"))
	defer closeService()
	owner := session(t, "owner@example.test", "gallery-test")
	res, body := request(t, server, "GET", "/gallery/draft", nil, owner, nil)
	requireStatus(t, res, body, 200)
	oldETag := res.Header.Get("ETag")
	draft := decodeObject(t, body)
	original := pngImage(t, 1200, 1800)
	res, body = request(t, server, "POST", "/gallery/assets", original, owner, map[string]string{"Content-Type": "image/png"})
	requireStatus(t, res, body, 201)
	asset := decodeObject(t, body)
	id := asset["id"].(string)
	catalog := draft["gallery"].(map[string]any)
	work := map[string]any{"id": "new-study", "title": "New study", "description": "A private source with public display images.", "alt": "A colored study.", "medium": "Digital artwork", "year": "2026", "image": map[string]any{"cardUrl": "/gallery/images/previews/" + id + ".png", "lightboxUrl": "/gallery/images/full/" + id + ".png", "width": 1200, "height": 1800, "format": "PNG"}, "offer": nil}
	catalog["artworks"] = append(catalog["artworks"].([]any), work)
	draft["masters"].(map[string]any)["new-study"] = id
	res, body = request(t, server, "PUT", "/gallery/draft", encodeObject(t, draft), owner, map[string]string{"Content-Type": "application/json", "If-Match": oldETag})
	requireStatus(t, res, body, 200)
	reviewed := res.Header.Get("ETag")
	res, body = request(t, server, "POST", "/gallery/publications", encodeObject(t, map[string]string{"baseCatalogDigest": catalogDigest(t, server), "draftEtag": oldETag}), owner, map[string]string{"Content-Type": "application/json"})
	requireStatus(t, res, body, 412)
	res, body = request(t, server, "POST", "/gallery/publications", encodeObject(t, map[string]string{"baseCatalogDigest": catalogDigest(t, server), "draftEtag": reviewed}), owner, map[string]string{"Content-Type": "application/json"})
	requireStatus(t, res, body, 201)
	publication := decodeObject(t, body)
	archiveURL := publication["archiveUrl"].(string)
	res, body = request(t, server, "GET", archiveURL, nil, owner, nil)
	requireStatus(t, res, body, 200)
	archive, err := zip.NewReader(bytes.NewReader(body), int64(len(body)))
	if err != nil {
		t.Fatal(err)
	}
	files := map[string][]byte{}
	for _, file := range archive.File {
		reader, err := file.Open()
		if err != nil {
			t.Fatal(err)
		}
		data, err := io.ReadAll(reader)
		if err != nil {
			t.Fatal(err)
		}
		if err := reader.Close(); err != nil {
			t.Fatal(err)
		}
		files[file.Name] = data
	}
	site := decodeObject(t, files["data/site.json"])
	if _, ok := site["music"]; !ok {
		t.Fatal("export omitted other root content")
	}
	publicData := files["data/site.json"]
	if bytes.Contains(publicData, []byte(`"masters"`)) || bytes.Contains(publicData, []byte("owner@example.test")) {
		t.Fatal("private draft data entered publication")
	}
	if len(files["gallery/images/previews/"+id+".png"]) == 0 || len(files["gallery/images/full/"+id+".png"]) == 0 {
		t.Fatal("new public images absent")
	}
	if _, ok := files["gallery/images/full/third-act-01.png"]; !ok {
		t.Fatal("unchanged referenced artwork missing from complete snapshot")
	}
	if _, ok := files["publication.json"]; !ok {
		t.Fatal("publication identity absent")
	}
	for name, data := range files {
		if name != "data/site.json" && name != "publication.json" && bytes.Equal(data, original) {
			t.Fatal("private master entered archive")
		}
	}
	res, body = request(t, server, "GET", archiveURL, nil, nil, nil)
	requireStatus(t, res, body, 401)
}
func TestStudioRejectsObsoleteDraftShapesAndInvalidDraftReferences(t *testing.T) {
	server, closeService := startWithCatalog(t, filepath.Join(t.TempDir(), "gallery.db"))
	defer closeService()
	owner := session(t, "owner@example.test", "gallery-test")
	res, body := request(t, server, "GET", "/gallery/draft", nil, owner, nil)
	requireStatus(t, res, body, 200)
	etag := res.Header.Get("ETag")
	draft := decodeObject(t, body)
	draft["oldExhibits"] = []any{}
	res, body = request(t, server, "PUT", "/gallery/draft", encodeObject(t, draft), owner, map[string]string{"Content-Type": "application/json", "If-Match": etag})
	requireStatus(t, res, body, 400)
	delete(draft, "oldExhibits")
	catalog := draft["gallery"].(map[string]any)
	catalog["collections"].([]any)[0].(map[string]any)["artworkIds"] = []string{"absent"}
	res, body = request(t, server, "PUT", "/gallery/draft", encodeObject(t, draft), owner, map[string]string{"Content-Type": "application/json", "If-Match": etag})
	requireStatus(t, res, body, 422)
}

func TestDraftRejectsUnknownPrivateMaster(t *testing.T) {
	server, closeService := startWithCatalog(t, filepath.Join(t.TempDir(), "gallery.db"))
	defer closeService()
	owner := session(t, "owner@example.test", "gallery-test")
	res, body := request(t, server, "GET", "/gallery/draft", nil, owner, nil)
	requireStatus(t, res, body, 200)
	value := decodeObject(t, body)
	value["masters"].(map[string]any)["absent-work"] = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
	res, body = request(t, server, "PUT", "/gallery/draft", encodeObject(t, value), owner, map[string]string{"Content-Type": "application/json", "If-Match": res.Header.Get("ETag")})
	requireStatus(t, res, body, 422)
}
