package gallery_test

import (
	"bytes"
	"fmt"
	gallery "github.com/tyemirov/tyemirov.github.io/services/gallery"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
)

func completedEvent(t *testing.T, id string) []byte {
	return encodeObject(t, map[string]any{"id": id, "event_type": "PAYMENT.CAPTURE.COMPLETED", "resource": map[string]any{"id": "CAPTURE1", "status": "COMPLETED", "amount": map[string]string{"currency_code": "USD", "value": "12.50"}, "supplementary_data": map[string]any{"related_ids": map[string]string{"order_id": "PROVIDERORDER1"}}}})
}
func webhookHeaders(body []byte) map[string]string {
	return map[string]string{"Content-Type": "application/json", "Paypal-Auth-Algo": "SHA256withRSA", "Paypal-Cert-Url": "https://provider.example.test/certificate", "Paypal-Transmission-Id": "test-transmission", "Paypal-Transmission-Time": "2026-09-09T00:00:00Z", "Paypal-Transmission-Sig": eventSignature(body), "Origin": ""}
}
func TestPaymentCompletionRequiresVerifiedWebhookAndMatchingProviderOrder(t *testing.T) {
	server, provider, closeService, _ := saleFixture(t)
	defer closeService()
	res, payload := request(t, server, "POST", "/gallery/orders", buyerPayload(t, server, "buyer@example.test", []string{"study-download"}), nil, buyerHeaders("7592f871-d431-44e6-9a94-1298270eaecc"))
	requireStatus(t, res, payload, 201)
	created := decodeObject(t, payload)
	id := created["order"].(map[string]any)["id"].(string)
	headers := map[string]string{"Content-Type": "application/json", "Authorization": "Bearer " + created["accessSecret"].(string)}
	res, payload = request(t, server, "POST", "/gallery/orders/"+id+"/captures", []byte(`{"status":"COMPLETED"}`), nil, headers)
	requireStatus(t, res, payload, 400)
	res, payload = request(t, server, "POST", "/gallery/orders/"+id+"/captures", []byte(`{}`), nil, headers)
	requireStatus(t, res, payload, 202)
	if decodeObject(t, payload)["status"] != "payment-pending" {
		t.Fatal("browser capture callback granted payment completion")
	}
	res, payload = request(t, server, "POST", "/gallery/orders/"+id+"/download-links", []byte(`{"offerId":"study-download"}`), nil, headers)
	requireStatus(t, res, payload, 403)
	event := completedEvent(t, "EVENT1")
	provider.mutex.Lock()
	provider.verificationUnavailable = true
	provider.mutex.Unlock()
	res, payload = request(t, server, "POST", "/gallery/payment-events", event, nil, webhookHeaders(event))
	requireStatus(t, res, payload, 503)
	provider.mutex.Lock()
	provider.verificationUnavailable = false
	provider.mutex.Unlock()
	invalidHeaders := webhookHeaders(event)
	invalidHeaders["Paypal-Transmission-Sig"] = "incorrect"
	res, payload = request(t, server, "POST", "/gallery/payment-events", event, nil, invalidHeaders)
	requireStatus(t, res, payload, 400)
	for _, subject := range []string{"payee", "amount", "currency", "order"} {
		provider.mutex.Lock()
		provider.wrongPayee = subject == "payee"
		provider.wrongAmount = subject == "amount"
		provider.wrongCurrency = subject == "currency"
		provider.wrongOrder = subject == "order"
		provider.mutex.Unlock()
		res, payload = request(t, server, "POST", "/gallery/payment-events", event, nil, webhookHeaders(event))
		requireStatus(t, res, payload, 422)
	}
	provider.mutex.Lock()
	provider.wrongPayee = false
	provider.wrongAmount = false
	provider.wrongCurrency = false
	provider.wrongOrder = false
	provider.compactAmount = true
	provider.mutex.Unlock()
	res, payload = request(t, server, "POST", "/gallery/payment-events", event, nil, webhookHeaders(event))
	requireStatus(t, res, payload, 204)
	res, payload = request(t, server, "GET", "/gallery/orders/"+id, nil, nil, headers)
	requireStatus(t, res, payload, 200)
	paid := decodeObject(t, payload)
	if paid["status"] != "complete" || len(paid["entitlements"].([]any)) != 1 {
		t.Fatal("verified completion did not create one entitlement")
	}
	res, payload = request(t, server, "POST", "/gallery/payment-events", event, nil, webhookHeaders(event))
	requireStatus(t, res, payload, 204)
	res, payload = request(t, server, "POST", "/gallery/orders/"+id+"/captures", []byte(`{}`), nil, headers)
	requireStatus(t, res, payload, http.StatusOK)
	provider.mutex.Lock()
	defer provider.mutex.Unlock()
	if len(provider.captureKeys) != 1 {
		t.Fatal("duplicate capture request called the provider again")
	}
}

func TestConcurrentCaptureRequestsCreateOneProviderCapture(t *testing.T) {
	server, provider, closeService, _ := saleFixture(t)
	defer closeService()
	res, payload := request(t, server, "POST", "/gallery/orders", buyerPayload(t, server, "buyer@example.test", []string{"study-download"}), nil, buyerHeaders("fd890744-3849-45f7-826d-48134c45678f"))
	requireStatus(t, res, payload, 201)
	created := decodeObject(t, payload)
	id := created["order"].(map[string]any)["id"].(string)
	secret := created["accessSecret"].(string)
	start := make(chan struct{})
	results := make(chan error, 8)
	for index := 0; index < 8; index++ {
		go func() {
			<-start
			req, err := http.NewRequest(http.MethodPost, server.URL+"/gallery/orders/"+id+"/captures", bytes.NewBufferString(`{}`))
			if err != nil {
				results <- err
				return
			}
			req.Header.Set("Origin", ownerOrigin)
			req.Header.Set("Content-Type", "application/json")
			req.Header.Set("Authorization", "Bearer "+secret)
			reply, err := server.Client().Do(req)
			if err != nil {
				results <- err
				return
			}
			_, readErr := io.Copy(io.Discard, reply.Body)
			closeErr := reply.Body.Close()
			if reply.StatusCode != 202 {
				results <- fmt.Errorf("concurrent capture returned HTTP %d", reply.StatusCode)
			} else if readErr != nil {
				results <- readErr
			} else {
				results <- closeErr
			}
		}()
	}
	close(start)
	for index := 0; index < 8; index++ {
		if err := <-results; err != nil {
			t.Error(err)
		}
	}
	provider.mutex.Lock()
	defer provider.mutex.Unlock()
	if len(provider.captureKeys) != 1 {
		t.Fatalf("concurrent capture requests reached provider %d times", len(provider.captureKeys))
	}
}
func TestUnknownCaptureResultSurvivesRestartWithoutAnotherCapture(t *testing.T) {
	server, provider, closeService, configuration := saleFixture(t)
	provider.mutex.Lock()
	provider.dropFirstCapture = true
	provider.mutex.Unlock()
	res, payload := request(t, server, "POST", "/gallery/orders", buyerPayload(t, server, "buyer@example.test", []string{"study-download"}), nil, buyerHeaders("0d7da5e4-22f6-4d36-a9f9-35d508720f51"))
	requireStatus(t, res, payload, 201)
	created := decodeObject(t, payload)
	id := created["order"].(map[string]any)["id"].(string)
	headers := map[string]string{"Content-Type": "application/json", "Authorization": "Bearer " + created["accessSecret"].(string)}
	res, payload = request(t, server, "POST", "/gallery/orders/"+id+"/captures", []byte(`{}`), nil, headers)
	requireStatus(t, res, payload, 202)
	if decodeObject(t, payload)["status"] != "payment-pending" {
		t.Fatal("unknown capture became final")
	}
	closeService()
	service, err := gallery.New(configuration)
	if err != nil {
		t.Fatal(err)
	}
	server = httptest.NewServer(service)
	defer server.Close()
	defer service.Close()
	res, payload = request(t, server, "POST", "/gallery/orders/"+id+"/captures", []byte(`{}`), nil, headers)
	requireStatus(t, res, payload, 202)
	event := completedEvent(t, "RESTART-EVENT")
	res, payload = request(t, server, "POST", "/gallery/payment-events", event, nil, webhookHeaders(event))
	requireStatus(t, res, payload, 204)
	res, payload = request(t, server, "GET", "/gallery/orders/"+id, nil, nil, headers)
	requireStatus(t, res, payload, 200)
	if decodeObject(t, payload)["status"] != "complete" {
		t.Fatal("delayed verified event did not complete the purchase")
	}
	provider.mutex.Lock()
	defer provider.mutex.Unlock()
	if len(provider.captureKeys) != 1 {
		t.Fatal("uncertain capture was charged again after restart")
	}
}
