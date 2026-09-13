package stream_test

import (
	"net/http"
	"testing"
)

func TestNativeMusicPrefix(t *testing.T) {
	fixture := prepareFixture(t)
	for path, expected := range map[string]int{"/music/readyz": 200, "/readyz": 404, "/api/playback-grants": 404, "/music/openapi.json": 200} {
		response, err := fixture.server.Client().Get(fixture.server.URL + path)
		if err != nil {
			t.Fatal(err)
		}
		response.Body.Close()
		if response.StatusCode != expected {
			t.Fatalf("GET %s: got %d, want %d", path, response.StatusCode, expected)
		}
	}
	request, err := http.NewRequest(http.MethodGet, fixture.server.URL+"/music/playback-grants", nil)
	if err != nil {
		t.Fatal(err)
	}
	response, err := fixture.server.Client().Do(request)
	if err != nil {
		t.Fatal(err)
	}
	response.Body.Close()
	if response.StatusCode != http.StatusMethodNotAllowed {
		t.Fatalf("method status: %d", response.StatusCode)
	}
}

func TestMusicReadinessSupportsHead(t *testing.T) {
	fixture := prepareFixture(t)
	response, err := fixture.server.Client().Head(fixture.server.URL + "/music/readyz")
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	if response.StatusCode != 200 {
		t.Fatalf("HEAD readiness: %d", response.StatusCode)
	}
}
