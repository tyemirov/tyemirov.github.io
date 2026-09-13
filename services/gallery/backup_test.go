package gallery_test

import (
	"bytes"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/google/uuid"
	gallery "github.com/tyemirov/tyemirov.github.io/services/gallery"
)

func galleryExecutable(t *testing.T) string {
	t.Helper()
	binary := filepath.Join(t.TempDir(), "gallery")
	if output, err := exec.Command("go", "build", "-o", binary, "./cmd/gallery").CombinedOutput(); err != nil {
		t.Fatalf("build gallery command: %v: %s", err, output)
	}
	return binary
}
func snapshotCommand(t *testing.T, binary, operation, input, output string) {
	t.Helper()
	args := []string{operation, "--database", input, "--output", output}
	if operation == "restore" {
		args = []string{operation, "--backup", input, "--database", output}
	}
	result, err := exec.Command(binary, args...).CombinedOutput()
	if err != nil {
		t.Fatalf("gallery %s failed: %v: %s", operation, err, result)
	}
	var receipt struct {
		Operation string `json:"operation"`
		SHA256    string `json:"sha256"`
		Bytes     int64  `json:"bytes"`
	}
	if err := json.Unmarshal(result, &receipt); err != nil {
		t.Fatalf("invalid backup receipt: %v", err)
	}
	data, err := os.ReadFile(output)
	if err != nil {
		t.Fatal(err)
	}
	sum := sha256.Sum256(data)
	if receipt.Operation != operation || receipt.SHA256 != hex.EncodeToString(sum[:]) || receipt.Bytes != int64(len(data)) {
		t.Fatal("backup receipt does not identify the completed file")
	}
}

func TestBackupRestoresLiveGalleryDraftPurchaseAndPrivateBytes(t *testing.T) {
	binary := galleryExecutable(t)
	server, provider, closeService, configuration, path, headers := paidDownloadFixture(t)
	owner := session(t, "owner@example.test", "gallery-test")
	response, body := request(t, server, "GET", "/gallery/draft", nil, owner, nil)
	requireStatus(t, response, body, 200)
	draft := decodeObject(t, body)
	draft["gallery"].(map[string]any)["description"] = "Private draft before backup."
	response, body = request(t, server, "PUT", "/gallery/draft", encodeObject(t, draft), owner, map[string]string{"Content-Type": "application/json", "If-Match": response.Header.Get("ETag")})
	requireStatus(t, response, body, 200)
	draftETag := response.Header.Get("ETag")
	if err := os.CopyFS(filepath.Join(configuration.PublicRoot, "gallery", "images"), os.DirFS(filepath.Join("..", "..", "gallery", "images"))); err != nil {
		t.Fatal(err)
	}
	response, body = request(t, server, "POST", "/gallery/publications", encodeObject(t, map[string]string{"baseCatalogDigest": catalogDigest(t, server), "draftEtag": draftETag}), owner, map[string]string{"Content-Type": "application/json"})
	requireStatus(t, response, body, 201)
	archiveURL := decodeObject(t, body)["archiveUrl"].(string)
	response, archive := request(t, server, "GET", archiveURL, nil, owner, nil)
	requireStatus(t, response, archive, 200)
	response, body = request(t, server, "POST", path+"/download-links", []byte(`{"offerId":"study-download"}`), nil, headers)
	requireStatus(t, response, body, 201)
	grant := decodeObject(t, body)
	reissueKey := uuid.NewString()
	response, body = request(t, server, "POST", path+"/access-reissues", []byte(`{"verifiedEmail":"buyer@example.test"}`), owner, buyerHeaders(reissueKey))
	requireStatus(t, response, body, 201)
	reissue := decodeObject(t, body)
	auditPath := response.Header.Get("Location")
	backup := filepath.Join(t.TempDir(), "purchase snapshot.db")
	snapshotCommand(t, binary, "backup", configuration.DatabasePath, backup)
	draft["gallery"].(map[string]any)["description"] = "Later change outside backup."
	response, body = request(t, server, "PUT", "/gallery/draft", encodeObject(t, draft), owner, map[string]string{"Content-Type": "application/json", "If-Match": draftETag})
	requireStatus(t, response, body, 200)
	closeService()
	restored := filepath.Join(t.TempDir(), "restored gallery.db")
	snapshotCommand(t, binary, "restore", backup, restored)
	configuration.DatabasePath = restored
	service, err := gallery.New(configuration)
	if err != nil {
		t.Fatal(err)
	}
	defer service.Close()
	server = httptest.NewServer(service)
	defer server.Close()
	response, body = request(t, server, "GET", "/gallery/draft", nil, owner, nil)
	requireStatus(t, response, body, 200)
	if decodeObject(t, body)["gallery"].(map[string]any)["description"] != "Private draft before backup." || response.Header.Get("ETag") != draftETag {
		t.Fatal("restored draft or revision differs from snapshot")
	}
	response, body = request(t, server, "GET", path, nil, nil, headers)
	requireStatus(t, response, body, 200)
	order := decodeObject(t, body)
	if order["status"] != "complete" || order["receipt"].(map[string]any)["status"] != "pending" || len(order["entitlements"].([]any)) != 1 {
		t.Fatal("restored purchase lost payment, receipt, or entitlement")
	}
	response, body = request(t, server, "GET", grant["download"].(map[string]any)["href"].(string), nil, nil, map[string]string{"Authorization": "Bearer " + grant["accessSecret"].(string)})
	requireStatus(t, response, body, 200)
	if !bytes.Equal(body, pngImage(t, 20, 30)) {
		t.Fatal("restored download changed purchased bytes")
	}
	response, body = request(t, server, "GET", auditPath, nil, owner, nil)
	requireStatus(t, response, body, 200)
	if !reflect.DeepEqual(decodeObject(t, body), reissue["reissue"]) {
		t.Fatal("restored audit record differs")
	}
	response, body = request(t, server, "POST", path+"/access-reissues", []byte(`{"verifiedEmail":"buyer@example.test"}`), owner, buyerHeaders(reissueKey))
	requireStatus(t, response, body, 200)
	if !reflect.DeepEqual(decodeObject(t, body), reissue) {
		t.Fatal("restored retry lost access reissue identity")
	}
	response, body = request(t, server, "POST", path+"/captures", []byte(`{}`), nil, headers)
	requireStatus(t, response, body, 200)
	response, body = request(t, server, "GET", archiveURL, nil, owner, nil)
	requireStatus(t, response, body, 200)
	if !bytes.Equal(body, archive) {
		t.Fatal("restored publication archive differs from snapshot")
	}
	event := completedEvent(t, "DOWNLOAD-COMPLETED")
	response, body = request(t, server, "POST", "/gallery/payment-events", event, nil, webhookHeaders(event))
	requireStatus(t, response, body, 204)
	provider.mutex.Lock()
	defer provider.mutex.Unlock()
	if len(provider.captureKeys) != 1 {
		t.Fatal("restoration caused another payment capture")
	}
}

func TestBackupCommandsRejectOverwriteMissingAndInvalidSources(t *testing.T) {
	binary := galleryExecutable(t)
	source := filepath.Join(t.TempDir(), "gallery.db")
	_, closeService := start(t, source)
	defer closeService()
	directory := t.TempDir()
	bad := filepath.Join(directory, "invalid.db")
	writeTestFile(t, bad, []byte("not a SQLite database"))
	output := filepath.Join(directory, "existing.db")
	original := []byte("preserve the existing destination")
	writeTestFile(t, output, original)
	for _, operation := range []string{"backup", "restore"} {
		for _, input := range []string{source, filepath.Join(directory, "missing.db"), bad} {
			args := []string{operation, "--database", input, "--output", output}
			if operation == "restore" {
				args = []string{operation, "--backup", input, "--database", output}
			}
			result, err := exec.Command(binary, args...).CombinedOutput()
			if err == nil {
				t.Fatal("invalid snapshot command succeeded")
			}
			if strings.Contains(string(result), string(original)) {
				t.Fatal("snapshot error exposed file contents")
			}
			contents, err := os.ReadFile(output)
			if err != nil || !bytes.Equal(contents, original) {
				t.Fatal("failed snapshot changed existing output")
			}
		}
	}
	if _, err := os.ReadFile(filepath.Join(directory, "missing.db")); !os.IsNotExist(err) {
		t.Fatal("backup created its missing source")
	}
	for _, operation := range []string{"backup", "restore"} {
		for _, input := range []string{filepath.Join(directory, "missing.db"), bad} {
			destination := filepath.Join(t.TempDir(), "new.db")
			args := []string{operation, "--database", input, "--output", destination}
			if operation == "restore" {
				args = []string{operation, "--backup", input, "--database", destination}
			}
			if _, err := exec.Command(binary, args...).CombinedOutput(); err == nil {
				t.Fatal("invalid source produced a snapshot")
			}
			entries, err := os.ReadDir(filepath.Dir(destination))
			if err != nil || len(entries) != 0 {
				t.Fatal("failed backup left an output or temporary file")
			}
		}
	}
}

func TestBackupRejectsSchemaDriftForeignKeysAndExistingJournals(t *testing.T) {
	binary := galleryExecutable(t)
	source := filepath.Join(t.TempDir(), "gallery.db")
	_, closeService := start(t, source)
	defer closeService()
	backup := filepath.Join(t.TempDir(), "backup.db")
	snapshotCommand(t, binary, "backup", source, backup)
	pristine, err := os.ReadFile(backup)
	if err != nil {
		t.Fatal(err)
	}
	for _, example := range []struct{ name, statement, message string }{
		{"schema", `ALTER TABLE orders ADD COLUMN obsolete_field TEXT`, "snapshot schema differs"},
		{"foreign-key", `INSERT INTO entitlements(order_id,offer_id,revision,status) VALUES('missing','test','missing','active')`, "invalid foreign keys"},
	} {
		t.Run(example.name, func(t *testing.T) {
			input := filepath.Join(t.TempDir(), "changed.db")
			writeTestFile(t, input, pristine)
			database, err := sql.Open("sqlite", input)
			if err != nil {
				t.Fatal(err)
			}
			if _, err := database.Exec(example.statement); err != nil {
				database.Close()
				t.Fatal(err)
			}
			if err := database.Close(); err != nil {
				t.Fatal(err)
			}
			destination := filepath.Join(t.TempDir(), "restored.db")
			result, err := exec.Command(binary, "restore", "--backup", input, "--database", destination).CombinedOutput()
			if err == nil || !strings.Contains(string(result), example.message) {
				t.Fatalf("invalid backup was not rejected at its boundary: %v: %s", err, result)
			}
			entries, err := os.ReadDir(filepath.Dir(destination))
			if err != nil || len(entries) != 0 {
				t.Fatal("invalid restore exposed an output or temporary file")
			}
		})
	}
	for _, suffix := range []string{"-wal", "-shm", "-journal"} {
		destination := filepath.Join(t.TempDir(), "restored.db")
		writeTestFile(t, destination+suffix, []byte("existing journal"))
		result, err := exec.Command(binary, "restore", "--backup", backup, "--database", destination).CombinedOutput()
		if err == nil || !strings.Contains(string(result), "destination already exists") {
			t.Fatal("restore accepted an existing journal")
		}
		if _, err := os.ReadFile(destination); !os.IsNotExist(err) {
			t.Fatal("restore created a database beside an existing journal")
		}
	}
}
