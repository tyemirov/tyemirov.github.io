package stream

import (
	"fmt"
	"math"
	"net"
	"net/http"
	"net/netip"
	"strconv"
	"strings"
	"time"
)

const addressRetention = 2 * time.Minute

// Limits defines the bounded authorization and request state for one service instance.
type Limits struct {
	AddressGrantRate      int
	AddressGrantBurst     int
	SessionGrantRate      int
	SessionGrantBurst     int
	GrantRenewalRate      int
	GrantRenewalBurst     int
	SessionMediaRate      int
	SessionMediaBurst     int
	Sessions              int
	Grants                int
	SessionGrants         int
	ClientAddresses       int
	SessionMediaResponses int
	MediaResponses        int
}

// DefaultLimits returns the current single-instance capacity and request defaults.
func DefaultLimits() Limits {
	return Limits{AddressGrantRate: 60, AddressGrantBurst: 20, SessionGrantRate: 20, SessionGrantBurst: 5, GrantRenewalRate: 2, GrantRenewalBurst: 1, SessionMediaRate: 600, SessionMediaBurst: 60, Sessions: 10000, Grants: 80000, SessionGrants: 8, ClientAddresses: 10000, SessionMediaResponses: 8, MediaResponses: 256}
}

func validateLimits(limits Limits) error {
	for _, value := range []int{limits.AddressGrantRate, limits.AddressGrantBurst, limits.SessionGrantRate, limits.SessionGrantBurst, limits.GrantRenewalRate, limits.GrantRenewalBurst, limits.SessionMediaRate, limits.SessionMediaBurst, limits.Sessions, limits.Grants, limits.SessionGrants, limits.ClientAddresses, limits.SessionMediaResponses, limits.MediaResponses} {
		if value < 1 || value > 1000000 {
			return fmt.Errorf("each service limit must be between 1 and 1000000")
		}
	}
	return nil
}

type tokenBucket struct {
	tokens  float64
	updated time.Time
}

type addressLimit struct {
	bucket   tokenBucket
	lastSeen time.Time
}

func newBucket(now time.Time, burst int) tokenBucket {
	return tokenBucket{tokens: float64(burst), updated: now}
}

func (bucket *tokenBucket) take(now time.Time, perMinute, burst int) time.Duration {
	elapsed := max(0, now.Sub(bucket.updated).Seconds())
	rate := float64(perMinute) / 60
	bucket.tokens = min(float64(burst), bucket.tokens+elapsed*rate)
	bucket.updated = now
	if bucket.tokens < 1 {
		return time.Duration(math.Ceil((1 - bucket.tokens) / rate * float64(time.Second)))
	}
	bucket.tokens--
	return 0
}

func rejectRate(writer http.ResponseWriter, delay time.Duration) {
	writer.Header().Set("Retry-After", strconv.Itoa(max(1, int(math.Ceil(delay.Seconds())))))
	sendError(writer, http.StatusTooManyRequests, "rate_limited")
}

func connectionAddress(request *http.Request) (netip.Addr, error) {
	host, _, err := net.SplitHostPort(request.RemoteAddr)
	if err != nil {
		return netip.Addr{}, err
	}
	address, err := netip.ParseAddr(host)
	return address.Unmap(), err
}

func (service *Service) trusted(address netip.Addr) bool {
	for _, prefix := range service.proxies {
		if prefix.Contains(address) {
			return true
		}
	}
	return false
}

func (service *Service) clientAddress(request *http.Request) (netip.Addr, error) {
	address, err := connectionAddress(request)
	if err != nil || !service.trusted(address) {
		return address, err
	}
	forwarded := strings.Split(request.Header.Get("X-Forwarded-For"), ",")
	if len(forwarded) > 16 {
		return netip.Addr{}, fmt.Errorf("forwarded chain exceeds limit")
	}
	for index := len(forwarded) - 1; index >= 0 && service.trusted(address); index-- {
		address, err = netip.ParseAddr(strings.TrimSpace(forwarded[index]))
		if err != nil || address.Zone() != "" {
			return netip.Addr{}, fmt.Errorf("invalid forwarded address")
		}
		address = address.Unmap()
	}
	return address, nil
}

// admitAddress runs under the service lock. Unknown addresses cannot grow state past its bound.
func (service *Service) admitAddress(writer http.ResponseWriter, request *http.Request, now time.Time) bool {
	address, err := service.clientAddress(request)
	if err != nil {
		sendError(writer, 400, "invalid_request")
		return false
	}
	entry, exists := service.addresses[address]
	if !exists {
		if len(service.addresses) >= service.limits.ClientAddresses {
			sendError(writer, 503, "media_unavailable")
			return false
		}
		entry = &addressLimit{bucket: newBucket(now, service.limits.AddressGrantBurst), lastSeen: now}
		service.addresses[address] = entry
	}
	entry.lastSeen = now
	if delay := entry.bucket.take(now, service.limits.AddressGrantRate, service.limits.AddressGrantBurst); delay > 0 {
		rejectRate(writer, delay)
		return false
	}
	return true
}
