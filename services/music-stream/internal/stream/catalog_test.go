package stream_test

import (
	"bytes"
	"encoding/json"
	"io"
	"log/slog"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/tyemirov/tyemirov.github.io/services/music-stream/internal/stream"
)

type requestLogSink chan []byte

func (sink requestLogSink) Write(data []byte) (int, error) {
	sink <- append([]byte(nil), data...)
	return len(data), nil
}

func TestRequestLogsIdentifyKnownTracksWithoutPrivateValues(t *testing.T) {
	logs := make(requestLogSink, 16)
	fixture := prepareFixture(t, func(config *stream.Config) { config.Logger = slog.New(slog.NewJSONHandler(logs, nil)) })
	grant, cookie := fixture.create(t, nil)
	playlist, _ := url.Parse(grant.PlaylistURL)
	readLog := func(trackID string) {
		t.Helper()
		select {
		case data := <-logs:
			var entry struct {
				Message   string `json:"msg"`
				TrackID   string `json:"trackId"`
				RequestID string `json:"requestId"`
			}
			if err := json.Unmarshal(data, &entry); err != nil {
				t.Fatalf("parse request event: %v", err)
			}
			if entry.Message != "music_request" || entry.TrackID != trackID || entry.RequestID == "" {
				t.Fatalf("request event has track %q, want %q", entry.TrackID, trackID)
			}
			for _, private := range []string{cookie.Value, grant.GrantID, fixture.assetID, fixture.mediaRoot} {
				if bytes.Contains(data, []byte(private)) {
					t.Fatal("request event contains private context")
				}
			}
		case <-time.After(5 * time.Second):
			t.Fatal("request event did not arrive")
		}
	}
	readLog("test-tone")
	for _, path := range []string{playlist.Path, "/music/playback-grants/" + grant.GrantID} {
		response := fixture.request(t, "GET", path, nil, cookie, nil)
		if response.StatusCode != 200 {
			t.Fatalf("authorized request returned %d", response.StatusCode)
		}
		readLog("test-tone")
	}
	if fixture.renew(t, grant, cookie).StatusCode != 200 {
		t.Fatal("grant renewal failed")
	}
	readLog("test-tone")
	if fixture.request(t, "DELETE", "/music/playback-grants/"+grant.GrantID, nil, cookie, map[string]string{"Origin": websiteOrigin}).StatusCode != 204 {
		t.Fatal("grant removal failed")
	}
	readLog("test-tone")
	for _, path := range []string{"/music/readyz", playlist.Path} {
		fixture.request(t, "GET", path, nil, nil, nil)
		readLog("")
	}
	fixture.request(t, "POST", "/music/playback-grants", []byte(`{"trackId":"unknown-track"}`), cookie, map[string]string{"Origin": websiteOrigin, "Content-Type": "application/json"})
	readLog("")
}

func TestRejectedCatalogKeepsPlaybackAndDisablementStopsIt(t *testing.T) {
	fixture := prepareFixture(t)
	grant, cookie := fixture.create(t, nil)
	playlist, _ := url.Parse(grant.PlaylistURL)
	writeJSON(t, fixture.allowlistPath, map[string]any{"tracks": []any{map[string]any{"id": "test-tone", "playback": map[string]any{"kind": "hls", "durationMs": 999}}}})
	if fixture.service.Reload() == nil {
		t.Fatal("invalid candidate activated")
	}
	if fixture.request(t, "GET", playlist.Path, nil, cookie, nil).StatusCode != 200 {
		t.Fatal("invalid candidate broke existing playback")
	}
	fixture.create(t, cookie)
	writeJSON(t, fixture.allowlistPath, map[string]any{"tracks": []any{map[string]any{"id": "test-tone", "playback": map[string]any{"kind": "external"}}}})
	if err := fixture.service.Reload(); err != nil {
		t.Fatal(err)
	}
	if fixture.request(t, "GET", playlist.Path, nil, cookie, nil).StatusCode != 410 {
		t.Fatal("disabled track still authorizes media")
	}
	if fixture.request(t, "POST", "/music/playback-grants", []byte(`{"trackId":"test-tone"}`), cookie, map[string]string{"Origin": websiteOrigin, "Content-Type": "application/json"}).StatusCode != 404 {
		t.Fatal("disabled track still creates grants")
	}
}

func TestReplacementPinsExistingGrantToOriginalPackage(t *testing.T) {
	fixture := prepareFixture(t)
	first, cookie := fixture.create(t, nil)
	source := filepath.Join(t.TempDir(), "replacement.wav")
	if output, err := exec.Command("ffmpeg", "-nostdin", "-v", "error", "-f", "lavfi", "-i", "sine=frequency=660:sample_rate=48000", "-t", "13", source).CombinedOutput(); err != nil {
		t.Fatalf("replacement source: %v %s", err, output)
	}
	output, err := exec.Command("node", "../../../../scripts/music/prepare.mjs", "--source", source, "--media-root", fixture.mediaRoot, "--track-id", "test-tone").CombinedOutput()
	if err != nil {
		t.Fatalf("replacement preparation: %v %s", err, output)
	}
	var receipt map[string]any
	if err = json.Unmarshal(output, &receipt); err != nil {
		t.Fatal(err)
	}
	delete(receipt, "trackId")
	writeJSON(t, fixture.indexPath, map[string]any{"tracks": map[string]any{"test-tone": receipt}})
	if err = fixture.service.Reload(); err != nil {
		t.Fatal(err)
	}
	second, _ := fixture.create(t, cookie)
	if first.PlaylistURL == second.PlaylistURL || !strings.Contains(second.PlaylistURL, receipt["assetId"].(string)) {
		t.Fatal("new grant did not select the new package")
	}
	for _, grant := range []testGrant{first, second} {
		playlist, _ := url.Parse(grant.PlaylistURL)
		if fixture.request(t, "GET", playlist.Path, nil, cookie, nil).StatusCode != 200 {
			t.Fatal("package replacement broke a valid pinned grant")
		}
	}
	oldPlaylist, _ := url.Parse(first.PlaylistURL)
	substituted := strings.Replace(oldPlaylist.Path, fixture.assetID, receipt["assetId"].(string), 1)
	if fixture.request(t, "GET", substituted, nil, cookie, nil).StatusCode != 404 {
		t.Fatal("grant authorized a substituted asset")
	}
}

func TestMissingMediaReadinessAndSafeLogs(t *testing.T) {
	var logs bytes.Buffer
	fixture := prepareFixture(t, func(config *stream.Config) { config.Logger = slog.New(slog.NewJSONHandler(&logs, nil)) })
	grant, cookie := fixture.create(t, nil)
	playlist, _ := url.Parse(grant.PlaylistURL)
	if err := os.Remove(filepath.Join(fixture.mediaRoot, "packages", fixture.assetID, "seg-00000.m4s")); err != nil {
		t.Fatal(err)
	}
	if fixture.request(t, "GET", "/music/healthz", nil, nil, nil).StatusCode != 200 {
		t.Fatal("missing media changed liveness")
	}
	if fixture.request(t, "GET", "/music/readyz", nil, nil, nil).StatusCode != 503 {
		t.Fatal("missing media did not fail readiness")
	}
	response := fixture.request(t, "GET", strings.Replace(playlist.Path, "index.m3u8", "seg-00000.m4s", 1), nil, cookie, nil)
	body, _ := io.ReadAll(response.Body)
	if response.StatusCode != 503 || !bytes.Contains(body, []byte("media_unavailable")) || bytes.Contains(body, []byte(fixture.mediaRoot)) {
		t.Fatal("missing media returned an unsafe or incorrect error")
	}
	if strings.Contains(logs.String(), cookie.Value) || strings.Contains(logs.String(), grant.GrantID) || strings.Contains(logs.String(), fixture.assetID) || strings.Contains(logs.String(), fixture.mediaRoot) {
		t.Fatal("request logs contain private values")
	}
	if !strings.Contains(logs.String(), "/music/hls/{grantId}/{assetId}/{file}") {
		t.Fatal("request log has no bounded route template")
	}
}

func TestRevocationAndHTTPValidation(t *testing.T) {
	fixture := prepareFixture(t)
	grant, cookie := fixture.create(t, nil)
	path := "/music/playback-grants/" + grant.GrantID
	for attempt := 0; attempt < 2; attempt++ {
		if fixture.request(t, "DELETE", path, nil, cookie, map[string]string{"Origin": websiteOrigin}).StatusCode != 204 {
			t.Fatal("deletion is not idempotent")
		}
	}
	playlist, _ := url.Parse(grant.PlaylistURL)
	if fixture.request(t, "HEAD", playlist.Path, nil, cookie, nil).StatusCode != 410 {
		t.Fatal("revoked grant still authorizes media")
	}
	for _, entry := range []struct {
		body   string
		status int
	}{{`{"trackId":"test-tone","unknown":true}`, 400}, {`{"trackId":"../private"}`, 400}, {strings.Repeat("x", 1025), 413}} {
		if fixture.request(t, "POST", "/music/playback-grants", []byte(entry.body), cookie, map[string]string{"Origin": websiteOrigin, "Content-Type": "application/json"}).StatusCode != entry.status {
			t.Fatal("invalid JSON input accepted")
		}
	}
	for _, entry := range []struct {
		path, method, allow string
		status              int
	}{{path, "POST", "GET, HEAD, DELETE, OPTIONS", 405}, {path + "/expiration", "GET", "PUT, OPTIONS", 405}, {"/missing", "OPTIONS", "", 404}} {
		headers := map[string]string{"Origin": websiteOrigin, "Access-Control-Request-Method": "GET"}
		response := fixture.request(t, entry.method, entry.path, nil, cookie, headers)
		if response.StatusCode != entry.status || response.Header.Get("Allow") != entry.allow {
			t.Errorf("method contract %s %s: got %d Allow=%q", entry.method, entry.path, response.StatusCode, response.Header.Get("Allow"))
		}
	}
	for _, path := range []string{"/music/hls/%2e%2e/private", "/music/hls/%252f/private", playlist.Path + "?source=private"} {
		if fixture.request(t, "GET", path, nil, cookie, nil).StatusCode != 400 {
			t.Fatal("encoded or query media path accepted")
		}
	}
}

func TestOperationalCountersContainOnlyAggregateState(t *testing.T) {
	fixture := prepareFixture(t)
	grant, cookie := fixture.create(t, nil)
	playlist, _ := url.Parse(grant.PlaylistURL)
	fixture.request(t, "GET", playlist.Path, nil, cookie, nil)
	fixture.request(t, "GET", playlist.Path, nil, nil, nil)
	stats := fixture.service.Snapshot()
	if stats.Requests != 3 || stats.RejectedRequests != 1 || stats.Bytes == 0 || stats.ActiveSessions != 1 || stats.ActiveGrants != 1 {
		t.Fatalf("incorrect service counters: %+v", stats)
	}
	encoded, err := json.Marshal(stats)
	if err != nil {
		t.Fatal(err)
	}
	for _, private := range []string{cookie.Value, grant.GrantID, fixture.assetID, fixture.mediaRoot} {
		if bytes.Contains(encoded, []byte(private)) {
			t.Fatal("private identity in operational counters")
		}
	}
}
