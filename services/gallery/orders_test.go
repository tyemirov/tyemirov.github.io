package gallery_test

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	gallery "github.com/tyemirov/tyemirov.github.io/services/gallery"
)

type paymentFixture struct {
	readUnavailable         bool
	readCount               int
	readStarted             chan struct{}
	readRelease             chan struct{}
	refundStatus            string
	refundValue             string
	refundCapture           string
	captureStatus           string
	captureStarted          chan struct{}
	captureRelease          chan struct{}
	dropFirstCapture        bool
	verificationUnavailable bool
	server                  *httptest.Server
	mutex                   sync.Mutex
	createKeys              []string
	purchaseUnits           []map[string]any
	dropFirstCreate         bool
	captured                bool
	captureKeys             []string
	wrongPayee              bool
	wrongAmount             bool
	wrongCurrency           bool
	wrongOrder              bool
	compactAmount           bool
}

func newPaymentFixture(t *testing.T) *paymentFixture {
	t.Helper()
	fixture := &paymentFixture{}
	fixture.server = httptest.NewTLSServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		writer.Header().Set("Content-Type", "application/json")
		switch request.URL.Path {
		case "/v1/oauth2/token":
			if user, password, ok := request.BasicAuth(); !ok || user != "test-client" || password != "test-secret" {
				writer.WriteHeader(401)
				return
			}
			if err := request.ParseForm(); err != nil || request.Form.Get("grant_type") != "client_credentials" {
				writer.WriteHeader(400)
				return
			}
			json.NewEncoder(writer).Encode(map[string]any{"access_token": "test-provider-token", "token_type": "Bearer", "expires_in": 3600})
		case "/v2/checkout/orders":
			if request.Header.Get("Authorization") != "Bearer test-provider-token" {
				writer.WriteHeader(401)
				return
			}
			var body map[string]any
			if err := json.NewDecoder(request.Body).Decode(&body); err != nil {
				writer.WriteHeader(400)
				return
			}
			if body["intent"] != "CAPTURE" {
				writer.WriteHeader(422)
				return
			}
			unit := body["purchase_units"].([]any)[0].(map[string]any)
			fixture.mutex.Lock()
			fixture.createKeys = append(fixture.createKeys, request.Header.Get("PayPal-Request-Id"))
			fixture.purchaseUnits = append(fixture.purchaseUnits, unit)
			drop := fixture.dropFirstCreate && len(fixture.createKeys) == 1
			fixture.mutex.Unlock()
			if drop {
				writer.WriteHeader(503)
				return
			}
			writer.WriteHeader(201)
			json.NewEncoder(writer).Encode(map[string]any{"id": "PROVIDERORDER1", "status": "PAYER_ACTION_REQUIRED", "links": []any{map[string]any{"rel": "payer-action", "href": fixture.server.URL + "/checkoutnow?token=PROVIDERORDER1", "method": "GET"}}})

		case "/v2/checkout/orders/PROVIDERORDER1/capture":
			fixture.mutex.Lock()
			started, release := fixture.captureStarted, fixture.captureRelease
			fixture.mutex.Unlock()
			if started != nil {
				close(started)
				<-release
			}
			fixture.mutex.Lock()
			fixture.captureKeys = append(fixture.captureKeys, request.Header.Get("PayPal-Request-Id"))
			fixture.captured = true
			drop := fixture.dropFirstCapture && len(fixture.captureKeys) == 1
			reply := fixture.orderReply()
			fixture.mutex.Unlock()
			if drop {
				writer.WriteHeader(503)
				return
			}
			json.NewEncoder(writer).Encode(reply)
		case "/v2/checkout/orders/PROVIDERORDER1":
			fixture.mutex.Lock()
			started, release := fixture.readStarted, fixture.readRelease
			fixture.mutex.Unlock()
			if started != nil {
				select {
				case started <- struct{}{}:
				default:
				}
				select {
				case <-release:
				case <-request.Context().Done():
					return
				}
			}
			fixture.mutex.Lock()
			fixture.readCount++
			if fixture.readUnavailable {
				fixture.mutex.Unlock()
				writer.WriteHeader(503)
				return
			}
			reply := fixture.orderReply()
			fixture.mutex.Unlock()
			json.NewEncoder(writer).Encode(reply)
		case "/v2/payments/refunds/REFUND1":
			fixture.mutex.Lock()
			reply := map[string]any{"id": "REFUND1", "status": fixture.refundStatus, "amount": map[string]string{"currency_code": "USD", "value": fixture.refundValue}, "links": []any{map[string]string{"rel": "up", "method": "GET", "href": fixture.server.URL + "/v2/payments/captures/" + fixture.refundCapture}}}
			fixture.mutex.Unlock()
			json.NewEncoder(writer).Encode(reply)
		case "/v2/payments/captures/CAPTURE1", "/v2/payments/captures/OTHER1":
			fixture.mutex.Lock()
			unit := fixture.orderReply()["purchase_units"].([]any)[0].(map[string]any)
			customID := unit["custom_id"]
			captureID := "CAPTURE1"
			if request.URL.Path == "/v2/payments/captures/OTHER1" {
				captureID = "OTHER1"
				customID = "c3d08dba-c599-4e71-9d73-12d47059b1af"
			}
			reply := map[string]any{"id": captureID, "status": "COMPLETED", "custom_id": customID, "amount": unit["amount"], "payee": unit["payee"], "supplementary_data": map[string]any{"related_ids": map[string]string{"order_id": "PROVIDERORDER1"}}}
			fixture.mutex.Unlock()
			json.NewEncoder(writer).Encode(reply)
		case "/v1/notifications/verify-webhook-signature":
			fixture.mutex.Lock()
			unavailable := fixture.verificationUnavailable
			fixture.mutex.Unlock()
			if unavailable {
				writer.WriteHeader(503)
				return
			}
			var body struct {
				Signature string          `json:"transmission_sig"`
				Event     json.RawMessage `json:"webhook_event"`
				WebhookID string          `json:"webhook_id"`
			}
			if err := json.NewDecoder(request.Body).Decode(&body); err != nil {
				writer.WriteHeader(400)
				return
			}
			status := "FAILURE"
			if body.WebhookID == "test-webhook" && hmac.Equal([]byte(body.Signature), []byte(eventSignature(body.Event))) {
				status = "SUCCESS"
			}
			json.NewEncoder(writer).Encode(map[string]string{"verification_status": status})
		default:
			writer.WriteHeader(404)
		}
	}))
	t.Cleanup(fixture.server.Close)
	return fixture
}
func (fixture *paymentFixture) orderReply() map[string]any {
	unit := fixture.purchaseUnits[0]
	amount := map[string]any{"currency_code": unit["amount"].(map[string]any)["currency_code"], "value": unit["amount"].(map[string]any)["value"]}
	merchant := "TESTMERCHANT1"
	custom := unit["custom_id"]
	if fixture.compactAmount {
		amount["value"] = "12.5"
	}
	if fixture.wrongAmount {
		amount["value"] = "0.01"
	}
	if fixture.wrongCurrency {
		amount["currency_code"] = "EUR"
	}
	if fixture.wrongPayee {
		merchant = "OTHERPAYEE"
	}
	if fixture.wrongOrder {
		custom = "another-local-order"
	}
	captures := []any{}
	status := "APPROVED"
	if fixture.captured {
		status = "COMPLETED"
		captureStatus := "COMPLETED"
		if fixture.captureStatus != "" {
			captureStatus = fixture.captureStatus
		}
		captures = append(captures, map[string]any{"id": "CAPTURE1", "status": captureStatus, "amount": amount})
	}
	return map[string]any{"id": "PROVIDERORDER1", "status": status, "purchase_units": []any{map[string]any{"custom_id": custom, "amount": amount, "payee": map[string]string{"merchant_id": merchant}, "payments": map[string]any{"captures": captures}}}}
}
func eventSignature(data []byte) string {
	mac := hmac.New(sha256.New, []byte("test-webhook-signing-key"))
	mac.Write(data)
	return hex.EncodeToString(mac.Sum(nil))
}
func (fixture *paymentFixture) configuration() *gallery.PayPalConfig {
	return &gallery.PayPalConfig{BaseURL: fixture.server.URL, CheckoutOrigin: fixture.server.URL, ClientID: "test-client", ClientSecret: "test-secret", MerchantID: "TESTMERCHANT1", WebhookID: "test-webhook", HTTPClient: fixture.server.Client()}
}
func buyerHeaders(key string) map[string]string {
	return map[string]string{"Content-Type": "application/json", "Idempotency-Key": key}
}
func writeTestFile(t *testing.T, path string, data []byte) {
	t.Helper()
	file, err := os.Create(path)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := file.Write(data); err != nil {
		t.Fatal(err)
	}
	if err := file.Close(); err != nil {
		t.Fatal(err)
	}
}
func saleFixture(t *testing.T) (*httptest.Server, *paymentFixture, func(), gallery.Config) {
	t.Helper()
	root := t.TempDir()
	if output, err := exec.Command("cp", "-R", filepath.Join("..", "..", "data"), root).CombinedOutput(); err != nil {
		t.Fatalf("copy fixture catalog: %v: %s", err, output)
	}
	configuration := config(filepath.Join(t.TempDir(), "gallery.db"))
	configuration.PublicRoot = root
	provider := newPaymentFixture(t)
	configuration.PayPal = provider.configuration()
	service, err := gallery.New(configuration)
	if err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(service)
	owner := session(t, "owner@example.test", "gallery-test")
	res, payload := request(t, server, "POST", "/gallery/assets", pngImage(t, 20, 30), owner, map[string]string{"Content-Type": "image/png"})
	requireStatus(t, res, payload, 201)
	asset := decodeObject(t, payload)
	source, err := os.ReadFile(filepath.Join(root, "data", "site.json"))
	if err != nil {
		t.Fatal(err)
	}
	site := decodeObject(t, source)
	work := site["gallery"].(map[string]any)["artworks"].([]any)[0].(map[string]any)
	work["offer"] = map[string]any{"id": "study-download", "priceCents": 1250, "currency": "USD", "license": "Test license for one buyer.", "revision": asset["id"], "file": map[string]any{"label": "Test image", "format": "PNG", "width": 20, "height": 30}, "deliveryTerms": "Test download after verified payment."}
	writeTestFile(t, filepath.Join(root, "data", "site.json"), encodeObject(t, site))
	return server, provider, func() {
		server.Close()
		if err := service.Close(); err != nil {
			t.Error(err)
		}
	}, configuration
}
func TestOrdersUseServerPricesAndKeepTheirPurchaseSnapshot(t *testing.T) {
	server, provider, closeService, configuration := saleFixture(t)
	const key = "6f087ec5-6e72-4a06-b716-afefb819105a"
	body := map[string]any{"catalogDigest": catalogDigest(t, server), "offerIds": []string{"study-download"}, "email": "buyer@example.test"}
	altered := map[string]any{"catalogDigest": catalogDigest(t, server), "offerIds": []string{"study-download"}, "email": "buyer@example.test", "priceCents": 1}
	res, payload := request(t, server, "POST", "/gallery/orders", encodeObject(t, altered), nil, buyerHeaders(key))
	requireStatus(t, res, payload, 400)
	res, payload = request(t, server, "POST", "/gallery/orders", encodeObject(t, body), nil, buyerHeaders(key))
	requireStatus(t, res, payload, 201)
	created := decodeObject(t, payload)
	order := created["order"].(map[string]any)
	id := order["id"].(string)
	access := created["accessSecret"].(string)
	if order["totalCents"] != float64(1250) || order["currency"] != "USD" || order["status"] != "awaiting-approval" || len(access) < 40 {
		t.Fatal("order lacks server price or private access")
	}
	provider.mutex.Lock()
	unit := provider.purchaseUnits[0]
	provider.mutex.Unlock()
	if unit["amount"].(map[string]any)["value"] != "12.50" || unit["payee"].(map[string]any)["merchant_id"] != "TESTMERCHANT1" || unit["custom_id"] != id {
		t.Fatal("provider order does not use the server purchase snapshot")
	}
	for _, path := range []string{"/gallery/orders/" + id, "/gallery/orders/" + id + "/download-links"} {
		res, payload = request(t, server, "GET", path, nil, nil, nil)
		requireStatus(t, res, payload, 401)
	}
	res, payload = request(t, server, "POST", "/gallery/orders", encodeObject(t, body), nil, buyerHeaders(key))
	requireStatus(t, res, payload, 200)
	if decodeObject(t, payload)["order"].(map[string]any)["id"] != id {
		t.Fatal("idempotent creation produced another order")
	}
	body["email"] = "different@example.test"
	res, payload = request(t, server, "POST", "/gallery/orders", encodeObject(t, body), nil, buyerHeaders(key))
	requireStatus(t, res, payload, 409)
	source, err := os.ReadFile(filepath.Join(configuration.PublicRoot, "data", "site.json"))
	if err != nil {
		t.Fatal(err)
	}
	changed := decodeObject(t, source)
	changed["gallery"].(map[string]any)["artworks"].([]any)[0].(map[string]any)["offer"].(map[string]any)["priceCents"] = 9999
	writeTestFile(t, filepath.Join(configuration.PublicRoot, "data", "site.json"), encodeObject(t, changed))
	closeService()
	service, err := gallery.New(configuration)
	if err != nil {
		t.Fatal(err)
	}
	server = httptest.NewServer(service)
	defer server.Close()
	defer service.Close()
	res, payload = request(t, server, "GET", "/gallery/orders/"+id, nil, nil, map[string]string{"Authorization": "Bearer " + access})
	requireStatus(t, res, payload, 200)
	if decodeObject(t, payload)["totalCents"] != float64(1250) || strings.Contains(string(payload), "accessSecret") {
		t.Fatal("purchase snapshot or access boundary changed after restart")
	}
	provider.mutex.Lock()
	defer provider.mutex.Unlock()
	if len(provider.createKeys) != 1 {
		t.Fatalf("duplicate provider creation: %v", provider.createKeys)
	}
}
func TestOrdersRejectUnavailableOffersAndRequireIdempotency(t *testing.T) {
	server, _, closeService, _ := saleFixture(t)
	defer closeService()
	for index, example := range []struct {
		offers []string
		email  string
		status int
	}{{[]string{"missing"}, "buyer@example.test", 422}, {[]string{"study-download", "study-download"}, "buyer@example.test", 422}, {[]string{}, "buyer@example.test", 422}, {[]string{"study-download"}, "not-an-email", 422}} {
		t.Run(fmt.Sprint(index), func(t *testing.T) {
			res, payload := request(t, server, "POST", "/gallery/orders", encodeObject(t, map[string]any{"catalogDigest": catalogDigest(t, server), "offerIds": example.offers, "email": example.email}), nil, buyerHeaders("396aa661-78ac-44e5-9c96-ecbd4f5f337e"))
			requireStatus(t, res, payload, example.status)
		})
	}
	res, payload := request(t, server, "POST", "/gallery/orders", buyerPayload(t, server, "buyer@example.test", []string{"study-download"}), nil, map[string]string{"Content-Type": "application/json"})
	requireStatus(t, res, payload, 400)
	res, payload = request(t, server, "POST", "/gallery/orders", buyerPayload(t, server, "buyer@example.test", []string{"study-download"}), nil, buyerHeaders("0d46a038-e68c-4a91-b135-76d868f91b57"))
	requireStatus(t, res, payload, 201)
	created := decodeObject(t, payload)
	order := created["order"].(map[string]any)
	res, payload = request(t, server, "POST", "/gallery/orders/"+order["id"].(string)+"/download-links", []byte(`{"offerId":"study-download"}`), nil, map[string]string{"Content-Type": "application/json", "Authorization": "Bearer " + created["accessSecret"].(string)})
	requireStatus(t, res, payload, 403)
}

func TestOrdersKeepCurrencyAndRejectFractionalZeroDecimalAmounts(t *testing.T) {
	for _, example := range []struct {
		currency string
		price    int
		amount   string
		status   int
	}{{"EUR", 1250, "12.50", 201}, {"JPY", 1200, "12", 201}, {"JPY", 1250, "", 422}} {
		t.Run(example.currency+fmt.Sprint(example.price), func(t *testing.T) {
			server, provider, closeService, configuration := saleFixture(t)
			defer closeService()
			path := filepath.Join(configuration.PublicRoot, "data", "site.json")
			data, err := os.ReadFile(path)
			if err != nil {
				t.Fatal(err)
			}
			site := decodeObject(t, data)
			offer := site["gallery"].(map[string]any)["artworks"].([]any)[0].(map[string]any)["offer"].(map[string]any)
			offer["currency"] = example.currency
			offer["priceCents"] = example.price
			writeTestFile(t, path, encodeObject(t, site))
			res, payload := request(t, server, "POST", "/gallery/orders", buyerPayload(t, server, "buyer@example.test", []string{"study-download"}), nil, buyerHeaders("702b8c12-52aa-47f7-9e54-11af2671b9ac"))
			requireStatus(t, res, payload, example.status)
			if example.status == 201 {
				provider.mutex.Lock()
				defer provider.mutex.Unlock()
				amount := provider.purchaseUnits[0]["amount"].(map[string]any)
				if amount["value"] != example.amount || amount["currency_code"] != example.currency {
					t.Fatal("provider currency or amount changed")
				}
			}
		})
	}
}

func TestUnknownProviderCreationStaysPendingAndRetriesTheSameOrder(t *testing.T) {
	server, provider, closeService, configuration := saleFixture(t)
	provider.mutex.Lock()
	provider.dropFirstCreate = true
	provider.mutex.Unlock()
	body := buyerPayload(t, server, "buyer@example.test", []string{"study-download"})
	headers := buyerHeaders("c58f007b-baf9-4c61-9a67-68c38bab6fe1")
	res, payload := request(t, server, "POST", "/gallery/orders", body, nil, headers)
	requireStatus(t, res, payload, 201)
	created := decodeObject(t, payload)
	pending := created["order"].(map[string]any)
	if pending["status"] != "payment-pending" || pending["approvalUrl"] != nil {
		t.Fatal("unknown provider result became an approval or payment")
	}
	id := pending["id"].(string)
	secret := created["accessSecret"].(string)
	closeService()
	service, err := gallery.New(configuration)
	if err != nil {
		t.Fatal(err)
	}
	server = httptest.NewServer(service)
	defer server.Close()
	defer service.Close()
	res, payload = request(t, server, "POST", "/gallery/orders", body, nil, headers)
	requireStatus(t, res, payload, 200)
	retried := decodeObject(t, payload)
	if retried["order"].(map[string]any)["id"] != id || retried["accessSecret"] != secret || retried["order"].(map[string]any)["status"] != "awaiting-approval" {
		t.Fatal("retry lost the original private order")
	}
	provider.mutex.Lock()
	defer provider.mutex.Unlock()
	if len(provider.createKeys) != 2 || provider.createKeys[0] != provider.createKeys[1] {
		t.Fatal("unknown creation was retried with another provider idempotency key")
	}
}
