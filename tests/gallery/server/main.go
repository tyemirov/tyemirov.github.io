// The browser fixture serves the real gallery API with a private local CA.
package main

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	gallery "github.com/tyemirov/tyemirov.github.io/services/gallery"
)

func main() {
	if err := run(); err != nil {
		slog.Error("gallery browser fixture stopped", "error", err)
		os.Exit(1)
	}
}
func run() error {
	database := flag.String("database", "", "Fixture database")
	publicRoot := flag.String("public-root", "", "Fixture catalog")
	certificate := flag.String("certificate", "", "Fixture CA certificate")
	flag.Parse()
	cert, err := os.ReadFile(*certificate)
	if err != nil {
		return fmt.Errorf("read fixture CA: %w", err)
	}
	roots := x509.NewCertPool()
	if !roots.AppendCertsFromPEM(cert) {
		return errors.New("read fixture CA: invalid PEM")
	}
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.TLSClientConfig = &tls.Config{RootCAs: roots, MinVersion: tls.VersionTLS12}
	defer transport.CloseIdleConnections()
	service, err := gallery.New(gallery.Config{
		DatabasePath: *database, PublicRoot: *publicRoot, AllowedOrigin: "https://localhost:18443", CookieName: "gallery_browser_session", TenantID: "gallery-browser", OwnerEmail: "owner@example.test",
		SigningKey: []byte(os.Getenv("GALLERY_TAUTH_SIGNING_KEY")),
		PayPal:     &gallery.PayPalConfig{BaseURL: "https://localhost:18446", CheckoutOrigin: "https://localhost:18446", ClientID: "local-client", ClientSecret: "local-provider-secret", MerchantID: "TESTMERCHANT1", WebhookID: "local-webhook", HTTPClient: &http.Client{Transport: transport, Timeout: 20 * time.Second}},
	})
	if err != nil {
		return fmt.Errorf("construct fixture API: %w", err)
	}
	defer func() {
		if err := service.Close(); err != nil {
			slog.Error("close fixture API", "error", err)
		}
	}()
	listener, err := net.Listen("tcp", "127.0.0.1:18445")
	if err != nil {
		return fmt.Errorf("listen for fixture requests: %w", err)
	}
	server := &http.Server{Handler: service, ReadHeaderTimeout: 5 * time.Second}
	stopped := make(chan error, 1)
	go func() { stopped <- server.Serve(listener) }()
	slog.Info("gallery ready")
	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGTERM, syscall.SIGINT)
	defer cancel()
	select {
	case err := <-stopped:
		return fmt.Errorf("serve fixture API: %w", err)
	case <-ctx.Done():
		shutdown, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := server.Shutdown(shutdown); err != nil {
			return fmt.Errorf("stop fixture HTTP: %w", err)
		}
		if err := <-stopped; !errors.Is(err, http.ErrServerClosed) {
			return fmt.Errorf("stop fixture listener: %w", err)
		}
	}
	return nil
}
