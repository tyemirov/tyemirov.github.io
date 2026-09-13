package gallery_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"reflect"
	"sort"
	"strings"
	"testing"

	"github.com/google/uuid"
	gallery "github.com/tyemirov/tyemirov.github.io/services/gallery"
)

func purchaseForOwnerTest(t *testing.T, server *httptest.Server, email string) (string, string) {
	t.Helper()
	response, body := request(t, server, "POST", "/gallery/orders", encodeObject(t, map[string]any{"catalogDigest": catalogDigest(t, server), "offerIds": []string{"study-download"}, "email": email}), nil, buyerHeaders(uuid.NewString()))
	requireStatus(t, response, body, 201)
	created := decodeObject(t, body)
	return created["order"].(map[string]any)["id"].(string), created["accessSecret"].(string)
}

func TestOwnerOrdersListAndReadPrivatePurchases(t *testing.T) {
	server, _, closeService, _ := saleFixture(t)
	defer closeService()
	owner := session(t, "owner@example.test", "gallery-test")
	id, secret := purchaseForOwnerTest(t, server, "buyer@example.test")
	for _, path := range []string{"/gallery/orders", "/gallery/orders/" + id} {
		for _, example := range []struct {
			cookie *http.Cookie
			status int
		}{{nil, 401}, {session(t, "visitor@example.test", "gallery-test"), 403}, {session(t, "owner@example.test", "another-tenant"), 403}, {owner, 200}} {
			response, body := request(t, server, "GET", path, nil, example.cookie, nil)
			requireStatus(t, response, body, example.status)
			if strings.Contains(string(body), secret) || strings.Contains(string(body), "accessSecret") {
				t.Fatal("order read revealed an access code")
			}
			if response.Header.Get("Cache-Control") != "no-store" {
				t.Fatal("private order response is cacheable")
			}
		}
	}
	response, body := request(t, server, "GET", "/gallery/orders/"+id, nil, owner, nil)
	requireStatus(t, response, body, 200)
	order := decodeObject(t, body)
	if order["email"] != "buyer@example.test" || order["totalCents"] != float64(1250) || order["status"] != "awaiting-approval" {
		t.Fatal("owner cannot inspect stored purchase")
	}
	response, body = request(t, server, "GET", "/gallery/orders", nil, nil, map[string]string{"Authorization": "Bearer " + secret})
	requireStatus(t, response, body, 401)
	response, body = request(t, server, "GET", "/gallery/orders/"+id, nil, owner, map[string]string{"Authorization": "Bearer invalid"})
	requireStatus(t, response, body, 401)
	response, body = request(t, server, "GET", "/gallery/orders/"+id, nil, nil, map[string]string{"Authorization": "Bearer " + secret})
	requireStatus(t, response, body, 200)
	response, body = request(t, server, "GET", "/gallery/orders/"+uuid.NewString(), nil, owner, nil)
	requireStatus(t, response, body, 404)
}

func TestOwnerOrdersUseBoundedCursorPagesAndExactFilters(t *testing.T) {
	server, _, closeService, _ := saleFixture(t)
	defer closeService()
	owner := session(t, "owner@example.test", "gallery-test")
	ids := []string{}
	for _, email := range []string{"buyer@example.test", "other@example.test", "buyer@example.test"} {
		id, _ := purchaseForOwnerTest(t, server, email)
		ids = append(ids, id)
	}
	sort.Strings(ids)
	collected := []string{}
	path := "/gallery/orders?limit=1"
	for range 3 {
		response, body := request(t, server, "GET", path, nil, owner, nil)
		requireStatus(t, response, body, 200)
		page := decodeObject(t, body)
		items := page["items"].([]any)
		if len(items) != 1 {
			t.Fatal("incorrect page limit")
		}
		item := items[0].(map[string]any)
		collected = append(collected, item["id"].(string))
		if item["createdAt"] == "" || item["totalCents"] != float64(1250) || item["receipt"] != nil {
			t.Fatal("incomplete owner order summary")
		}
		if page["nextCursor"] != nil {
			path = "/gallery/orders?limit=1&cursor=" + url.QueryEscape(page["nextCursor"].(string))
		} else if len(collected) != 3 {
			t.Fatal("early end of order page")
		}
	}
	if !reflect.DeepEqual(ids, collected) {
		t.Fatal("pagination duplicated or omitted a purchase")
	}
	for _, example := range []struct {
		query string
		count int
	}{{"email=buyer%40example.test", 2}, {"email=BUYER%40example.test", 2}, {"email=buyer%40example.test&status=cancelled", 0}, {"status=awaiting-approval", 3}} {
		response, body := request(t, server, "GET", "/gallery/orders?"+example.query, nil, owner, nil)
		requireStatus(t, response, body, 200)
		page := decodeObject(t, body)
		if len(page["items"].([]any)) != example.count || page["nextCursor"] != nil {
			t.Fatal("incorrect order filter")
		}
	}
	for _, query := range []string{"limit=0", "limit=101", "limit=one", "cursor=invalid", "status=paid", "email=not-an-email", "email=", "limit=1&limit=2", "unknown=value", "%zz=value"} {
		response, body := request(t, server, "GET", "/gallery/orders?"+query, nil, owner, nil)
		requireStatus(t, response, body, 400)
	}
}

func TestOwnerAccessReissueRequiresBuyerVerificationAndSurvivesRetry(t *testing.T) {
	server, _, closeService, configuration := saleFixture(t)
	defer func() {
		if closeService != nil {
			closeService()
		}
	}()
	id, secret := purchaseForOwnerTest(t, server, "buyer@example.test")
	owner := session(t, "owner@example.test", "gallery-test")
	path := "/gallery/orders/" + id + "/access-reissues"
	input := []byte(`{"verifiedEmail":"buyer@example.test"}`)
	headers := buyerHeaders(uuid.NewString())
	for _, example := range []struct {
		cookie *http.Cookie
		status int
	}{{nil, 401}, {session(t, "visitor@example.test", "gallery-test"), 403}, {session(t, "owner@example.test", "another-tenant"), 403}} {
		response, body := request(t, server, "POST", path, input, example.cookie, headers)
		requireStatus(t, response, body, example.status)
	}
	response, body := request(t, server, "POST", path, []byte(`{"verifiedEmail":"different@example.test"}`), owner, headers)
	requireStatus(t, response, body, 422)
	response, body = request(t, server, "POST", path, input, owner, map[string]string{"Content-Type": "application/json"})
	requireStatus(t, response, body, 400)
	response, body = request(t, server, "POST", path, input, owner, headers)
	requireStatus(t, response, body, 201)
	created := decodeObject(t, body)
	if created["accessSecret"] != secret || created["orderUrl"] != ownerOrigin+"/gallery/order/?order="+id {
		t.Fatal("reissue lost original order access")
	}
	reissue := created["reissue"].(map[string]any)
	if reissue["orderId"] != id || reissue["verifiedEmail"] != "buyer@example.test" || reissue["ownerEmail"] != "owner@example.test" || reissue["createdAt"] == "" {
		t.Fatal("reissue audit fields absent")
	}
	location := response.Header.Get("Location")
	if location != path+"/"+reissue["id"].(string) || strings.Contains(location, secret) {
		t.Fatal("invalid reissue resource location")
	}
	response, body = request(t, server, "GET", location, nil, owner, nil)
	requireStatus(t, response, body, 200)
	if !reflect.DeepEqual(decodeObject(t, body), reissue) || strings.Contains(string(body), secret) {
		t.Fatal("reissue audit resource exposed access or changed")
	}
	response, body = request(t, server, "POST", path, input, owner, headers)
	requireStatus(t, response, body, 200)
	if !reflect.DeepEqual(decodeObject(t, body), created) {
		t.Fatal("reissue retry created another result")
	}
	closeService()
	closeService = nil
	service, err := gallery.New(configuration)
	if err != nil {
		t.Fatal(err)
	}
	server = httptest.NewServer(service)
	defer server.Close()
	defer service.Close()
	response, body = request(t, server, "POST", path, input, owner, headers)
	requireStatus(t, response, body, 200)
	if !reflect.DeepEqual(decodeObject(t, body), created) {
		t.Fatal("reissue retry changed after restart")
	}
	response, body = request(t, server, "GET", "/gallery/orders/"+id, nil, nil, map[string]string{"Authorization": "Bearer " + secret})
	requireStatus(t, response, body, 200)
	if decodeObject(t, body)["status"] != "awaiting-approval" {
		t.Fatal("access reissue changed payment status")
	}
	response, body = request(t, server, "POST", "/gallery/orders/"+id+"/download-links", []byte(`{"offerId":"study-download"}`), nil, map[string]string{"Authorization": "Bearer " + secret, "Content-Type": "application/json"})
	requireStatus(t, response, body, 403)
}

func TestOwnerAccessReissueConcurrentRetriesPreserveOneAuditRecord(t *testing.T) {
	server, _, closeService, _ := saleFixture(t)
	defer closeService()
	id, secret := purchaseForOwnerTest(t, server, "buyer@example.test")
	owner := session(t, "owner@example.test", "gallery-test")
	path := "/gallery/orders/" + id + "/access-reissues"
	key := uuid.NewString()
	type result struct {
		status int
		body   map[string]any
		err    error
	}
	results := make(chan result, 8)
	start := make(chan struct{})
	for range 8 {
		go func() {
			<-start
			req, err := http.NewRequest("POST", server.URL+path, bytes.NewBufferString(`{"verifiedEmail":"buyer@example.test"}`))
			if err != nil {
				results <- result{err: err}
				return
			}
			req.AddCookie(owner)
			req.Header.Set("Origin", ownerOrigin)
			req.Header.Set("Content-Type", "application/json")
			req.Header.Set("Idempotency-Key", key)
			response, err := server.Client().Do(req)
			if err != nil {
				results <- result{err: err}
				return
			}
			var body map[string]any
			err = json.NewDecoder(response.Body).Decode(&body)
			closeErr := response.Body.Close()
			if err == nil {
				err = closeErr
			}
			results <- result{status: response.StatusCode, body: body, err: err}
		}()
	}
	close(start)
	createdCount := 0
	var expected map[string]any
	for range 8 {
		entry := <-results
		if entry.err != nil {
			t.Error(entry.err)
			continue
		}
		if entry.status != 200 && entry.status != 201 {
			t.Errorf("concurrent reissue returned HTTP %d", entry.status)
			continue
		}
		if entry.status == 201 {
			createdCount++
		}
		if expected == nil {
			expected = entry.body
		}
		if !reflect.DeepEqual(expected, entry.body) || entry.body["accessSecret"] != secret {
			t.Error("concurrent reissue changed the access resource")
		}
	}
	if createdCount != 1 {
		t.Fatalf("created %d reissue records, want one", createdCount)
	}
	response, body := request(t, server, "POST", path, []byte(`{"verifiedEmail":"other@example.test"}`), owner, buyerHeaders(key))
	requireStatus(t, response, body, 409)
	for _, example := range []struct {
		path, input, origin string
		status              int
	}{
		{path, `{}`, ownerOrigin, 400},
		{path, `{"verifiedEmail":"buyer@example.test","status":"complete"}`, ownerOrigin, 400},
		{path + "?secret=value", `{"verifiedEmail":"buyer@example.test"}`, ownerOrigin, 400},
		{path, `{"verifiedEmail":"buyer@example.test"}`, "", 403},
		{path, `{"verifiedEmail":"buyer@example.test"}`, "https://untrusted.example.test", 403},
		{"/gallery/orders/" + uuid.NewString() + "/access-reissues", `{"verifiedEmail":"buyer@example.test"}`, ownerOrigin, 404},
	} {
		headers := buyerHeaders(uuid.NewString())
		headers["Origin"] = example.origin
		response, body = request(t, server, "POST", example.path, []byte(example.input), owner, headers)
		requireStatus(t, response, body, example.status)
		if strings.Contains(string(body), secret) {
			t.Fatal("rejected reissue exposed a code")
		}
	}
	location := path + "/" + expected["reissue"].(map[string]any)["id"].(string)
	for _, method := range []string{"GET", "HEAD"} {
		response, body = request(t, server, method, location, nil, nil, nil)
		requireStatus(t, response, body, 401)
		response, body = request(t, server, method, location, nil, owner, nil)
		requireStatus(t, response, body, 200)
	}
	response, body = request(t, server, "DELETE", location, nil, owner, nil)
	requireStatus(t, response, body, 405)
	if !strings.Contains(response.Header.Get("Allow"), "GET") {
		t.Fatal("audit resource lacks its allowed methods")
	}
}

func TestOwnerAccessReissuePreservesPaymentAndRefundAuthorization(t *testing.T) {
	server, provider, closeService, _ := saleFixture(t)
	defer closeService()
	id, secret := purchaseForOwnerTest(t, server, "buyer@example.test")
	owner := session(t, "owner@example.test", "gallery-test")
	path := "/gallery/orders/" + id
	headers := map[string]string{"Authorization": "Bearer " + secret, "Content-Type": "application/json"}
	response, body := request(t, server, "POST", path+"/captures", []byte(`{}`), nil, headers)
	requireStatus(t, response, body, 202)
	event := completedEvent(t, "OWNER-REISSUE-COMPLETE")
	response, body = request(t, server, "POST", "/gallery/payment-events", event, nil, webhookHeaders(event))
	requireStatus(t, response, body, 204)
	response, body = request(t, server, "GET", "/gallery/orders?status=complete", nil, owner, nil)
	requireStatus(t, response, body, 200)
	items := decodeObject(t, body)["items"].([]any)
	if len(items) != 1 || items[0].(map[string]any)["receipt"].(map[string]any)["status"] != "pending" {
		t.Fatal("owner list lost receipt state")
	}
	response, body = request(t, server, "POST", path+"/access-reissues", []byte(`{"verifiedEmail":"buyer@example.test"}`), owner, buyerHeaders(uuid.NewString()))
	requireStatus(t, response, body, 201)
	if decodeObject(t, body)["accessSecret"] != secret {
		t.Fatal("reissue replaced purchased access")
	}
	response, body = request(t, server, "POST", path+"/download-links", []byte(`{"offerId":"study-download"}`), nil, headers)
	requireStatus(t, response, body, 201)
	grant := decodeObject(t, body)
	provider.mutex.Lock()
	provider.refundStatus, provider.refundValue, provider.refundCapture = "COMPLETED", "1.00", "CAPTURE1"
	provider.captureStatus = "PARTIALLY_REFUNDED"
	provider.mutex.Unlock()
	event = encodeObject(t, map[string]any{"id": "OWNER-REISSUE-REFUND", "event_type": "PAYMENT.CAPTURE.REFUNDED", "resource": map[string]any{"id": "REFUND1", "status": "COMPLETED", "amount": map[string]string{"currency_code": "USD", "value": "1.00"}}})
	response, body = request(t, server, "POST", "/gallery/payment-events", event, nil, webhookHeaders(event))
	requireStatus(t, response, body, 204)
	response, body = request(t, server, "POST", path+"/access-reissues", []byte(`{"verifiedEmail":"buyer@example.test"}`), owner, buyerHeaders(uuid.NewString()))
	requireStatus(t, response, body, 201)
	reissued := decodeObject(t, body)["accessSecret"].(string)
	response, body = request(t, server, "GET", path, nil, nil, map[string]string{"Authorization": "Bearer " + reissued})
	requireStatus(t, response, body, 200)
	order := decodeObject(t, body)
	if order["status"] != "revoked" || len(order["entitlements"].([]any)) != 1 || order["entitlements"].([]any)[0].(map[string]any)["status"] != "revoked" {
		t.Fatal("access reissue changed refund authorization")
	}
	response, body = request(t, server, "POST", path+"/download-links", []byte(`{"offerId":"study-download"}`), nil, headers)
	requireStatus(t, response, body, 403)
	response, body = request(t, server, "GET", grant["download"].(map[string]any)["href"].(string), nil, nil, map[string]string{"Authorization": "Bearer " + grant["accessSecret"].(string)})
	requireStatus(t, response, body, 403)
	provider.mutex.Lock()
	defer provider.mutex.Unlock()
	if len(provider.captureKeys) != 1 {
		t.Fatal("access reissue caused another capture")
	}
}
