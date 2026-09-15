package stream_test

import (
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/tyemirov/tyemirov.github.io/services/music-stream/internal/stream"
)

func TestConfiguredCapacityPreservesExistingAccess(t *testing.T) {
	fixture := prepareFixture(t, func(config *stream.Config) {
		limits := stream.DefaultLimits()
		limits.Sessions = 1
		limits.Grants = 2
		limits.SessionGrants = 2
		config.Limits = &limits
	})
	grant, cookie := fixture.create(t, nil)
	fixture.create(t, cookie)
	for _, entry := range []struct {
		cookie *http.Cookie
		status int
	}{{nil, 503}, {cookie, 409}} {
		response := fixture.request(t, "POST", "/music/playback-grants", []byte(`{"trackId":"test-tone"}`), entry.cookie, map[string]string{"Origin": websiteOrigin, "Content-Type": "application/json"})
		if response.StatusCode != entry.status {
			t.Fatalf("capacity: got %d want %d", response.StatusCode, entry.status)
		}
	}
	mediaURL, _ := url.Parse(grant.MediaURL)
	if fixture.request(t, "GET", mediaURL.Path, nil, cookie, nil).StatusCode != 200 {
		t.Fatal("capacity pressure invalidated a current grant")
	}
	fixture.now.Add(24 * 60 * 60)
	fixture.create(t, nil)
}

type heldResponse struct {
	http.ResponseWriter
	entered chan<- struct{}
	release <-chan struct{}
}

func (writer *heldResponse) Write(data []byte) (int, error) {
	select {
	case writer.entered <- struct{}{}:
	default:
	}
	<-writer.release
	return writer.ResponseWriter.Write(data)
}

func TestConcurrentMediaResponsesReleaseCapacity(t *testing.T) {
	for _, boundary := range []string{"session", "host"} {
		t.Run(boundary, func(t *testing.T) {
			fixture := prepareFixture(t, func(config *stream.Config) {
				limits := stream.DefaultLimits()
				if boundary == "session" {
					limits.SessionMediaResponses = 1
				} else {
					limits.MediaResponses = 1
				}
				config.Limits = &limits
			})
			grant, cookie := fixture.create(t, nil)
			other, otherCookie := fixture.create(t, nil)
			mediaURL, _ := url.Parse(grant.MediaURL)
			otherMediaURL, _ := url.Parse(other.MediaURL)
			entered, release := make(chan struct{}, 1), make(chan struct{})
			released := false
			defer func() {
				if !released {
					close(release)
				}
			}()
			server := httptest.NewTLSServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
				if request.Header.Get("X-Test-Hold") == "yes" {
					fixture.service.ServeHTTP(&heldResponse{ResponseWriter: writer, entered: entered, release: release}, request)
				} else {
					fixture.service.ServeHTTP(writer, request)
				}
			}))
			defer server.Close()
			client := server.Client()
			client.Timeout = 5 * time.Second
			request, _ := http.NewRequest("GET", server.URL+mediaURL.Path, nil)
			request.AddCookie(cookie)
			request.Header.Set("X-Test-Hold", "yes")
			done := make(chan error, 1)
			go func() {
				response, err := client.Do(request)
				if err == nil {
					_, err = io.Copy(io.Discard, response.Body)
					response.Body.Close()
				}
				done <- err
			}()
			select {
			case <-entered:
			case <-time.After(3 * time.Second):
				t.Fatal("response did not reach the injected slow output")
			}
			path, credential := mediaURL.Path, cookie
			if boundary == "host" {
				path, credential = otherMediaURL.Path, otherCookie
			}
			response := fixture.request(t, "GET", path, nil, credential, nil)
			if response.StatusCode != 503 || response.Header.Get("Retry-After") != "" {
				t.Errorf("concurrent %s limit: got %d", boundary, response.StatusCode)
			}
			body, _ := io.ReadAll(response.Body)
			if !strings.Contains(string(body), "media_unavailable") {
				t.Error("missing typed capacity response")
			}
			close(release)
			released = true
			if err := <-done; err != nil {
				t.Fatal(err)
			}
			if fixture.request(t, "GET", path, nil, credential, nil).StatusCode != 200 {
				t.Fatal("completed response did not release capacity")
			}
		})
	}
}
