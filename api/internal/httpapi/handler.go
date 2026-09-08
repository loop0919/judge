// Package httpapiは、ジャッジAPIのHTTPインターフェースを提供する。
package httpapi

import (
	"encoding/json"
	"net/http"
)

// NewHandlerは、APIのルートHTTPハンドラーを返す。
func NewHandler(auth ...AuthConfig) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", health)
	mux.HandleFunc("GET /problems/{id}", problemDetail)
	var config AuthConfig
	if len(auth) > 0 {
		config = auth[0]
	}
	mux.HandleFunc("POST /auth/login", config.login)
	mux.HandleFunc("POST /auth/challenge", config.challenge)

	return mux
}

func health(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)

	_ = json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}
