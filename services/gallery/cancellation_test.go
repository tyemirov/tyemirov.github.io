package gallery_test

import (
	"bytes"
	"io"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	gallery "github.com/tyemirov/tyemirov.github.io/services/gallery"
)

func TestOrderCancellationPersistsAndPreventsCapture(t *testing.T) {
	server, provider, closeService, configuration := saleFixture(t)
	initialClose := closeService
	var closeOnce sync.Once
	closeService = func() { closeOnce.Do(initialClose) }
	defer closeService()
	const key = "26d995a9-b55d-4a6a-adfc-1e898073024f"
	body := buyerPayload(t, server, "buyer@example.test", []string{"study-download"})
	res, payload := request(t, server, "POST", "/gallery/orders", body, nil, buyerHeaders(key))
	requireStatus(t, res, payload, 201)
	created := decodeObject(t, payload)
	path := "/gallery/orders/" + created["order"].(map[string]any)["id"].(string)
	headers := map[string]string{"Content-Type": "application/json", "Authorization": "Bearer " + created["accessSecret"].(string)}
	res, payload = request(t, server, "PATCH", path, []byte(`{"status":"cancelled"}`), nil, nil)
	requireStatus(t, res, payload, 401)
	for _, invalid := range []struct {
		body   string
		status int
	}{{`{"status":"complete"}`, 422}, {`{"status":"revoked"}`, 422}, {`{"status":"cancelled","priceCents":1}`, 400}} {
		res, payload = request(t, server, "PATCH", path, []byte(invalid.body), nil, headers)
		requireStatus(t, res, payload, invalid.status)
	}
	res, payload = request(t, server, "PATCH", path, []byte(`{"status":"cancelled"}`), nil, headers)
	requireStatus(t, res, payload, 200)
	view := decodeObject(t, payload)
	if view["status"] != "cancelled" || view["approvalUrl"] != nil || len(view["entitlements"].([]any)) != 0 {
		t.Fatal("cancelled order retains payment approval or entitlements")
	}
	closeService()
	service, err := gallery.New(configuration)
	if err != nil {
		t.Fatal(err)
	}
	server = httptest.NewServer(service)
	defer server.Close()
	defer service.Close()
	res, payload = request(t, server, "PATCH", path, []byte(`{"status":"cancelled"}`), nil, headers)
	requireStatus(t, res, payload, 200)
	res, payload = request(t, server, "POST", path+"/captures", []byte(`{}`), nil, headers)
	requireStatus(t, res, payload, 409)
	res, payload = request(t, server, "POST", "/gallery/orders", body, nil, buyerHeaders(key))
	requireStatus(t, res, payload, 200)
	if decodeObject(t, payload)["order"].(map[string]any)["status"] != "cancelled" {
		t.Fatal("creation retry restored a cancelled order")
	}
	provider.mutex.Lock()
	defer provider.mutex.Unlock()
	if len(provider.captureKeys) != 0 || len(provider.createKeys) != 1 {
		t.Fatal("cancelled order reached the provider again")
	}
}

func TestCancellationCannotHideInFlightOrUnknownCapture(t *testing.T) {
	server, provider, closeService, _ := saleFixture(t)
	defer closeService()
	started, release := make(chan struct{}), make(chan struct{})
	var releaseOnce sync.Once
	defer releaseOnce.Do(func() { close(release) })
	provider.mutex.Lock()
	provider.captureStarted, provider.captureRelease = started, release
	provider.dropFirstCapture = true
	provider.mutex.Unlock()
	res, payload := request(t, server, "POST", "/gallery/orders", buyerPayload(t, server, "buyer@example.test", []string{"study-download"}), nil, buyerHeaders("fe4eaef1-787d-4b98-ae80-bafbdcdd5e47"))
	requireStatus(t, res, payload, 201)
	created := decodeObject(t, payload)
	path := "/gallery/orders/" + created["order"].(map[string]any)["id"].(string)
	headers := map[string]string{"Content-Type": "application/json", "Authorization": "Bearer " + created["accessSecret"].(string)}
	finished := make(chan *http.Response, 1)
	errors := make(chan error, 1)
	req, err := http.NewRequest("POST", server.URL+path+"/captures", bytes.NewBufferString(`{}`))
	if err != nil {
		t.Fatal(err)
	}
	for key, value := range headers {
		req.Header.Set(key, value)
	}
	req.Header.Set("Origin", ownerOrigin)
	go func() {
		response, err := server.Client().Do(req)
		if err != nil {
			errors <- err
			return
		}
		finished <- response
	}()
	select {
	case <-started:
	case err := <-errors:
		t.Fatal(err)
	case <-time.After(10 * time.Second):
		t.Fatal("capture did not reach the provider")
	}
	res, payload = request(t, server, "PATCH", path, []byte(`{"status":"cancelled"}`), nil, headers)
	requireStatus(t, res, payload, 409)
	releaseOnce.Do(func() { close(release) })
	select {
	case response := <-finished:
		data, err := io.ReadAll(response.Body)
		response.Body.Close()
		if err != nil {
			t.Fatal(err)
		}
		requireStatus(t, response, data, 202)
	case err := <-errors:
		t.Fatal(err)
	case <-time.After(10 * time.Second):
		t.Fatal("capture did not finish")
	}
	res, payload = request(t, server, "PATCH", path, []byte(`{"status":"cancelled"}`), nil, headers)
	requireStatus(t, res, payload, 409)
	event := completedEvent(t, "CANCEL-RACE-COMPLETION")
	res, payload = request(t, server, "POST", "/gallery/payment-events", event, nil, webhookHeaders(event))
	requireStatus(t, res, payload, 204)
	res, payload = request(t, server, "PATCH", path, []byte(`{"status":"cancelled"}`), nil, headers)
	requireStatus(t, res, payload, 409)
	res, payload = request(t, server, "GET", path, nil, nil, headers)
	requireStatus(t, res, payload, 200)
	if decodeObject(t, payload)["status"] != "complete" {
		t.Fatal("cancellation hid a completed payment")
	}
}
