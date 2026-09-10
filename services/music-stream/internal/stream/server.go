package stream

import (
	"crypto/rand"
	_ "embed"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"math"
	"net/http"
	"net/netip"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

type Config struct {
	MediaRoot      string
	IndexPath      string
	AllowlistPath  string
	PublicOrigin   string
	AllowedOrigins []string
	Now            func() time.Time
	Logger         *slog.Logger
	Limits         *Limits
	TrustedProxies []string
}

const cookieName = "__Secure-music-session"
const sessionLifetime = 24 * time.Hour
const minimumGrantLifetime = 30 * time.Minute
const grantMargin = 15 * time.Minute
const jsonBodyLimit = 1024

type browserSession struct {
	expires   time.Time
	creation  tokenBucket
	media     tokenBucket
	responses int
}
type playbackGrant struct {
	id      string
	session [32]byte
	trackID string
	media   *validatedPackage
	created time.Time
	expires time.Time
	revoked bool
	renewal tokenBucket
}
type Service struct {
	counters    Counters
	config      Config
	root        *os.Root
	origins     map[string]bool
	mu          sync.Mutex
	tracks      map[string]*validatedPackage
	sessions    map[[32]byte]*browserSession
	grants      map[string]*playbackGrant
	addresses   map[netip.Addr]*addressLimit
	limits      Limits
	proxies     []netip.Prefix
	addressIdle time.Duration
	responses   int
	stop        chan struct{}
	closed      sync.Once
}

func validOrigin(origin string) bool {
	parsed, err := url.Parse(origin)
	return err == nil && parsed.Scheme == "https" && parsed.Host != "" && parsed.Path == "" && parsed.RawQuery == "" && parsed.Fragment == "" && parsed.User == nil
}

// New validates configuration and all active media before accepting traffic.
func New(config Config) (*Service, error) {
	limits := DefaultLimits()
	if config.Limits != nil {
		limits = *config.Limits
	}
	if err := validateLimits(limits); err != nil {
		return nil, fmt.Errorf("configure limits: %w", err)
	}
	proxies := make([]netip.Prefix, 0, len(config.TrustedProxies))
	for _, value := range config.TrustedProxies {
		prefix, err := netip.ParsePrefix(value)
		if err != nil {
			return nil, fmt.Errorf("configure trusted proxy: %w", err)
		}
		proxies = append(proxies, prefix.Masked())
	}
	if !validOrigin(config.PublicOrigin) || len(config.AllowedOrigins) == 0 {
		return nil, fmt.Errorf("configure explicit HTTPS origins")
	}
	origins := make(map[string]bool)
	for _, origin := range config.AllowedOrigins {
		if !validOrigin(origin) {
			return nil, fmt.Errorf("invalid website origin")
		}
		origins[origin] = true
	}
	mediaRoot, err := filepath.Abs(config.MediaRoot)
	if err != nil {
		return nil, fmt.Errorf("resolve media root: %w", err)
	}
	mediaRoot, err = filepath.EvalSymlinks(mediaRoot)
	if err != nil {
		return nil, fmt.Errorf("resolve media storage: %w", err)
	}
	config.MediaRoot = mediaRoot
	root, err := os.OpenRoot(mediaRoot)
	if err != nil {
		return nil, fmt.Errorf("open media storage: %w", err)
	}
	tracks, err := loadCatalog(config, root)
	if err != nil {
		root.Close()
		return nil, err
	}
	if config.Now == nil {
		config.Now = time.Now
	}
	if config.Logger == nil {
		config.Logger = slog.New(slog.NewJSONHandler(io.Discard, nil))
	}
	service := &Service{config: config, root: root, origins: origins, tracks: tracks, sessions: make(map[[32]byte]*browserSession), grants: make(map[string]*playbackGrant), addresses: make(map[netip.Addr]*addressLimit), stop: make(chan struct{})}
	service.limits = limits
	service.proxies = proxies
	service.addressIdle = max(addressRetention, time.Duration(math.Ceil(float64(limits.AddressGrantBurst)/float64(limits.AddressGrantRate)*60))*time.Second)
	go service.expireLoop()
	return service, nil
}

func (service *Service) expireLoop() {
	ticker := time.NewTicker(time.Minute)
	defer ticker.Stop()
	for {
		select {
		case <-service.stop:
			return
		case <-ticker.C:
			service.mu.Lock()
			service.expire(service.config.Now())
			service.mu.Unlock()
		}
	}
}

func (service *Service) expire(now time.Time) {
	for address, entry := range service.addresses {
		if now.Sub(entry.lastSeen) >= service.addressIdle {
			delete(service.addresses, address)
		}
	}
	for key, session := range service.sessions {
		if !now.Before(session.expires) {
			delete(service.sessions, key)
		}
	}
	for id, grant := range service.grants {
		if _, exists := service.sessions[grant.session]; !exists || !now.Before(grant.expires.Add(minimumGrantLifetime)) {
			delete(service.grants, id)
		}
	}
}

// Close stops expiration work and releases the private media root.
func (service *Service) Close() error {
	var err error
	service.closed.Do(func() { close(service.stop); err = service.root.Close() })
	return err
}

// Reload atomically selects a fully validated catalog and media index.
func (service *Service) Reload() error {
	tracks, err := loadCatalog(service.config, service.root)
	if err != nil {
		return err
	}
	service.mu.Lock()
	service.tracks = tracks
	service.mu.Unlock()
	return nil
}

type responseWriter struct {
	head bool
	http.ResponseWriter
	status  int
	bytes   int
	cache   string
	trackID string
}

func (writer *responseWriter) WriteHeader(status int) {
	if writer.status != 0 {
		return
	}
	writer.status = status
	writer.Header().Set("Cache-Control", writer.cache)
	writer.Header().Set("X-Content-Type-Options", "nosniff")
	writer.ResponseWriter.WriteHeader(status)
}
func (writer *responseWriter) Write(data []byte) (int, error) {
	if writer.status == 0 {
		writer.WriteHeader(http.StatusOK)
	}
	if writer.head {
		return len(data), nil
	}
	count, err := writer.ResponseWriter.Write(data)
	writer.bytes += count
	return count, err
}

func randomValue(size int) (string, error) {
	value := make([]byte, size)
	if _, err := rand.Read(value); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(value), nil
}

//go:embed contract.openapi.json
var openAPIContract []byte

func sendError(writer http.ResponseWriter, status int, code string) {
	writer.Header().Set("Content-Type", "application/json")
	writer.WriteHeader(status)
	_ = json.NewEncoder(writer).Encode(map[string]string{"code": code, "message": strings.ReplaceAll(code, "_", " ") + ".", "requestId": writer.Header().Get("X-Request-ID")})
}

func sendJSON(writer http.ResponseWriter, status int, value any) {
	writer.Header().Set("Content-Type", "application/json")
	writer.WriteHeader(status)
	_ = json.NewEncoder(writer).Encode(value)
}

// ServeHTTP exposes the grant API and authorized HLS resources.
func (service *Service) ServeHTTP(output http.ResponseWriter, request *http.Request) {
	writer := &responseWriter{ResponseWriter: output, cache: "no-store", head: request.Method == http.MethodHead}
	started := time.Now()
	route := request.URL.Path
	requestID, err := randomValue(12)
	if err != nil {
		sendError(writer, 503, "media_unavailable")
		return
	}
	writer.Header().Set("X-Request-ID", requestID)
	defer func() {
		service.mu.Lock()
		service.counters.Requests++
		service.counters.Bytes += uint64(writer.bytes)
		if writer.status >= 400 {
			service.counters.RejectedRequests++
		}
		service.mu.Unlock()
		attributes := []any{"requestId", requestID, "route", routeTemplate(route), "method", request.Method, "status", writer.status, "bytes", writer.bytes, "durationMs", time.Since(started).Milliseconds()}
		if writer.trackID != "" {
			attributes = append(attributes, "trackId", writer.trackID)
		}
		service.config.Logger.Info("music_request", attributes...)
	}()
	if strings.Contains(request.URL.EscapedPath(), "%") || strings.Contains(route, "//") || strings.Contains(route, "/../") || request.URL.RawQuery != "" {
		sendError(writer, 400, "invalid_request")
		return
	}
	origin := request.Header.Get("Origin")
	if origin != "" && !service.origins[origin] {
		sendError(writer, 403, "origin_denied")
		return
	}
	if service.origins[origin] {
		writer.Header().Set("Access-Control-Allow-Origin", origin)
		writer.Header().Set("Access-Control-Allow-Credentials", "true")
		writer.Header().Set("Access-Control-Expose-Headers", "Retry-After, Content-Range, Accept-Ranges, X-Request-ID, Location, ETag")
		writer.Header().Set("Vary", "Origin")
	}
	if request.Method == http.MethodOptions {
		service.preflight(writer, request)
		return
	}
	if route == schemaPath {
		if request.Method != http.MethodGet && request.Method != http.MethodHead {
			methodError(writer, "GET, HEAD, OPTIONS")
			return
		}
		writer.Header().Set("Content-Type", "application/json")
		writer.WriteHeader(http.StatusOK)
		if request.Method == http.MethodGet {
			_, _ = writer.Write(openAPIContract)
		}
		return
	}
	if route == healthPath || route == readinessPath {
		if request.Method != http.MethodGet && request.Method != http.MethodHead {
			methodError(writer, "GET, HEAD, OPTIONS")
			return
		}
		if route == readinessPath && !service.ready() {
			sendError(writer, 503, "media_unavailable")
			return
		}
		sendJSON(writer, 200, map[string]string{"status": "ok"})
		return
	}
	if route == grantRoute {
		if request.Method != http.MethodPost {
			methodError(writer, "POST, OPTIONS")
			return
		}
		if !service.origins[origin] {
			sendError(writer, 403, "origin_denied")
			return
		}
		service.createGrant(writer, request)
		return
	}
	if strings.HasPrefix(route, grantRoute+"/") {
		service.grantResource(writer, request)
		return
	}
	if strings.HasPrefix(route, "/music/hls/") {
		writer.cache = "private, no-store"
		service.mediaResource(writer, request)
		return
	}
	sendError(writer, 404, "not_found")
}

func routeTemplate(route string) string {
	if strings.HasPrefix(route, "/music/hls/") {
		return "/music/hls/{grantId}/{assetId}/{file}"
	}
	if strings.HasPrefix(route, grantRoute+"/") {
		return grantRoute + "/{grantId}"
	}
	if route == grantRoute || route == healthPath || route == readinessPath {
		return route
	}
	return "unknown"
}

func methodError(writer http.ResponseWriter, allow string) {
	writer.Header().Set("Allow", allow)
	sendError(writer, 405, "method_not_allowed")
}

func (service *Service) preflight(writer http.ResponseWriter, request *http.Request) {
	if !service.origins[request.Header.Get("Origin")] {
		sendError(writer, 403, "origin_denied")
		return
	}
	method := request.Header.Get("Access-Control-Request-Method")
	allowed := ""
	if request.URL.Path == grantRoute {
		allowed = "POST, OPTIONS"
	} else if strings.HasPrefix(request.URL.Path, grantRoute+"/") {
		parts := strings.Split(strings.TrimPrefix(request.URL.Path, grantRoute+"/"), "/")
		if len(parts[0]) == 22 {
			if len(parts) == 1 {
				allowed = "GET, HEAD, DELETE, OPTIONS"
			} else if len(parts) == 2 && parts[1] == "expiration" {
				allowed = "PUT, OPTIONS"
			}
		}
	} else if strings.HasPrefix(request.URL.Path, "/music/hls/") {
		parts := strings.Split(strings.TrimPrefix(request.URL.Path, "/music/hls/"), "/")
		if len(parts) == 3 && len(parts[0]) == 22 && assetPattern.MatchString(parts[1]) {
			allowed = "GET, HEAD, OPTIONS"
		}
	} else if request.URL.Path == healthPath || request.URL.Path == readinessPath || request.URL.Path == schemaPath {
		allowed = "GET, HEAD, OPTIONS"
	}
	if allowed == "" {
		sendError(writer, 404, "not_found")
		return
	}
	if !strings.Contains(", "+allowed+",", ", "+method+",") {
		methodError(writer, allowed)
		return
	}
	for _, header := range strings.Split(strings.ToLower(request.Header.Get("Access-Control-Request-Headers")), ",") {
		header = strings.TrimSpace(header)
		if header != "" && header != "content-type" && header != "range" {
			sendError(writer, 403, "headers_denied")
			return
		}
	}
	writer.Header().Set("Access-Control-Allow-Methods", allowed)
	writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Range")
	writer.Header().Set("Vary", "Origin, Access-Control-Request-Method, Access-Control-Request-Headers")
	writer.WriteHeader(204)
}

func (service *Service) ready() bool {
	service.mu.Lock()
	defer service.mu.Unlock()
	for _, media := range service.tracks {
		for _, file := range media.files {
			opened, err := service.root.Open(packagePath(media.record.AssetID, file.Name))
			if err != nil {
				return false
			}
			info, err := opened.Stat()
			opened.Close()
			if err != nil || info.Size() != file.Bytes {
				return false
			}
		}
	}
	return true
}
