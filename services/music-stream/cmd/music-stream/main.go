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
	"strings"
	"syscall"
	"time"

	"github.com/tyemirov/tyemirov.github.io/services/music-stream/internal/stream"
)

const trustedProxiesEnvironment = "MUSIC_TRUSTED_PROXIES"

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stderr, nil))
	if err := run(logger); err != nil {
		logger.Error("music_service_stopped", "error", err.Error())
		os.Exit(1)
	}
}

func run(logger *slog.Logger) error {
	listen := flag.String("listen", "127.0.0.1:8092", "HTTP listen address")
	root := flag.String("media-root", "", "Private media root")
	index := flag.String("index", "", "Private media index")
	allowlist := flag.String("allowlist", "", "Generated public playback allowlist")
	origin := flag.String("public-origin", "", "Public HTTPS media origin")
	allowed := flag.String("allowed-origins", "", "Comma-separated exact website origins")
	certificate := flag.String("tls-cert", "", "Certificate for direct local HTTPS")
	key := flag.String("tls-key", "", "Key for direct local HTTPS")
	limits := stream.DefaultLimits()
	for _, entry := range []struct {
		value *int
		name  string
	}{
		{&limits.AddressGrantRate, "address-grants-per-minute"}, {&limits.AddressGrantBurst, "address-grant-burst"},
		{&limits.SessionGrantRate, "session-grants-per-minute"}, {&limits.SessionGrantBurst, "session-grant-burst"},
		{&limits.GrantRenewalRate, "grant-renewals-per-minute"}, {&limits.GrantRenewalBurst, "grant-renewal-burst"},
		{&limits.SessionMediaRate, "session-media-per-minute"}, {&limits.SessionMediaBurst, "session-media-burst"},
		{&limits.Sessions, "max-sessions"}, {&limits.Grants, "max-grants"}, {&limits.SessionGrants, "max-session-grants"},
		{&limits.ClientAddresses, "max-client-addresses"}, {&limits.SessionMediaResponses, "max-session-media-responses"}, {&limits.MediaResponses, "max-media-responses"},
	} {
		flag.IntVar(entry.value, entry.name, *entry.value, "Positive service limit")
	}
	flag.Parse()
	if *root == "" || *index == "" || *allowlist == "" {
		return fmt.Errorf("supply media-root, index, and allowlist")
	}
	if (*certificate == "") != (*key == "") {
		return fmt.Errorf("supply both TLS certificate and key")
	}
	var proxies []string
	if trustedProxies := os.Getenv(trustedProxiesEnvironment); trustedProxies != "" {
		proxies = strings.Split(trustedProxies, ",")
	}
	service, err := stream.New(stream.Config{MediaRoot: *root, IndexPath: *index, AllowlistPath: *allowlist, PublicOrigin: *origin, AllowedOrigins: strings.Split(*allowed, ","), Logger: logger, Limits: &limits, TrustedProxies: proxies})
	if err != nil {
		return err
	}
	defer service.Close()
	server := &http.Server{Addr: *listen, Handler: service, ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 15 * time.Second, IdleTimeout: 60 * time.Second, WriteTimeout: 30 * time.Second, MaxHeaderBytes: 16384}
	listener, err := net.Listen("tcp", *listen)
	if err != nil {
		return fmt.Errorf("listen: %w", err)
	}
	defer listener.Close()
	logger.Info("music_service_ready", "address", listener.Addr().String())
	interrupts := make(chan os.Signal, 1)
	signal.Notify(interrupts, os.Interrupt, syscall.SIGTERM, syscall.SIGHUP)
	defer signal.Stop(interrupts)
	stopped := make(chan struct{})
	defer close(stopped)
	go func() {
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				logger.Info("music_counters", "counters", service.Snapshot())
			case <-stopped:
				return
			case received := <-interrupts:
				if received == syscall.SIGHUP {
					if err := service.Reload(); err != nil {
						logger.Error("music_catalog_rejected", "error", err.Error())
					} else {
						logger.Info("music_catalog_activated")
					}
					continue
				}
				ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
				if err := server.Shutdown(ctx); err != nil {
					logger.Error("music_shutdown_failed", "error", err.Error())
				}
				cancel()
				return
			}
		}
	}()
	if *certificate != "" {
		err = server.ServeTLS(listener, *certificate, *key)
	} else {
		err = server.Serve(listener)
	}
	if err != nil && !errors.Is(err, http.ErrServerClosed) {
		return fmt.Errorf("serve music: %w", err)
	}
	return nil
}
