package gallery_test

import (
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	gallery "github.com/tyemirov/tyemirov.github.io/services/gallery"
)

func awaitOrderStatus(t *testing.T, server *httptest.Server, path string, headers map[string]string, expected string) {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for {
		res, body := request(t, server, "GET", path, nil, nil, headers)
		requireStatus(t, res, body, 200)
		if decodeObject(t, body)["status"] == expected {
			return
		}
		if time.Now().After(deadline) {
			t.Fatalf("order did not reach %s: %s", expected, body)
		}
		time.Sleep(10 * time.Millisecond)
	}
}

func TestStoredVerifiedEventResumesAfterServiceRestart(t *testing.T) {
	server, provider, closeService, configuration := saleFixture(t)
	defer func() {
		if closeService != nil {
			closeService()
		}
	}()
	res, payload := request(t, server, "POST", "/gallery/orders", buyerPayload(t, server, "buyer@example.test", []string{"study-download"}), nil, buyerHeaders("d456766b-a7a6-4335-a11c-2e39a913295d"))
	requireStatus(t, res, payload, 201)
	created := decodeObject(t, payload)
	path := "/gallery/orders/" + created["order"].(map[string]any)["id"].(string)
	headers := map[string]string{"Content-Type": "application/json", "Authorization": "Bearer " + created["accessSecret"].(string)}
	res, payload = request(t, server, "POST", path+"/captures", []byte(`{}`), nil, headers)
	requireStatus(t, res, payload, 202)
	provider.mutex.Lock()
	provider.readUnavailable = true
	provider.mutex.Unlock()
	event := completedEvent(t, "RESUME-VERIFIED-EVENT")
	res, payload = request(t, server, "POST", "/gallery/payment-events", event, nil, webhookHeaders(event))
	requireStatus(t, res, payload, 503)
	closeService()
	closeService = nil
	provider.mutex.Lock()
	provider.readUnavailable = false
	provider.verificationUnavailable = true
	provider.mutex.Unlock()
	configuration.Now = func() time.Time { return time.Now().Add(2 * time.Minute) }
	service, err := gallery.New(configuration)
	if err != nil {
		t.Fatal(err)
	}
	server = httptest.NewServer(service)
	defer server.Close()
	defer service.Close()
	awaitOrderStatus(t, server, path, headers, "complete")
	res, payload = request(t, server, "POST", path+"/download-links", []byte(`{"offerId":"study-download"}`), nil, headers)
	requireStatus(t, res, payload, 201)
	provider.mutex.Lock()
	defer provider.mutex.Unlock()
	if len(provider.captureKeys) != 1 {
		t.Fatal("event recovery repeated a capture")
	}
}

func TestStoredRefundRetriesAfterOutageWithoutWebhookRedelivery(t *testing.T) {
	server, provider, closeService, configuration, path, headers := paidDownloadFixture(t)
	provider.mutex.Lock()
	provider.refundStatus, provider.refundValue, provider.refundCapture = "COMPLETED", "12.50", "CAPTURE1"
	provider.readUnavailable = true
	provider.mutex.Unlock()
	event := encodeObject(t, map[string]any{"id": "RETRY-REFUND", "event_type": "PAYMENT.CAPTURE.REFUNDED", "resource": map[string]any{"id": "REFUND1", "status": "COMPLETED", "amount": map[string]string{"currency_code": "USD", "value": "12.50"}}})
	res, payload := request(t, server, "POST", "/gallery/payment-events", event, nil, webhookHeaders(event))
	requireStatus(t, res, payload, 503)
	closeService()
	provider.mutex.Lock()
	baseline := provider.readCount
	provider.verificationUnavailable = true
	provider.mutex.Unlock()
	var clock atomic.Int64
	initial := time.Now().Add(2 * time.Minute)
	clock.Store(initial.UnixNano())
	configuration.Now = func() time.Time { return time.Unix(0, clock.Load()) }
	configuration.ReconcileInterval = 10 * time.Millisecond
	service, err := gallery.New(configuration)
	if err != nil {
		t.Fatal(err)
	}
	server = httptest.NewServer(service)
	defer server.Close()
	defer service.Close()
	deadline := time.Now().Add(3 * time.Second)
	for {
		provider.mutex.Lock()
		attempts := provider.readCount
		provider.mutex.Unlock()
		if attempts > baseline {
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("stored refund was not retried")
		}
		time.Sleep(10 * time.Millisecond)
	}
	// Repeated scheduler ticks must retain the persisted retry delay.
	time.Sleep(30 * time.Millisecond)
	provider.mutex.Lock()
	if provider.readCount != baseline+1 {
		provider.mutex.Unlock()
		t.Fatal("provider outage caused a retry loop")
	}
	provider.readUnavailable = false
	provider.mutex.Unlock()
	clock.Store(initial.Add(time.Minute).UnixNano())
	awaitOrderStatus(t, server, path, headers, "revoked")
	res, payload = request(t, server, "POST", path+"/download-links", []byte(`{"offerId":"study-download"}`), nil, headers)
	requireStatus(t, res, payload, 403)
}

func TestVerifiedEventAssociatesOrderAfterLostCreationResponse(t *testing.T) {
	server, provider, closeService, _ := saleFixture(t)
	defer closeService()
	provider.mutex.Lock()
	provider.dropFirstCreate = true
	provider.mutex.Unlock()
	body := buyerPayload(t, server, "buyer@example.test", []string{"study-download"})
	const key = "a8023fa7-38ad-4639-9c97-6e114624bb03"
	res, payload := request(t, server, "POST", "/gallery/orders", body, nil, buyerHeaders(key))
	requireStatus(t, res, payload, 201)
	created := decodeObject(t, payload)
	path := "/gallery/orders/" + created["order"].(map[string]any)["id"].(string)
	headers := map[string]string{"Content-Type": "application/json", "Authorization": "Bearer " + created["accessSecret"].(string)}
	provider.mutex.Lock()
	provider.captured = true
	provider.wrongPayee = true
	provider.mutex.Unlock()
	event := completedEvent(t, "LOST-CREATION-COMPLETED")
	res, payload = request(t, server, "POST", "/gallery/payment-events", event, nil, webhookHeaders(event))
	requireStatus(t, res, payload, 422)
	provider.mutex.Lock()
	provider.wrongPayee = false
	provider.mutex.Unlock()
	res, payload = request(t, server, "POST", "/gallery/payment-events", event, nil, webhookHeaders(event))
	requireStatus(t, res, payload, 204)
	awaitOrderStatus(t, server, path, headers, "complete")
	res, payload = request(t, server, "POST", "/gallery/orders", body, nil, buyerHeaders(key))
	requireStatus(t, res, payload, 200)
	if decodeObject(t, payload)["order"].(map[string]any)["status"] != "complete" {
		t.Fatal("creation retry lost recovered payment")
	}
	provider.mutex.Lock()
	defer provider.mutex.Unlock()
	if len(provider.createKeys) != 1 || len(provider.captureKeys) != 0 {
		t.Fatal("event association repeated a provider mutation")
	}
}

func TestRefundCanPrecedeCompletionAfterLostCaptureResponse(t *testing.T) {
	server, provider, closeService, _ := saleFixture(t)
	defer closeService()
	provider.mutex.Lock()
	provider.dropFirstCapture = true
	provider.mutex.Unlock()
	res, payload := request(t, server, "POST", "/gallery/orders", buyerPayload(t, server, "buyer@example.test", []string{"study-download"}), nil, buyerHeaders("1ec6d016-e82c-4e0a-89d5-f089fa8cbb15"))
	requireStatus(t, res, payload, 201)
	created := decodeObject(t, payload)
	path := "/gallery/orders/" + created["order"].(map[string]any)["id"].(string)
	headers := map[string]string{"Content-Type": "application/json", "Authorization": "Bearer " + created["accessSecret"].(string)}
	res, payload = request(t, server, "POST", path+"/captures", []byte(`{}`), nil, headers)
	requireStatus(t, res, payload, 202)
	provider.mutex.Lock()
	provider.refundStatus, provider.refundValue, provider.refundCapture = "COMPLETED", "12.50", "CAPTURE1"
	provider.captureStatus = "REFUNDED"
	provider.mutex.Unlock()
	event := encodeObject(t, map[string]any{"id": "REFUND-LOST-CAPTURE", "event_type": "PAYMENT.CAPTURE.REFUNDED", "resource": map[string]any{"id": "REFUND1", "status": "COMPLETED", "amount": map[string]string{"currency_code": "USD", "value": "12.50"}}})
	res, payload = request(t, server, "POST", "/gallery/payment-events", event, nil, webhookHeaders(event))
	requireStatus(t, res, payload, 204)
	awaitOrderStatus(t, server, path, headers, "revoked")
	event = completedEvent(t, "COMPLETED-AFTER-LOST-CAPTURE-REFUND")
	res, payload = request(t, server, "POST", "/gallery/payment-events", event, nil, webhookHeaders(event))
	requireStatus(t, res, payload, 204)
	res, payload = request(t, server, "POST", path+"/download-links", []byte(`{"offerId":"study-download"}`), nil, headers)
	requireStatus(t, res, payload, 403)
}

func TestClosingServiceCancelsActiveEventReconciliation(t *testing.T) {
	server, provider, closeService, configuration, path, headers := paidDownloadFixture(t)
	provider.mutex.Lock()
	provider.readUnavailable = true
	provider.mutex.Unlock()
	// Use another verified event so the already processed completion does not
	// make this request a no-op.
	event := completedEvent(t, "SHUTDOWN-RECONCILIATION")
	res, payload := request(t, server, "POST", "/gallery/payment-events", event, nil, webhookHeaders(event))
	requireStatus(t, res, payload, 503)
	closeService()
	started, release := make(chan struct{}, 1), make(chan struct{})
	defer close(release)
	provider.mutex.Lock()
	provider.readUnavailable = false
	provider.readStarted = started
	provider.readRelease = release
	provider.mutex.Unlock()
	configuration.Now = func() time.Time { return time.Now().Add(2 * time.Minute) }
	service, err := gallery.New(configuration)
	if err != nil {
		t.Fatal(err)
	}
	server = httptest.NewServer(service)
	defer server.Close()
	select {
	case <-started:
	case <-time.After(3 * time.Second):
		t.Fatal("reconciliation did not reach provider")
	}
	// HTTP reads remain available while the worker waits at the provider.
	res, payload = request(t, server, "GET", path, nil, nil, headers)
	requireStatus(t, res, payload, 200)
	finished := make(chan error, 1)
	go func() { finished <- service.Close() }()
	select {
	case err := <-finished:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("service shutdown did not cancel reconciliation")
	}
}
