// Package httpapiは、ジャッジAPIのHTTPインターフェースを提供する。
package httpapi

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
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
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", health)
	mux.HandleFunc("GET /runtimes", private.runtimes)
	mux.HandleFunc("GET /problems", private.publicContent)
	mux.HandleFunc("GET /problems/{id}", private.publicContent)
	mux.HandleFunc("GET /posts", private.publicContent)
	mux.HandleFunc("GET /posts/{id}", private.publicContent)
	mux.HandleFunc("POST /auth/login", config.login)
	mux.HandleFunc("POST /auth/challenge", config.challenge)
	mux.HandleFunc("POST /auth/signup", config.registration)
	mux.HandleFunc("POST /auth/confirm-signup", config.registration)
	mux.HandleFunc("POST /auth/resend-confirmation", config.registration)
	private.register(mux)

	return mux
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
