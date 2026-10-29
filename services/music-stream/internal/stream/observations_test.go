package stream_test

import (
	"bytes"
	"encoding/json"
	"github.com/tyemirov/tyemirov.github.io/services/music-stream/internal/stream"
	"log/slog"
	"strings"
	"testing"
)

func TestPlaybackObservationsAndPreflightCaching(t *testing.T) {
	var logs bytes.Buffer
	f := prepareFixture(t, func(c *stream.Config) { c.Logger = slog.New(slog.NewJSONHandler(&logs, nil)) })
	_, cookie := f.create(t, nil)
	path := "/music/playback-observations"
	headers := map[string]string{"Origin": websiteOrigin, "Content-Type": "application/json"}
	valid := `{"trackId":"test-tone","outcome":"playing","action":"start","browser":"chromium","timeZone":"Asia/Tbilisi","elapsedMs":800,"grantMs":300,"readyMs":750}`
	for _, tc := range []struct {
		name, body string
		status     int
	}{
		{"valid", valid, 204},
		{"null phases", strings.ReplaceAll(strings.ReplaceAll(valid, `"grantMs":300`, `"grantMs":null`), `"readyMs":750`, `"readyMs":null`), 204},
		{"unknown field", strings.Replace(valid, `"trackId"`, `"ip":"private","trackId"`, 1), 400},
		{"grant after elapsed", strings.Replace(valid, `"grantMs":300`, `"grantMs":900`, 1), 400},
		{"ready after elapsed", strings.Replace(valid, `"readyMs":750`, `"readyMs":900`, 1), 400},
		{"ready before grant", strings.Replace(valid, `"readyMs":750`, `"readyMs":100`, 1), 400},
		{"invalid duration", strings.Replace(valid, `800`, `300001`, 1), 400},
		{"invalid timezone", strings.Replace(valid, `Asia/Tbilisi`, `invalid region;ip`, 1), 400},
		{"invalid browser", strings.Replace(valid, `chromium`, `full-user-agent`, 1), 400},
		{"missing field", strings.Replace(valid, `,"readyMs":750`, ``, 1), 400},
		{"unknown track", strings.Replace(valid, `test-tone`, `unknown-track`, 1), 404},
		{"large body", strings.Repeat(" ", 1100), 413},
	} {
		t.Run(tc.name, func(t *testing.T) {
			r := f.request(t, "POST", path, []byte(tc.body), cookie, headers)
			if r.Header.Get("Timing-Allow-Origin") != websiteOrigin {
				t.Fatal("allowed origin timing is unavailable")
			}
			if r.StatusCode != tc.status {
				t.Fatalf("status %d want %d", r.StatusCode, tc.status)
			}
		})
	}
	r := f.request(t, "POST", path, []byte(valid), nil, headers)
	if r.StatusCode != 401 {
		t.Fatalf("anonymous observation: %d", r.StatusCode)
	}
	r = f.request(t, "POST", path, []byte(valid), cookie, map[string]string{"Origin": "https://foreign.invalid", "Content-Type": "application/json"})
	if r.StatusCode != 403 || r.Header.Get("Timing-Allow-Origin") != "" {
		t.Fatalf("foreign origin: %d", r.StatusCode)
	}
	r = f.request(t, "GET", path, nil, cookie, headers)
	if r.StatusCode != 405 {
		t.Fatalf("unsafe method: %d", r.StatusCode)
	}
	r = f.request(t, "POST", path, []byte(valid), cookie, map[string]string{"Content-Type": "application/json"})
	if r.StatusCode != 403 {
		t.Fatalf("absent origin: %d", r.StatusCode)
	}
	for _, path := range []string{path, "/music/playback-grants"} {
		h := map[string]string{"Origin": websiteOrigin, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type"}
		r = f.request(t, "OPTIONS", path, nil, nil, h)
		if r.StatusCode != 204 || r.Header.Get("Access-Control-Max-Age") != "600" {
			t.Fatalf("successful preflight not cached: %d %v", r.StatusCode, r.Header)
		}
		h["Access-Control-Request-Headers"] = "x-private"
		r = f.request(t, "OPTIONS", path, nil, nil, h)
		if r.StatusCode != 403 || r.Header.Get("Access-Control-Max-Age") != "" {
			t.Fatal("rejected preflight cached")
		}
	}
	found := false
	for _, line := range strings.Split(logs.String(), "\n") {
		var event map[string]any
		if json.Unmarshal([]byte(line), &event) == nil && event["msg"] == "music_playback_observation" {
			found = true
			if event["trackId"] != "test-tone" || event["elapsedMs"] != float64(800) || event["timeZone"] != "Asia/Tbilisi" {
				t.Fatal(event)
			}
		}
	}
	if !found {
		t.Fatal("observation log missing")
	}
	if strings.Contains(logs.String(), cookie.Value) || strings.Contains(logs.String(), "full-user-agent") {
		t.Fatal("private input reached logs")
	}
}
