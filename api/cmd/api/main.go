package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"judge/api/internal/httpapi"
)

const (
	defaultPort    = 8080
	shutdownPeriod = 10 * time.Second
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))

	if err := run(context.Background(), logger, os.LookupEnv); err != nil {
		logger.Error("API stopped", "error", err)
		os.Exit(1)
	}
}

func run(parent context.Context, logger *slog.Logger, lookupEnv func(string) (string, bool)) error {
	address, err := listenAddress(lookupEnv)
	if err != nil {
		return err
	}

	handler, err := httpapi.NewConfiguredHandler(func(key string) string {
		value, _ := lookupEnv(key)
		return value
	})
	if err != nil {
		return err
	}

	server := &http.Server{
		Addr:              address,
		Handler:           handler,
		ReadHeaderTimeout: 5 * time.Second,
	}

	ctx, stop := signal.NotifyContext(parent, os.Interrupt, syscall.SIGTERM)
	defer stop()

	serverError := make(chan error, 1)
	go func() {
		serverError <- server.ListenAndServe()
	}()

	logger.Info("API started", "address", address)

	select {
	case err := <-serverError:
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}

		return fmt.Errorf("serve HTTP: %w", err)
	case <-ctx.Done():
	}

	shutdownCtx, cancel := context.WithTimeout(context.Background(), shutdownPeriod)
	defer cancel()

	if err := server.Shutdown(shutdownCtx); err != nil {
		return fmt.Errorf("shut down HTTP server: %w", err)
	}

	if err := <-serverError; !errors.Is(err, http.ErrServerClosed) {
		return fmt.Errorf("serve HTTP while shutting down: %w", err)
	}

	logger.Info("API stopped")

	return nil
}

func listenAddress(lookupEnv func(string) (string, bool)) (string, error) {
	port := defaultPort
	if rawPort, ok := lookupEnv("PORT"); ok {
		parsedPort, err := strconv.Atoi(rawPort)
		if err != nil || parsedPort < 1 || parsedPort > 65535 {
			return "", fmt.Errorf("PORT must be an integer between 1 and 65535: %q", rawPort)
		}

		port = parsedPort
	}

	return fmt.Sprintf(":%d", port), nil
}
