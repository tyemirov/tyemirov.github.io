package main

import (
	"context"
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
		slog.Error("gallery stopped", "error", err)
		os.Exit(1)
	}
}
func run() error {
	if len(os.Args) > 1 && (os.Args[1] == "backup" || os.Args[1] == "restore") {
		return runSnapshot(os.Args[1], os.Args[2:])
	}
	var config gallery.Config
	var paypal gallery.PayPalConfig
	var receipts gallery.ReceiptConfig
	receiptMode := flag.String("receipts", "disabled", "Receipt delivery mode: disabled or pinguin")
	flag.StringVar(&receipts.Address, "pinguin-grpc-address", "", "Private Pinguin gRPC endpoint")
	paymentMode := flag.String("payments", "disabled", "Payment mode: disabled or paypal")
	flag.StringVar(&paypal.BaseURL, "paypal-api-origin", "", "PayPal server API origin")
	flag.StringVar(&paypal.CheckoutOrigin, "paypal-checkout-origin", "", "PayPal buyer checkout origin")
	flag.StringVar(&paypal.ClientID, "paypal-client-id", "", "PayPal application client ID")
	flag.StringVar(&paypal.MerchantID, "paypal-merchant-id", "", "PayPal receiving merchant ID")
	flag.StringVar(&paypal.WebhookID, "paypal-webhook-id", "", "PayPal registered webhook ID")
	listen := flag.String("listen", "127.0.0.1:8093", "HTTP listener address")
	flag.StringVar(&config.DatabasePath, "database", "", "Private SQLite database path")
	flag.StringVar(&config.PublicRoot, "public-root", "", "Published site directory")
	flag.StringVar(&config.AllowedOrigin, "allowed-origin", "", "Studio browser origin")
	flag.StringVar(&config.CookieName, "cookie-name", "", "TAuth session cookie name")
	flag.StringVar(&config.TenantID, "tenant-id", "", "TAuth tenant identifier")
	flag.StringVar(&config.OwnerEmail, "owner-email", "", "Authorized owner email")
	flag.Parse()
	if len(flag.Args()) != 0 {
		return errors.New("start gallery: unexpected command arguments")
	}
	switch *receiptMode {
	case "disabled":
		if receipts.Address != "" {
			return errors.New("configure receipts: Pinguin fields require receipts=pinguin")
		}
	case "pinguin":
		receipts.APIKey = os.Getenv("GALLERY_PINGUIN_API_KEY")
		config.Receipts = &receipts
	default:
		return errors.New("configure receipts: use disabled or pinguin")
	}
	switch *paymentMode {
	case "disabled":
		if paypal.BaseURL != "" || paypal.CheckoutOrigin != "" || paypal.ClientID != "" || paypal.MerchantID != "" || paypal.WebhookID != "" {
			return errors.New("configure payments: PayPal fields require payments=paypal")
		}
	case "paypal":
		paypal.ClientSecret = os.Getenv("GALLERY_PAYPAL_CLIENT_SECRET")
		config.PayPal = &paypal
	default:
		return errors.New("configure payments: use disabled or paypal")
	}
	config.SigningKey = []byte(os.Getenv("GALLERY_TAUTH_SIGNING_KEY"))
	service, err := gallery.New(config)
	if err != nil {
		return fmt.Errorf("start gallery: %w", err)
	}
	defer func() {
		if err := service.Close(); err != nil {
			slog.Error("close gallery resources", "error", err)
		}
	}()
	listener, err := net.Listen("tcp", *listen)
	if err != nil {
		return fmt.Errorf("listen for gallery HTTP: %w", err)
	}
	server := &http.Server{Handler: service, ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 60 * time.Second, WriteTimeout: 120 * time.Second, IdleTimeout: 60 * time.Second, MaxHeaderBytes: 16384}
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	finished := make(chan error, 1)
	go func() { finished <- server.Serve(listener) }()
	slog.Info("gallery ready", "address", listener.Addr().String())
	select {
	case err := <-finished:
		if !errors.Is(err, http.ErrServerClosed) {
			return fmt.Errorf("serve gallery HTTP: %w", err)
		}
		return nil
	case <-ctx.Done():
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()
		if err := server.Shutdown(shutdownCtx); err != nil {
			return fmt.Errorf("stop gallery HTTP: %w", err)
		}
		if err := <-finished; !errors.Is(err, http.ErrServerClosed) {
			return fmt.Errorf("stop gallery listener: %w", err)
		}
		return nil
	}
}
