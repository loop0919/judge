// Package httpapiは、ジャッジAPIのHTTPインターフェースを提供する。
package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"time"

	"judge/api/internal/contests"
	"judge/api/internal/problems"
)

// NewHandlerは、APIのルートHTTPハンドラーを返す。
func NewHandler(auth ...AuthConfig) http.Handler {
	var config AuthConfig
	if len(auth) > 0 {
		config = auth[0]
	}
	return newHandler(config, PrivateProblems{})
}

func newHandler(config AuthConfig, private PrivateProblems) http.Handler {
	if store, ok := private.Store.(*problems.Store); ok && private.Contests == nil {
		private.Contests = &contests.Store{Pool: store.Pool()}
	}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /contests", private.publicContest)
	mux.HandleFunc("GET /contests/{id}", private.publicContest)
	mux.HandleFunc("GET /contests/{id}/problems/{problem}", private.publicContest)
	mux.HandleFunc("GET /contests/{id}/problems/{problem}/submissions", private.publicContest)
	mux.HandleFunc("GET /contests/{id}/standings", private.publicContest)
	mux.HandleFunc("GET /contests/{id}/submissions", private.publicContest)
	mux.HandleFunc("GET /contests/{id}/submissions/{submission}", private.publicContest)
	mux.HandleFunc("GET /health", health)
	mux.HandleFunc("GET /runtimes", private.runtimes)
	mux.HandleFunc("GET /problems", private.publicContent)
	mux.HandleFunc("GET /problems/{id}", private.publicContent)
	mux.HandleFunc("GET /problems/{id}/submissions", private.publicProblemSubmissions)
	mux.HandleFunc("GET /problems/{id}/submissions/{submission}", private.publicProblemSubmissions)
	mux.HandleFunc("GET /posts", private.publicContent)
	mux.HandleFunc("GET /posts/{id}", private.publicContent)
	mux.HandleFunc("POST /auth/login", config.login)
	mux.HandleFunc("POST /auth/refresh", config.refresh)
	mux.HandleFunc("POST /auth/challenge", config.challenge)
	mux.HandleFunc("POST /auth/signup", config.registration)
	mux.HandleFunc("POST /auth/confirm-signup", config.registration)
	mux.HandleFunc("POST /auth/resend-confirmation", config.registration)
	private.register(mux)

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if private.Contests != nil && (strings.HasPrefix(r.URL.Path, "/contests") || strings.HasPrefix(r.URL.Path, "/problems") || strings.HasPrefix(r.URL.Path, "/my/")) {
			ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
			defer cancel()
			if err := private.Contests.Release(ctx); err != nil {
				w.Header().Set("Cache-Control", "no-store")
				authError(w, 503, "database_unavailable")
				return
			}
		}
		mux.ServeHTTP(w, r)
	})
}

func health(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)

	_ = json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

// readJSONBody accepts exactly one JSON value, rejects unknown fields, and bounds reads.
func readJSONBody(w http.ResponseWriter, r *http.Request, target any, limit int64) bool {
	r.Body = http.MaxBytesReader(w, r.Body, limit)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	err := decoder.Decode(target)
	if err == nil {
		err = decoder.Decode(new(any))
		if err == io.EOF {
			return true
		}
	}
	var large *http.MaxBytesError
	if errors.As(err, &large) {
		authError(w, 413, "request_too_large")
	} else {
		authError(w, 400, "invalid_request")
	}
	return false
}
