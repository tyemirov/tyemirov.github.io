// Package gallery owns Studio resources and private gallery assets.
package gallery

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"net/mail"
	"net/url"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/tyemirov/tauth/pkg/sessionvalidator"
	_ "modernc.org/sqlite"
)

const (
	codeInvalidInput = "invalid_input"
	codeNotFound     = "not_found"
	codeStorage      = "storage_unavailable"
)

// Config supplies the application authorization and storage boundary.
type Config struct {
	// Now supplies the clock for download grants and retry schedules. Nil selects time.Now.
	Now func() time.Time
	// ReconcileInterval sets the verified-event polling interval. Zero selects thirty seconds.
	ReconcileInterval time.Duration
	PayPal            *PayPalConfig
	Receipts          *ReceiptConfig
	PublicRoot        string
	DatabasePath      string
	AllowedOrigin     string
	SigningKey        []byte
	CookieName        string
	TenantID          string
	OwnerEmail        string
}

// ReceiptConfig enables receipt delivery through a private Pinguin gRPC endpoint.
// Its API key identifies the Pinguin tenant. SMTP settings belong to Pinguin.
type ReceiptConfig struct {
	Address string
	APIKey  string
}

// Service serves validated requests and retains private state in SQLite.
type Service struct {
	handler               http.Handler
	database              *sql.DB
	config                Config
	validator             *sessionvalidator.Validator
	uploads               chan struct{}
	paypal                *paypalClient
	now                   func() time.Time
	stopReconciliation    context.CancelFunc
	reconciliationStopped chan struct{}
	receipts              *receiptDelivery
	stopReceipts          context.CancelFunc
	receiptsStopped       chan struct{}
}

// New constructs the gallery API with explicit storage and TAuth policy.
func New(config Config) (*Service, error) {
	if config.ReconcileInterval < 0 {
		return nil, errors.New("configure gallery: reconciliation interval must not be negative")
	}
	if config.ReconcileInterval == 0 {
		config.ReconcileInterval = defaultReconciliationInterval
	}
	origin, err := url.Parse(config.AllowedOrigin)
	if err != nil || (origin.Scheme != "https" && !(origin.Scheme == "http" && origin.Hostname() == "localhost")) || origin.Host == "" || origin.User != nil || origin.Path != "" || origin.RawQuery != "" || origin.Fragment != "" {
		return nil, errors.New("configure gallery: allowed origin must use HTTPS or HTTP localhost")
	}
	address, err := mail.ParseAddress(config.OwnerEmail)
	if err != nil || address.Address != config.OwnerEmail || config.OwnerEmail != strings.ToLower(config.OwnerEmail) {
		return nil, errors.New("configure gallery: owner email must be a normalized email address")
	}
	if config.PublicRoot == "" || config.DatabasePath == "" || len(config.SigningKey) < 32 || config.CookieName == "" || config.TenantID == "" {
		return nil, errors.New("configure gallery: public root, database, signing key, cookie name, and tenant are required")
	}
	validator, err := sessionvalidator.New(sessionvalidator.Config{SigningKey: config.SigningKey, Issuer: "tauth", CookieName: config.CookieName})
	if err != nil {
		return nil, fmt.Errorf("configure gallery validator: %w", err)
	}
	database, err := sql.Open("sqlite", config.DatabasePath)
	if err != nil {
		return nil, fmt.Errorf("open gallery database: %w", err)
	}
	database.SetMaxOpenConns(1)
	if _, err = database.Exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;` + gallerySchema); err != nil {
		return nil, errors.Join(fmt.Errorf("initialize gallery database: %w", err), database.Close())
	}
	clock := config.Now
	if clock == nil {
		clock = time.Now
	}
	service := &Service{database: database, config: config, validator: validator, uploads: make(chan struct{}, 2), now: clock}
	if err := service.initializeDraft(); err != nil {
		return nil, errors.Join(err, database.Close())
	}
	if config.PayPal != nil {
		service.paypal, err = newPayPal(*config.PayPal)
		if err != nil {
			return nil, errors.Join(err, database.Close())
		}
	}
	if config.Receipts != nil {
		service.receipts, err = newReceiptDelivery(*config.Receipts)
		if err != nil {
			return nil, errors.Join(err, database.Close())
		}
	}
	service.handler = service.boundary(service.router())
	if service.paypal != nil {
		service.startReconciliation()
	}
	if service.receipts != nil {
		service.startReceipts()
	}
	return service, nil
}

// Close releases database connections after HTTP requests have stopped.
func (service *Service) Close() error {
	if service.stopReceipts != nil {
		service.stopReceipts()
	}
	if service.stopReconciliation != nil {
		service.stopReconciliation()
		<-service.reconciliationStopped
	}
	var receiptError error
	if service.receipts != nil {
		<-service.receiptsStopped
		receiptError = service.receipts.connection.Close()
	}
	if err := errors.Join(service.database.Close(), receiptError); err != nil {
		return fmt.Errorf("close gallery resources: %w", err)
	}
	return nil
}

// ServeHTTP serves the gallery's resource boundary.
func (service *Service) ServeHTTP(writer http.ResponseWriter, request *http.Request) {
	service.handler.ServeHTTP(writer, request)
}

func (service *Service) boundary(next http.Handler) http.Handler {
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		writer.Header().Set("X-Request-ID", uuid.NewString())
		writer.Header().Set("Cache-Control", "no-store")
		writer.Header().Set("X-Content-Type-Options", "nosniff")
		writer.Header().Set("Vary", "Origin")
		origin := request.Header.Get("Origin")
		if origin != "" && origin != service.config.AllowedOrigin {
			problem(writer, http.StatusForbidden, "origin_denied", "This origin cannot access gallery resources.")
			return
		}
		if origin == service.config.AllowedOrigin {
			writer.Header().Set("Access-Control-Allow-Origin", origin)
			writer.Header().Set("Access-Control-Allow-Credentials", "true")
			writer.Header().Set("Access-Control-Expose-Headers", "ETag, Location, X-Request-ID, Content-Disposition, Content-Range")
		}
		if request.Method == http.MethodOptions {
			if origin == "" {
				problem(writer, http.StatusForbidden, "origin_required", "Supply the configured browser origin.")
				return
			}
			allowed := service.allowedMethods(request.URL.Path)
			if len(allowed) == 0 {
				problem(writer, http.StatusNotFound, codeNotFound, "This resource does not exist.")
				return
			}
			writer.Header().Set("Access-Control-Allow-Methods", strings.Join(allowed, ", "))
			writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Content-Disposition, If-Match, If-None-Match, If-Range, Range, Idempotency-Key, Authorization")
			writer.WriteHeader(http.StatusNoContent)
			return
		}
		if len(service.allowedMethods(request.URL.Path)) == 0 {
			problem(writer, http.StatusNotFound, codeNotFound, "This resource does not exist.")
			return
		}
		access := service.accessFor(request)
		if access == ownerAccess || (access == ownerOrBuyerAccess && request.Header.Get("Authorization") == "") {
			claims, err := service.validator.ValidateRequest(request)
			if err != nil || claims.ExpiresAt == nil {
				problem(writer, http.StatusUnauthorized, "session_required", "A valid TAuth session is required.")
				return
			}
			if claims.TenantID != service.config.TenantID || claims.UserID == "" || claims.UserEmail != service.config.OwnerEmail {
				problem(writer, http.StatusForbidden, "owner_required", "This resource requires gallery owner access.")
				return
			}
		}
		if request.Method != http.MethodGet && request.Method != http.MethodHead && origin == "" && service.accessFor(request) != webhookAccess {
			problem(writer, http.StatusForbidden, "origin_required", "Supply the configured browser origin.")
			return
		}
		next.ServeHTTP(writer, request)
	})
}

func respond(writer http.ResponseWriter, status int, value any) {
	writer.Header().Set("Content-Type", "application/json")
	writer.WriteHeader(status)
	if err := json.NewEncoder(writer).Encode(value); err != nil {
		slog.Error("write gallery response", "requestId", writer.Header().Get("X-Request-ID"), "error", err)
	}
}
func problem(writer http.ResponseWriter, status int, code, message string) {
	respond(writer, status, apiError{Code: code, Message: message, RequestID: writer.Header().Get("X-Request-ID")})
}
func (service *Service) storageError(writer http.ResponseWriter, request *http.Request, operation string, err error) {
	slog.Error("gallery storage operation failed", "operation", operation, "requestId", writer.Header().Get("X-Request-ID"), "error", err)
	problem(writer, http.StatusServiceUnavailable, codeStorage, "Gallery storage is unavailable. Retry this operation.")
}

func timestamp() string { return time.Now().UTC().Format(time.RFC3339Nano) }
