package stream_test

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/tyemirov/tyemirov.github.io/services/music-stream/internal/stream"
)

const websiteOrigin = "https://site.music.test"
const mediaOrigin = "https://audio.music.test"

type testGrant struct {
	GrantID    string    `json:"grantId"`
	TrackID    string    `json:"trackId"`
	MediaURL   string    `json:"mediaUrl"`
	DurationMS int64     `json:"durationMs"`
	ServerTime time.Time `json:"serverTime"`
	ExpiresAt  time.Time `json:"expiresAt"`
}

type fixture struct {
	service       *stream.Service
	server        *httptest.Server
	now           atomic.Int64
	mediaRoot     string
	indexPath     string
	allowlistPath string
	assetID       string
}

func writeJSON(t *testing.T, path string, value any) {
	t.Helper()
	file, err := os.Create(path)
	if err != nil {
		t.Fatal(err)
	}
	if err = json.NewEncoder(file).Encode(value); err != nil {
		t.Fatal(err)
	}
	if err = file.Close(); err != nil {
		t.Fatal(err)
	}
}

func prepareFixture(t *testing.T, options ...func(*stream.Config)) *fixture {
	t.Helper()
	directory := t.TempDir()
	source := filepath.Join(directory, "tone.wav")
	command := exec.Command("ffmpeg", "-nostdin", "-v", "error", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000", "-t", "13", source)
	if output, err := command.CombinedOutput(); err != nil {
		t.Fatalf("generate audio: %v: %s", err, output)
	}
	mediaRoot := filepath.Join(directory, "media")
	command = exec.Command("node", "../../../../scripts/music/prepare.mjs", "--source", source, "--media-root", mediaRoot, "--track-id", "test-tone")
	output, err := command.CombinedOutput()
	if err != nil {
		t.Fatalf("prepare audio: %v: %s", err, output)
	}
	var receipt map[string]any
	if err := json.Unmarshal(output, &receipt); err != nil {
		t.Fatal(err)
	}
	delete(receipt, "trackId")
	indexPath := filepath.Join(directory, "index.json")
	allowlistPath := filepath.Join(directory, "allowlist.json")
	writeJSON(t, indexPath, map[string]any{"tracks": map[string]any{"test-tone": receipt}})
	writeJSON(t, allowlistPath, map[string]any{"tracks": []any{map[string]any{"id": "test-tone", "playback": map[string]any{"kind": "file", "durationMs": receipt["durationMs"]}}}})
	fixture := &fixture{mediaRoot: mediaRoot, indexPath: indexPath, allowlistPath: allowlistPath, assetID: receipt["assetId"].(string)}
	fixture.now.Store(time.Date(2026, 9, 8, 20, 0, 0, 0, time.UTC).Unix())
	config := stream.Config{MediaRoot: mediaRoot, IndexPath: indexPath, AllowlistPath: allowlistPath, PublicOrigin: mediaOrigin, AllowedOrigins: []string{websiteOrigin}, Now: func() time.Time { return time.Unix(fixture.now.Load(), 0).UTC() }}
	for _, option := range options {
		option(&config)
	}
	service, err := stream.New(config)
	if err != nil {
		t.Fatal(err)
	}
	fixture.server = httptest.NewTLSServer(service)
	fixture.service = service
	t.Cleanup(func() {
		fixture.server.Close()
		if err := service.Close(); err != nil {
			t.Error(err)
		}
	})
	return fixture
}

func (fixture *fixture) request(t *testing.T, method, path string, body []byte, cookie *http.Cookie, headers map[string]string) *http.Response {
	t.Helper()
	request, err := http.NewRequest(method, fixture.server.URL+path, bytes.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	for name, value := range headers {
		request.Header.Set(name, value)
	}
	if cookie != nil {
		request.AddCookie(cookie)
	}
	response, err := fixture.server.Client().Do(request)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { response.Body.Close() })
	return response
}

func (fixture *fixture) create(t *testing.T, cookie *http.Cookie) (testGrant, *http.Cookie) {
	t.Helper()
	response := fixture.request(t, "POST", "/music/playback-grants", []byte(`{"trackId":"test-tone"}`), cookie, map[string]string{"Origin": websiteOrigin, "Content-Type": "application/json"})
	if response.StatusCode != 201 {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("grant creation: got %d, want 201: %s", response.StatusCode, body)
	}
	var grant testGrant
	if err := json.NewDecoder(response.Body).Decode(&grant); err != nil {
		t.Fatal(err)
	}
	cookies := response.Cookies()
	if len(cookies) != 1 {
		t.Fatalf("cookie count = %d", len(cookies))
	}
	return grant, cookies[0]
}

func TestProtectedPlaybackAndCookieScope(t *testing.T) {
	fixture := prepareFixture(t)
	grant, cookie := fixture.create(t, nil)
	if cookie.Name != "__Secure-music-session" || !cookie.HttpOnly || !cookie.Secure || cookie.Domain != "" || cookie.Path != "/music" || cookie.SameSite != http.SameSiteStrictMode || cookie.MaxAge != 86400 {
		t.Fatalf("incorrect cookie attributes")
	}
	if grant.TrackID != "test-tone" || grant.DurationMS < 13000 || grant.ExpiresAt.Sub(grant.ServerTime) != 30*time.Minute {
		t.Fatal("incorrect grant data")
	}
	mediaURL, err := url.Parse(grant.MediaURL)
	if err != nil {
		t.Fatal(err)
	}
	if mediaURL.Scheme+"://"+mediaURL.Host != mediaOrigin {
		t.Fatal("incorrect mediaURL origin")
	}
	_, otherCookie := fixture.create(t, nil)
	base := mediaURL.Path
	for _, file := range []string{""} {
		for _, method := range []string{"GET", "HEAD"} {
			for _, entry := range []struct {
				cookie *http.Cookie
				status int
			}{{nil, 401}, {otherCookie, 404}, {cookie, 200}} {
				response := fixture.request(t, method, base+file, nil, entry.cookie, nil)
				if response.StatusCode != entry.status {
					t.Errorf("%s %s got %d want %d", method, file, response.StatusCode, entry.status)
				}
				if !strings.Contains(response.Header.Get("Cache-Control"), "no-store") {
					t.Error("media response can be cached")
				}
			}
		}
	}
	rangeResponse := fixture.request(t, "GET", base, nil, cookie, map[string]string{"Range": "bytes=0-15", "Origin": websiteOrigin})
	data, _ := io.ReadAll(rangeResponse.Body)
	if rangeResponse.StatusCode != 206 || len(data) != 16 || rangeResponse.Header.Get("Access-Control-Allow-Credentials") != "true" {
		t.Fatal("incorrect credentialed range response")
	}
	invalidRange := fixture.request(t, "GET", base, nil, cookie, map[string]string{"Range": "bytes=999999999-"})
	if invalidRange.StatusCode != 416 || !strings.Contains(invalidRange.Header.Get("Cache-Control"), "no-store") {
		t.Fatal("incorrect uncachable range error")
	}
	if fixture.request(t, "GET", base+"package.json", nil, cookie, nil).StatusCode != 404 {
		t.Fatal("private report exposed")
	}
}

func TestLocalHTTPPlaybackUsesAnIndependentCookie(t *testing.T) {
	const localWebsite = "http://localhost:8080"
	const localAPI = "http://localhost:8082"
	fixture := prepareFixture(t, func(config *stream.Config) {
		config.PublicOrigin = localAPI
		config.AllowedOrigins = []string{localWebsite}
	})
	response := fixture.request(t, "POST", "/music/playback-grants", []byte(`{"trackId":"test-tone"}`), nil, map[string]string{"Origin": localWebsite, "Content-Type": "application/json"})
	if response.StatusCode != http.StatusCreated {
		t.Fatalf("create local grant: HTTP %d", response.StatusCode)
	}
	cookie := response.Cookies()[0]
	if cookie.Name != "music_development_session" || cookie.Secure || !cookie.HttpOnly || cookie.SameSite != http.SameSiteStrictMode || cookie.Path != "/music" {
		t.Fatal("incorrect local cookie policy")
	}
	var grant testGrant
	if err := json.NewDecoder(response.Body).Decode(&grant); err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(grant.MediaURL, localAPI+"/music/") {
		t.Fatal("incorrect local mediaURL origin")
	}
	path := strings.TrimPrefix(grant.MediaURL, localAPI)
	if result := fixture.request(t, "GET", path, nil, cookie, nil); result.StatusCode != http.StatusOK {
		t.Fatalf("read local mediaURL: HTTP %d", result.StatusCode)
	}
	if result := fixture.request(t, "GET", path, nil, nil, nil); result.StatusCode != http.StatusUnauthorized {
		t.Fatalf("read local mediaURL without session: HTTP %d", result.StatusCode)
	}
}

func TestHTTPOriginsRejectNonLocalHosts(t *testing.T) {
	for _, origin := range []string{"http://example.com", "http://localhost.example.com", "http://127.0.0.1", "http://localhost@evil.example"} {
		_, err := stream.New(stream.Config{PublicOrigin: origin, AllowedOrigins: []string{"https://site.example.com"}})
		if err == nil || !strings.Contains(err.Error(), "origins") {
			t.Fatalf("reject public origin %q: %v", origin, err)
		}
	}
}

func TestGrantRenewalExpirationAndOrigin(t *testing.T) {
	fixture := prepareFixture(t)
	for _, origin := range []string{"", "null", "https://untrusted.test"} {
		response := fixture.request(t, "POST", "/music/playback-grants", []byte(`{"trackId":"test-tone"}`), nil, map[string]string{"Origin": origin, "Content-Type": "application/json"})
		if response.StatusCode != 403 {
			t.Errorf("forbidden origin: got %d", response.StatusCode)
		}
	}
	preflight := fixture.request(t, "OPTIONS", "/music/playback-grants", nil, nil, map[string]string{"Origin": websiteOrigin, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type"})
	if preflight.StatusCode != 204 || preflight.Header.Get("Access-Control-Allow-Credentials") != "true" {
		t.Fatal("credentialed preflight failed")
	}
	grant, cookie := fixture.create(t, nil)
	fixture.now.Add(25 * 60)
	renew := fixture.renew(t, grant, cookie)
	if renew.StatusCode != 200 {
		t.Fatalf("renewal got %d", renew.StatusCode)
	}
	var renewed testGrant
	if err := json.NewDecoder(renew.Body).Decode(&renewed); err != nil {
		t.Fatal(err)
	}
	if renewed.MediaURL != grant.MediaURL || renewed.ExpiresAt.Sub(grant.ExpiresAt) != 25*time.Minute {
		t.Fatal("renewal changed URL or incorrect expiry")
	}
	fixture.now.Store(renewed.ExpiresAt.Unix())
	mediaURL, _ := url.Parse(grant.MediaURL)
	response := fixture.request(t, "GET", mediaURL.Path, nil, cookie, nil)
	if response.StatusCode != 410 {
		t.Fatalf("expiry boundary got %d", response.StatusCode)
	}
}

func TestRequestsBelowCapacityHaveNoServiceRateQuota(t *testing.T) {
	t.Run("grant creation", func(t *testing.T) {
		fixture := prepareFixture(t)
		_, cookie := fixture.create(t, nil)
		for count := 1; count < 8; count++ {
			fixture.create(t, cookie)
		}
		response := fixture.request(t, "POST", "/music/playback-grants", []byte(`{"trackId":"test-tone"}`), cookie, map[string]string{"Origin": websiteOrigin, "Content-Type": "application/json"})
		if response.StatusCode != 409 {
			t.Fatalf("active grant capacity: got %d want 409", response.StatusCode)
		}
	})
	t.Run("renewal", func(t *testing.T) {
		fixture := prepareFixture(t)
		grant, cookie := fixture.create(t, nil)
		for count := 0; count < 3; count++ {
			fixture.now.Add(1)
			response := fixture.renew(t, grant, cookie)
			if response.StatusCode != 200 {
				t.Fatalf("renewal %d: got %d want 200", count+1, response.StatusCode)
			}
			response.Body.Close()
		}
	})
	t.Run("media", func(t *testing.T) {
		fixture := prepareFixture(t)
		grant, cookie := fixture.create(t, nil)
		mediaURL, _ := url.Parse(grant.MediaURL)
		for count := 0; count < 80; count++ {
			method := "GET"
			if count%2 == 0 {
				method = "HEAD"
			}
			response := fixture.request(t, method, mediaURL.Path, nil, cookie, nil)
			if response.StatusCode != 200 {
				t.Fatalf("media request %d: got %d want 200", count+1, response.StatusCode)
			}
			if _, err := io.Copy(io.Discard, response.Body); err != nil {
				t.Fatal(err)
			}
			response.Body.Close()
		}
	})
}

func (fixture *fixture) renew(t *testing.T, grant testGrant, cookie *http.Cookie) *http.Response {
	t.Helper()
	expires := time.Unix(fixture.now.Load(), 0).UTC().Add(max(30*time.Minute, time.Duration(grant.DurationMS)*time.Millisecond+15*time.Minute))
	body, err := json.Marshal(map[string]time.Time{"expiresAt": expires})
	if err != nil {
		t.Fatal(err)
	}
	return fixture.request(t, "PUT", "/music/playback-grants/"+grant.GrantID+"/expiration", body, cookie, map[string]string{"Origin": websiteOrigin, "Content-Type": "application/json"})
}

func TestExpirationReplacementIsIdempotent(t *testing.T) {
	fixture := prepareFixture(t)
	grant, cookie := fixture.create(t, nil)
	fixture.now.Add(60)
	expires := time.Unix(fixture.now.Load(), 0).UTC().Add(30 * time.Minute).UTC()
	body, err := json.Marshal(map[string]time.Time{"expiresAt": expires})
	if err != nil {
		t.Fatal(err)
	}
	path := "/music/playback-grants/" + grant.GrantID + "/expiration"
	for attempt := 0; attempt < 2; attempt++ {
		response := fixture.request(t, "PUT", path, body, cookie, map[string]string{"Origin": websiteOrigin, "Content-Type": "application/json"})
		if response.StatusCode != 200 {
			t.Fatalf("expiration replacement: got %d", response.StatusCode)
		}
		var renewed testGrant
		if err := json.NewDecoder(response.Body).Decode(&renewed); err != nil {
			t.Fatal(err)
		}
		if !renewed.ExpiresAt.Equal(expires) || renewed.MediaURL != grant.MediaURL {
			t.Fatal("PUT retry changed the requested expiration or source")
		}
		fixture.now.Add(1)
	}
	for _, body := range [][]byte{nil, []byte(`{"expiresAt":"invalid"}`), []byte(`{"expiresAt":"2099-01-01T00:00:00Z"}`)} {
		if fixture.request(t, "PUT", path, body, cookie, map[string]string{"Origin": websiteOrigin, "Content-Type": "application/json"}).StatusCode != 400 {
			t.Fatal("invalid expiration accepted")
		}
	}
}

func TestDistinctSessionsBehindOneProxyDoNotShareAnAddressLimit(t *testing.T) {
	fixture := prepareFixture(t)
	for count := 0; count < 100; count++ {
		response := fixture.request(t, "POST", "/music/playback-grants", []byte(`{"trackId":"test-tone"}`), nil, map[string]string{"Origin": websiteOrigin, "Content-Type": "application/json", "X-Forwarded-For": "invalid", "Forwarded": "for=203.0.113.99"})
		if response.StatusCode != http.StatusCreated {
			t.Fatalf("session %d behind one proxy: got %d", count, response.StatusCode)
		}
	}
}
