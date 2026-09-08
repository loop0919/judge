package httpapi_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"judge/api/internal/httpapi"
)

func TestPublicProblem(t *testing.T) {
	t.Parallel()
	r := httptest.NewRecorder()
	httpapi.NewHandler().ServeHTTP(r, httptest.NewRequest(http.MethodGet, "/problems/a-plus-b", nil))
	if r.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", r.Code)
	}
	var body struct {
		ID        string   `json:"id"`
		Statement []string `json:"statement"`
		IsSample  bool     `json:"isSample"`
	}
	if err := json.Unmarshal(r.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body.ID != "a-plus-b" || len(body.Statement) == 0 || !body.IsSample {
		t.Fatalf("unexpected public problem: %+v", body)
	}
	if !strings.HasPrefix(r.Header().Get("Content-Type"), "application/json") {
		t.Fatal("response must be JSON")
	}
}

func TestPublicProblemErrors(t *testing.T) {
	t.Parallel()
	for _, tc := range []struct {
		method string
		path   string
		status int
	}{
		{http.MethodGet, "/problems/missing", http.StatusNotFound},
		{http.MethodGet, "/problems/A-PLUS-B", http.StatusNotFound},
		{http.MethodPost, "/problems/a-plus-b", http.StatusMethodNotAllowed},
	} {
		t.Run(tc.method+tc.path, func(t *testing.T) {
			t.Parallel()
			r := httptest.NewRecorder()
			httpapi.NewHandler().ServeHTTP(r, httptest.NewRequest(tc.method, tc.path, nil))
			if r.Code != tc.status {
				t.Fatalf("status = %d, want %d", r.Code, tc.status)
			}
		})
	}
}
