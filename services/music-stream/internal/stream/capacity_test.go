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
		response := fixture.request(t, "POST", "/api/playback-grants", []byte(`{"trackId":"test-tone"}`), entry.cookie, map[string]string{"Origin": websiteOrigin, "Content-Type": "application/json"})
		if response.StatusCode != entry.status {
			t.Fatalf("capacity: got %d want %d", response.StatusCode, entry.status)
		}
	}
	playlist, _ := url.Parse(grant.PlaylistURL)
	if fixture.request(t, "GET", playlist.Path, nil, cookie, nil).StatusCode != 200 {
		t.Fatal("capacity pressure invalidated a current grant")
	}
	fixture.now.Add(24 * 60 * 60)
	fixture.create(t, nil)
}

func TestTrustedProxyAndBoundedAddressState(t *testing.T) {
	fixture := prepareFixture(t, func(config *stream.Config) {
		limits := stream.DefaultLimits()
		limits.AddressGrantBurst = 1
		limits.ClientAddresses = 2
		config.Limits = &limits
		config.TrustedProxies = []string{"127.0.0.1/32"}
	})
	headers := map[string]string{"Origin": websiteOrigin, "Content-Type": "application/json"}
	for _, entry := range []struct {
		address string
		status  int
	}{{"203.0.113.1", 201}, {"203.0.113.1", 429}, {"203.0.113.2, 127.0.0.1", 201}, {"203.0.113.3", 503}, {"invalid", 400}} {
		headers["X-Forwarded-For"] = entry.address
		response := fixture.request(t, "POST", "/api/playback-grants", []byte(`{"trackId":"test-tone"}`), nil, headers)
		if response.StatusCode != entry.status {
			t.Fatalf("proxy address %s: got %d want %d", entry.address, response.StatusCode, entry.status)
		}
	}
	fixture.now.Add(121)
	headers["X-Forwarded-For"] = "203.0.113.3"
	if fixture.request(t, "POST", "/api/playback-grants", []byte(`{"trackId":"test-tone"}`), nil, headers).StatusCode != 201 {
		t.Fatal("idle address state was not released")
	}
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
			playlist, _ := url.Parse(grant.PlaylistURL)
			otherPlaylist, _ := url.Parse(other.PlaylistURL)
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
			request, _ := http.NewRequest("GET", server.URL+playlist.Path, nil)
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
			path, credential := playlist.Path, cookie
			if boundary == "host" {
				path, credential = otherPlaylist.Path, otherCookie
			}
			response := fixture.request(t, "GET", path, nil, credential, nil)
			if response.StatusCode != 429 || response.Header.Get("Retry-After") == "" {
				t.Errorf("concurrent %s limit: got %d", boundary, response.StatusCode)
			}
			body, _ := io.ReadAll(response.Body)
			if !strings.Contains(string(body), "rate_limited") {
				t.Error("missing typed limit response")
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
