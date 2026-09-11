package httpapi

import (
	"bytes"
	"context"
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/go-jose/go-jose/v4"
	"github.com/jackc/pgx/v5"
	"judge/api/internal/problems"
)

type signingFixture struct {
	key    *rsa.PrivateKey
	server *httptest.Server
}

func newSigningFixture(t *testing.T) signingFixture {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/.well-known/jwks.json" {
			w.WriteHeader(404)
			return
		}
		_ = json.NewEncoder(w).Encode(jose.JSONWebKeySet{Keys: []jose.JSONWebKey{{Key: &key.PublicKey, KeyID: "test-key", Algorithm: "RS256", Use: "sig"}}})
	}))
	t.Cleanup(server.Close)
	return signingFixture{key, server}
}

func (f signingFixture) token(t *testing.T, owner string, override map[string]any) string {
	t.Helper()
	claims := map[string]any{"iss": f.server.URL, "sub": owner, "client_id": "client", "token_use": "access", "exp": time.Now().Add(time.Hour).Unix(), "iat": time.Now().Unix()}
	for k, v := range override {
		claims[k] = v
	}
	header := base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"RS256","kid":"test-key"}`))
	body, _ := json.Marshal(claims)
	unsigned := header + "." + base64.RawURLEncoding.EncodeToString(body)
	hash := sha256.Sum256([]byte(unsigned))
	signature, err := rsa.SignPKCS1v15(rand.Reader, f.key, crypto.SHA256, hash[:])
	if err != nil {
		t.Fatal(err)
	}
	return unsigned + "." + base64.RawURLEncoding.EncodeToString(signature)
}

func TestCognitoAccessTokenVerification(t *testing.T) {
	f := newSigningFixture(t)
	v := newCognitoVerifier(f.server.URL, "client")
	if owner, err := v.Verify(context.Background(), f.token(t, "alice", nil)); err != nil || owner != "alice" {
		t.Fatalf("valid token: %q %v", owner, err)
	}
	for name, claims := range map[string]map[string]any{
		"expired":      {"exp": time.Now().Add(-time.Hour).Unix()},
		"no expiry":    {"exp": nil},
		"other issuer": {"iss": "https://other.example"},
		"other client": {"client_id": "other"},
		"ID token":     {"token_use": "id", "aud": "client"},
		"no subject":   {"sub": ""},
	} {
		t.Run(name, func(t *testing.T) {
			if _, err := v.Verify(context.Background(), f.token(t, "alice", claims)); err == nil {
				t.Fatal("accepted invalid token")
			}
		})
	}
	other := newSigningFixture(t)
	if _, err := v.Verify(context.Background(), other.token(t, "alice", map[string]any{"iss": f.server.URL})); err == nil {
		t.Fatal("accepted forged signature")
	}
}

func TestPrivateProblemsPostgres(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL is required for PostgreSQL integration")
	}
	ctx := context.Background()
	conn, err := pgx.Connect(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = conn.Close(ctx) }()
	schema := fmt.Sprintf("test_problems_%d", time.Now().UnixNano())
	if _, err := conn.Exec(ctx, `CREATE SCHEMA `+schema); err != nil {
		t.Fatal(err)
	}
	defer func() { _, _ = conn.Exec(ctx, `DROP SCHEMA `+schema+` CASCADE`) }()
	u, err := url.Parse(dsn)
	if err != nil {
		t.Fatal(err)
	}
	q := u.Query()
	q.Set("search_path", schema)
	u.RawQuery = q.Encode()
	store, err := problems.Open(ctx, u.String())
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	if err := store.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	if err := store.Migrate(ctx); err != nil {
		t.Fatalf("repeat migration: %v", err)
	}
	f := newSigningFixture(t)
	handler := newHandler(AuthConfig{}, PrivateProblems{Store: store, Verifier: newCognitoVerifier(f.server.URL, "client")})
	alice, bob := f.token(t, "alice", nil), f.token(t, "bob", nil)
	const id = "11111111-1111-4111-8111-111111111111"
	draft := problems.Draft{Title: "保存する問題", Markdown: "本文 $A+B$", TimeLimitMS: "2000", MemoryLimitMB: "512"}
	request := func(method, path, token string, body any, want int) *httptest.ResponseRecorder {
		t.Helper()
		data, _ := json.Marshal(body)
		r := httptest.NewRequest(method, path, bytes.NewReader(data))
		r.Header.Set("Content-Type", "application/json")
		if token != "" {
			r.Header.Set("Authorization", "Bearer "+token)
		}
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, r)
		if w.Code != want {
			t.Fatalf("%s %s = %d %s, want %d", method, path, w.Code, w.Body.String(), want)
		}
		if w.Header().Get("Cache-Control") != "no-store" {
			t.Fatal("private response cacheable")
		}
		return w
	}
	input := func(version int) any { return map[string]any{"version": version, "draft": draft} }
	request("PUT", "/my/problems/"+id, "", input(0), 401)
	request("PUT", "/my/problems/"+id, alice, input(0), 200)
	request("GET", "/my/problems/"+id, bob, nil, 404)
	request("PUT", "/my/problems/"+id, bob, input(0), 404)
	request("PUT", "/my/problems/"+id, bob, input(1), 404)
	request("DELETE", "/my/problems/"+id+"?version=1", bob, nil, 404)
	if w := request("GET", "/my/problems", bob, nil, 200); strings.Contains(w.Body.String(), id) {
		t.Fatal("owner leaked")
	}
	request("PUT", "/my/problems/"+id, alice, map[string]any{"version": 1, "draft": draft, "owner_id": "bob"}, 400)
	draft.Title = "再編集した問題"
	request("PUT", "/my/problems/"+id, alice, input(1), 200)
	request("PUT", "/my/problems/"+id, alice, input(1), 409)
	request("DELETE", "/my/problems/"+id+"?version=1", alice, nil, 409)
	// A fresh connection reads the committed edit.
	reopened, err := problems.Open(ctx, u.String())
	if err != nil {
		t.Fatal(err)
	}
	p, err := reopened.Get(ctx, "alice", id)
	reopened.Close()
	if err != nil || p.Version != 2 || p.Draft.Title != draft.Title {
		t.Fatalf("not persisted: %+v %v", p, err)
	}
	// Concurrent writers with the same version cannot both succeed.
	var wg sync.WaitGroup
	results := make(chan error, 2)
	for range 2 {
		wg.Go(func() { _, err := store.Save(ctx, "alice", id, 2, draft); results <- err })
	}
	wg.Wait()
	close(results)
	success, conflicts := 0, 0
	for err := range results {
		switch err {
		case nil:
			success++
		case problems.ErrConflict:
			conflicts++
		default:
			t.Fatal(err)
		}
	}
	if success != 1 || conflicts != 1 {
		t.Fatalf("concurrent writes: %d successful %d conflicts", success, conflicts)
	}
	for n := range 51 {
		otherID := fmt.Sprintf("22222222-2222-4222-8222-%012d", n)
		if _, err := store.Save(ctx, "alice", otherID, 0, draft); err != nil {
			t.Fatal(err)
		}
	}
	w := request("GET", "/my/problems", alice, nil, 200)
	var page struct {
		Items      []problems.Summary `json:"items"`
		NextCursor string             `json:"nextCursor"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &page); err != nil {
		t.Fatal(err)
	}
	if len(page.Items) != 50 || page.NextCursor == "" {
		t.Fatalf("bad page: %+v", page)
	}
	w = request("GET", "/my/problems?cursor="+page.NextCursor, alice, nil, 200)
	if err := json.Unmarshal(w.Body.Bytes(), &page); err != nil {
		t.Fatal(err)
	}
	if len(page.Items) != 2 || page.NextCursor != "" {
		t.Fatalf("bad final page: %+v", page)
	}
	request("GET", "/my/problems?cursor=bad", alice, nil, 400)
	draft.Markdown = strings.Repeat("a", 100001)
	request("PUT", "/my/problems/"+id, alice, input(3), 400)
	request("DELETE", "/my/problems/"+id+"?version=3", alice, nil, 204)
	request("GET", "/my/problems/"+id, alice, nil, 404)
}
