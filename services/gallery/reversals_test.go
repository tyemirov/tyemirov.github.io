package gallery_test

import (
	"net/http/httptest"
	"testing"
	"time"

	gallery "github.com/tyemirov/tyemirov.github.io/services/gallery"
)

func reversalEvent(t *testing.T, id, amount string) []byte {
	t.Helper()
	return encodeObject(t, map[string]any{
		"id": id, "event_type": "PAYMENT.CAPTURE.REVERSED", "resource_type": "refund", "resource_version": "2.0",
		"resource": map[string]any{"id": "REFUND1", "status": "COMPLETED", "amount": map[string]string{"currency_code": "USD", "value": amount}},
	})
}

func TestVerifiedReversalRevokesExistingGrantAcrossRestart(t *testing.T) {
	for _, amount := range []string{"12.50", "1.00"} {
		t.Run(amount, func(t *testing.T) {
			server, provider, closeService, configuration, path, headers := paidDownloadFixture(t)
			res, payload := request(t, server, "POST", path+"/download-links", []byte(`{"offerId":"study-download"}`), nil, headers)
			requireStatus(t, res, payload, 201)
			grant := decodeObject(t, payload)
			resource := grant["download"].(map[string]any)["href"].(string)
			access := map[string]string{"Authorization": "Bearer " + grant["accessSecret"].(string)}
			res, payload = request(t, server, "GET", resource, nil, nil, access)
			requireStatus(t, res, payload, 200)
			etag := res.Header.Get("ETag")
			provider.mutex.Lock()
			provider.refundStatus, provider.refundValue, provider.refundCapture = "COMPLETED", amount, "CAPTURE1"
			provider.mutex.Unlock()
			event := reversalEvent(t, "REVERSED-PURCHASE", amount)
			invalid := webhookHeaders(event)
			invalid["Paypal-Transmission-Sig"] = "invalid"
			res, payload = request(t, server, "POST", "/gallery/payment-events", event, nil, invalid)
			requireStatus(t, res, payload, 400)
			for _, mismatch := range []string{"pending-refund", "amount", "payee", "currency", "order"} {
				provider.mutex.Lock()
				provider.refundStatus = "COMPLETED"
				if mismatch == "pending-refund" {
					provider.refundStatus = "PENDING"
				}
				provider.wrongAmount = mismatch == "amount"
				provider.wrongPayee = mismatch == "payee"
				provider.wrongCurrency = mismatch == "currency"
				provider.wrongOrder = mismatch == "order"
				provider.mutex.Unlock()
				res, payload = request(t, server, "POST", "/gallery/payment-events", event, nil, webhookHeaders(event))
				requireStatus(t, res, payload, 422)
				res, payload = request(t, server, "GET", resource, nil, nil, access)
				requireStatus(t, res, payload, 200)
			}
			provider.mutex.Lock()
			provider.wrongOrder = false
			provider.captureStatus = "PARTIALLY_REFUNDED"
			if amount == "12.50" {
				provider.captureStatus = "REFUNDED"
			}
			provider.mutex.Unlock()
			res, payload = request(t, server, "POST", "/gallery/payment-events", event, nil, webhookHeaders(event))
			requireStatus(t, res, payload, 204)
			closeService()
			service, err := gallery.New(configuration)
			if err != nil {
				t.Fatal(err)
			}
			server = httptest.NewServer(service)
			defer service.Close()
			defer server.Close()
			for _, repeated := range [][]byte{event, reversalEvent(t, "REVERSED-AGAIN", amount), completedEvent(t, "COMPLETED-AFTER-REVERSAL")} {
				res, payload = request(t, server, "POST", "/gallery/payment-events", repeated, nil, webhookHeaders(repeated))
				requireStatus(t, res, payload, 204)
			}
			for _, method := range []string{"GET", "HEAD"} {
				for _, condition := range []map[string]string{{}, {"Range": "bytes=0-7"}, {"If-None-Match": etag}} {
					condition["Authorization"] = access["Authorization"]
					res, payload = request(t, server, method, resource, nil, nil, condition)
					requireStatus(t, res, payload, 403)
					if res.Header.Get("Cache-Control") != "no-store" {
						t.Fatal("revoked download response is cacheable")
					}
				}
			}
			res, payload = request(t, server, "POST", path+"/download-links", []byte(`{"offerId":"study-download"}`), nil, headers)
			requireStatus(t, res, payload, 403)
			res, payload = request(t, server, "POST", path+"/captures", []byte(`{}`), nil, headers)
			requireStatus(t, res, payload, 409)
			res, payload = request(t, server, "GET", path, nil, nil, headers)
			requireStatus(t, res, payload, 200)
			order := decodeObject(t, payload)
			entitlements := order["entitlements"].([]any)
			if order["status"] != "revoked" || len(entitlements) != 1 || entitlements[0].(map[string]any)["status"] != "revoked" {
				t.Fatal("reversal did not keep the purchased entitlement revoked")
			}
			provider.mutex.Lock()
			defer provider.mutex.Unlock()
			if len(provider.captureKeys) != 1 {
				t.Fatal("reversal retry caused another capture")
			}
		})
	}
}

func TestReversalPrecedesCompletionAfterLostCaptureResponse(t *testing.T) {
	server, provider, closeService, _ := saleFixture(t)
	defer closeService()
	provider.mutex.Lock()
	provider.dropFirstCapture = true
	provider.mutex.Unlock()
	res, payload := request(t, server, "POST", "/gallery/orders", buyerPayload(t, server, "buyer@example.test", []string{"study-download"}), nil, buyerHeaders("44b32572-cee6-4d15-a15d-ab1a21222e5e"))
	requireStatus(t, res, payload, 201)
	created := decodeObject(t, payload)
	path := "/gallery/orders/" + created["order"].(map[string]any)["id"].(string)
	headers := map[string]string{"Content-Type": "application/json", "Authorization": "Bearer " + created["accessSecret"].(string)}
	res, payload = request(t, server, "POST", path+"/captures", []byte(`{}`), nil, headers)
	requireStatus(t, res, payload, 202)
	provider.mutex.Lock()
	provider.refundStatus, provider.refundValue, provider.refundCapture = "COMPLETED", "1.00", "CAPTURE1"
	provider.captureStatus = "PARTIALLY_REFUNDED"
	provider.mutex.Unlock()
	for _, event := range [][]byte{reversalEvent(t, "REVERSED-LOST-CAPTURE", "1.00"), completedEvent(t, "LATE-REVERSAL-COMPLETION")} {
		res, payload = request(t, server, "POST", "/gallery/payment-events", event, nil, webhookHeaders(event))
		requireStatus(t, res, payload, 204)
	}
	res, payload = request(t, server, "GET", path, nil, nil, headers)
	requireStatus(t, res, payload, 200)
	order := decodeObject(t, payload)
	if order["status"] != "revoked" || len(order["entitlements"].([]any)) != 0 || order["receipt"] != nil {
		t.Fatal("delayed completion fulfilled a reversed purchase")
	}
	res, payload = request(t, server, "POST", path+"/download-links", []byte(`{"offerId":"study-download"}`), nil, headers)
	requireStatus(t, res, payload, 403)
}

func TestStoredReversalResumesAfterRestartWithoutWebhookRedelivery(t *testing.T) {
	server, provider, closeService, configuration, path, headers := paidDownloadFixture(t)
	provider.mutex.Lock()
	provider.refundStatus, provider.refundValue, provider.refundCapture = "COMPLETED", "12.50", "CAPTURE1"
	provider.readUnavailable = true
	provider.mutex.Unlock()
	event := reversalEvent(t, "REVERSAL-RECONCILIATION", "12.50")
	res, payload := request(t, server, "POST", "/gallery/payment-events", event, nil, webhookHeaders(event))
	requireStatus(t, res, payload, 503)
	closeService()
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
	defer service.Close()
	defer server.Close()
	awaitOrderStatus(t, server, path, headers, "revoked")
	res, payload = request(t, server, "POST", path+"/download-links", []byte(`{"offerId":"study-download"}`), nil, headers)
	requireStatus(t, res, payload, 403)
}
