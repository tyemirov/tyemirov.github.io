package gallery_test

import (
	"bytes"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	gallery "github.com/tyemirov/tyemirov.github.io/services/gallery"
)

func paidDownloadFixture(t *testing.T) (*httptest.Server, *paymentFixture, func(), gallery.Config, string, map[string]string) {
	t.Helper()
	server, provider, closeService, configuration := saleFixture(t)
	t.Cleanup(func() {
		if closeService != nil {
			closeService()
		}
	})
	res, payload := request(t, server, "POST", "/gallery/orders", buyerPayload(t, server, "buyer@example.test", []string{"study-download"}), nil, buyerHeaders("3e19b11b-bdcb-4f0c-a3e5-1b629e385cb4"))
	requireStatus(t, res, payload, 201)
	created := decodeObject(t, payload)
	path := "/gallery/orders/" + created["order"].(map[string]any)["id"].(string)
	headers := map[string]string{"Content-Type": "application/json", "Authorization": "Bearer " + created["accessSecret"].(string)}
	res, payload = request(t, server, "POST", path+"/captures", []byte(`{}`), nil, headers)
	requireStatus(t, res, payload, 202)
	event := completedEvent(t, "DOWNLOAD-COMPLETED")
	res, payload = request(t, server, "POST", "/gallery/payment-events", event, nil, webhookHeaders(event))
	requireStatus(t, res, payload, 204)
	return server, provider, func() { closeService(); closeService = nil }, configuration, path, headers
}

func TestProtectedDownloadKeepsPurchasedRevisionAndHonorsRefund(t *testing.T) {
	server, provider, closeService, configuration, path, headers := paidDownloadFixture(t)
	// Replace the public offer with a new uploaded master after purchase.
	owner := session(t, "owner@example.test", "gallery-test")
	res, payload := request(t, server, "POST", "/gallery/assets", pngImage(t, 40, 50), owner, map[string]string{"Content-Type": "image/png"})
	requireStatus(t, res, payload, 201)
	replacement := decodeObject(t, payload)
	source, err := os.ReadFile(filepath.Join(configuration.PublicRoot, "data", "site.json"))
	if err != nil {
		t.Fatal(err)
	}
	site := decodeObject(t, source)
	sale := site["gallery"].(map[string]any)["artworks"].([]any)[0].(map[string]any)["offer"].(map[string]any)
	sale["revision"] = replacement["id"]
	sale["file"].(map[string]any)["width"], sale["file"].(map[string]any)["height"] = 40, 50
	writeTestFile(t, filepath.Join(configuration.PublicRoot, "data", "site.json"), encodeObject(t, site))
	before := time.Now()
	res, payload = request(t, server, "POST", path+"/download-links", []byte(`{"offerId":"study-download"}`), nil, headers)
	requireStatus(t, res, payload, 201)
	created := decodeObject(t, payload)
	link := created["download"].(map[string]any)
	resource, secret := link["href"].(string), created["accessSecret"].(string)
	if res.Header.Get("Location") != resource || !strings.HasPrefix(resource, "/gallery/downloads/") || strings.Contains(resource, secret) || len(secret) != 43 {
		t.Fatal("download resource exposes its access secret or lacks Location")
	}
	expires, err := time.Parse(time.RFC3339Nano, link["expiresAt"].(string))
	if err != nil || expires.Before(before.Add(10*time.Minute)) || expires.After(time.Now().Add(10*time.Minute)) {
		t.Fatal("download lifetime is not ten minutes")
	}
	access := map[string]string{"Authorization": "Bearer " + secret}
	res, payload = request(t, server, "GET", resource, nil, nil, nil)
	requireStatus(t, res, payload, 401)
	res, payload = request(t, server, "GET", resource, nil, nil, headers)
	requireStatus(t, res, payload, 401)
	res, payload = request(t, server, "GET", resource+"?accessSecret="+secret, nil, nil, nil)
	requireStatus(t, res, payload, 400)
	closeService()
	service, err := gallery.New(configuration)
	if err != nil {
		t.Fatal(err)
	}
	server = httptest.NewServer(service)
	defer server.Close()
	defer service.Close()
	res, payload = request(t, server, "GET", resource, nil, nil, access)
	requireStatus(t, res, payload, 200)
	if !bytes.Equal(payload, pngImage(t, 20, 30)) || res.Header.Get("Content-Type") != "image/png" || !strings.HasPrefix(res.Header.Get("Content-Disposition"), "attachment;") || res.Header.Get("Cache-Control") != "no-store" {
		t.Fatal("download did not return the exact private purchased bytes as an uncached attachment")
	}
	etag := res.Header.Get("ETag")
	res, payload = request(t, server, "GET", resource, nil, nil, map[string]string{"Authorization": "Bearer " + secret, "Range": "bytes=999999999-"})
	requireStatus(t, res, payload, 416)
	if res.Header.Get("Cache-Control") != "no-store" || res.Header.Get("Content-Type") != "application/json" || decodeObject(t, payload)["code"] == nil {
		t.Fatal("range rejection escaped the uncached JSON error contract")
	}
	res, payload = request(t, server, "GET", resource, nil, nil, map[string]string{"Authorization": "Bearer " + secret, "If-Match": `"another-revision"`})
	requireStatus(t, res, payload, 412)
	if res.Header.Get("Cache-Control") != "no-store" || res.Header.Get("Content-Type") != "application/json" || decodeObject(t, payload)["code"] == nil {
		t.Fatal("precondition rejection escaped the uncached JSON error contract")
	}
	res, payload = request(t, server, "GET", resource, nil, nil, map[string]string{"Authorization": "Bearer " + secret, "Range": "bytes=0-7"})
	requireStatus(t, res, payload, 206)
	if !bytes.Equal(payload, pngImage(t, 20, 30)[:8]) || !strings.HasPrefix(res.Header.Get("Content-Range"), "bytes 0-7/") {
		t.Fatal("range did not select the purchased bytes")
	}
	res, payload = request(t, server, "HEAD", resource, nil, nil, access)
	requireStatus(t, res, payload, 200)
	if len(payload) != 0 {
		t.Fatal("HEAD returned file bytes")
	}
	provider.mutex.Lock()
	provider.refundStatus, provider.refundValue, provider.refundCapture = "COMPLETED", "12.50", "CAPTURE1"
	provider.mutex.Unlock()
	event := encodeObject(t, map[string]any{"id": "DOWNLOAD-REFUND", "event_type": "PAYMENT.CAPTURE.REFUNDED", "resource": map[string]any{"id": "REFUND1", "status": "COMPLETED", "amount": map[string]string{"currency_code": "USD", "value": "12.50"}}})
	res, payload = request(t, server, "POST", "/gallery/payment-events", event, nil, webhookHeaders(event))
	requireStatus(t, res, payload, 204)
	res, payload = request(t, server, "GET", resource, nil, nil, access)
	requireStatus(t, res, payload, 403)
	res, payload = request(t, server, "GET", resource, nil, nil, map[string]string{"Authorization": "Bearer " + secret, "If-None-Match": etag})
	requireStatus(t, res, payload, 403)
	res, payload = request(t, server, "POST", path+"/download-links", []byte(`{"offerId":"study-download"}`), nil, headers)
	requireStatus(t, res, payload, 403)
}

func TestDownloadExpiresAtTenMinutesAndOrderCanRenew(t *testing.T) {
	_, _, closeService, configuration, path, headers := paidDownloadFixture(t)
	closeService()
	var clock atomic.Int64
	initial := time.Date(2026, 9, 9, 12, 0, 0, 0, time.UTC)
	clock.Store(initial.UnixNano())
	configuration.Now = func() time.Time { return time.Unix(0, clock.Load()) }
	service, err := gallery.New(configuration)
	if err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(service)
	defer server.Close()
	defer service.Close()
	res, payload := request(t, server, "POST", path+"/download-links", []byte(`{"offerId":"not-purchased"}`), nil, headers)
	requireStatus(t, res, payload, 403)
	res, payload = request(t, server, "POST", path+"/download-links", []byte(`{"offerId":"study-download","expiresAt":"2099-01-01T00:00:00Z"}`), nil, headers)
	requireStatus(t, res, payload, 400)
	res, payload = request(t, server, "POST", path+"/download-links", []byte(`{"offerId":"study-download"}`), nil, headers)
	requireStatus(t, res, payload, 201)
	created := decodeObject(t, payload)
	link := created["download"].(map[string]any)
	resource := link["href"].(string)
	access := map[string]string{"Authorization": "Bearer " + created["accessSecret"].(string)}
	if link["expiresAt"] != "2026-09-09T12:10:00Z" {
		t.Fatal("grant expiry does not use the ten-minute contract")
	}
	clock.Store(initial.Add(10*time.Minute - time.Nanosecond).UnixNano())
	res, payload = request(t, server, "GET", resource, nil, nil, access)
	requireStatus(t, res, payload, 200)
	clock.Store(initial.Add(10 * time.Minute).UnixNano())
	res, payload = request(t, server, "GET", resource, nil, nil, access)
	requireStatus(t, res, payload, 410)
	res, payload = request(t, server, "HEAD", resource, nil, nil, access)
	requireStatus(t, res, payload, 410)
	clock.Store(initial.AddDate(1, 0, 0).UnixNano())
	res, payload = request(t, server, "POST", path+"/download-links", []byte(`{"offerId":"study-download"}`), nil, headers)
	requireStatus(t, res, payload, 201)
	renewed := decodeObject(t, payload)
	next := renewed["download"].(map[string]any)
	if next["id"] == link["id"] || next["revision"] != link["revision"] || next["expiresAt"] != "2027-09-09T12:10:00Z" {
		t.Fatal("renewal changed the purchased revision or reused the expired grant")
	}
	renewedAccess := map[string]string{"Authorization": "Bearer " + renewed["accessSecret"].(string)}
	res, payload = request(t, server, "GET", resource, nil, nil, renewedAccess)
	requireStatus(t, res, payload, 401)
	res, payload = request(t, server, "GET", next["href"].(string), nil, nil, renewedAccess)
	requireStatus(t, res, payload, 200)
	if !bytes.Equal(payload, pngImage(t, 20, 30)) {
		t.Fatal("renewed grant changed the purchased bytes")
	}
}
