package gallery_test

import (
	"net/http/httptest"
	"testing"

	gallery "github.com/tyemirov/tyemirov.github.io/services/gallery"
)

func TestVerifiedRefundRevokesAccessAcrossRestartAndDelayedCompletion(t *testing.T) {
	for _, completionFirst := range []bool{true, false} {
		name := "refund-before-completion"
		if completionFirst {
			name = "completion-before-refund"
		}
		t.Run(name, func(t *testing.T) {
			server, provider, closeService, configuration := saleFixture(t)
			defer func() {
				if closeService != nil {
					closeService()
				}
			}()
			res, payload := request(t, server, "POST", "/gallery/orders", buyerPayload(t, server, "buyer@example.test", []string{"study-download"}), nil, buyerHeaders("e78d4e08-84bb-47d2-88f9-f8593b8ef5b3"))
			requireStatus(t, res, payload, 201)
			created := decodeObject(t, payload)
			path := "/gallery/orders/" + created["order"].(map[string]any)["id"].(string)
			headers := map[string]string{"Content-Type": "application/json", "Authorization": "Bearer " + created["accessSecret"].(string)}
			res, payload = request(t, server, "POST", path+"/captures", []byte(`{}`), nil, headers)
			requireStatus(t, res, payload, 202)
			if completionFirst {
				event := completedEvent(t, "BEFORE-REFUND")
				res, payload = request(t, server, "POST", "/gallery/payment-events", event, nil, webhookHeaders(event))
				requireStatus(t, res, payload, 204)
			}
			// Even a partial completed refund revokes future access under the gallery contract.
			event := encodeObject(t, map[string]any{"id": "REFUND-EVENT", "event_type": "PAYMENT.CAPTURE.REFUNDED", "resource": map[string]any{"id": "REFUND1", "status": "COMPLETED", "amount": map[string]string{"currency_code": "USD", "value": "1.00"}}})
			provider.mutex.Lock()
			provider.refundStatus, provider.refundValue, provider.refundCapture = "COMPLETED", "1.0", "CAPTURE1"
			provider.mutex.Unlock()
			invalid := webhookHeaders(event)
			invalid["Paypal-Transmission-Sig"] = "invalid"
			res, payload = request(t, server, "POST", "/gallery/payment-events", event, nil, invalid)
			requireStatus(t, res, payload, 400)
			provider.mutex.Lock()
			provider.refundStatus = "PENDING"
			provider.mutex.Unlock()
			res, payload = request(t, server, "POST", "/gallery/payment-events", event, nil, webhookHeaders(event))
			requireStatus(t, res, payload, 422)
			provider.mutex.Lock()
			provider.refundStatus, provider.refundValue = "COMPLETED", "0.01"
			provider.mutex.Unlock()
			res, payload = request(t, server, "POST", "/gallery/payment-events", event, nil, webhookHeaders(event))
			requireStatus(t, res, payload, 422)
			provider.mutex.Lock()
			provider.refundValue, provider.refundCapture = "1.0", "OTHER1"
			provider.mutex.Unlock()
			res, payload = request(t, server, "POST", "/gallery/payment-events", event, nil, webhookHeaders(event))
			requireStatus(t, res, payload, 202)
			res, payload = request(t, server, "GET", path, nil, nil, headers)
			requireStatus(t, res, payload, 200)
			if decodeObject(t, payload)["status"] == "revoked" {
				t.Fatal("unrelated capture revoked this order")
			}
			provider.mutex.Lock()
			provider.refundCapture = "CAPTURE1"
			provider.captureStatus = "PARTIALLY_REFUNDED"
			provider.mutex.Unlock()
			res, payload = request(t, server, "POST", "/gallery/payment-events", event, nil, webhookHeaders(event))
			requireStatus(t, res, payload, 204)
			closeService()
			closeService = nil
			service, err := gallery.New(configuration)
			if err != nil {
				t.Fatal(err)
			}
			server = httptest.NewServer(service)
			defer server.Close()
			defer service.Close()
			res, payload = request(t, server, "POST", "/gallery/payment-events", event, nil, webhookHeaders(event))
			requireStatus(t, res, payload, 204)
			delayed := completedEvent(t, "AFTER-REFUND")
			res, payload = request(t, server, "POST", "/gallery/payment-events", delayed, nil, webhookHeaders(delayed))
			requireStatus(t, res, payload, 204)
			res, payload = request(t, server, "GET", path, nil, nil, headers)
			requireStatus(t, res, payload, 200)
			view := decodeObject(t, payload)
			if view["status"] != "revoked" {
				t.Fatal("refund did not preserve revocation")
			}
			for _, item := range view["entitlements"].([]any) {
				if item.(map[string]any)["status"] != "revoked" {
					t.Fatal("refund retained an active entitlement")
				}
			}
			res, payload = request(t, server, "POST", path+"/download-links", []byte(`{"offerId":"study-download"}`), nil, headers)
			requireStatus(t, res, payload, 403)
		})
	}
}
