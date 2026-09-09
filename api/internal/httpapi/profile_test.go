package httpapi

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"image"
	"image/png"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"

	"judge/api/internal/posts"
	"judge/api/internal/problems"
	"judge/api/internal/profiles"
)

func TestAvatarValidation(t *testing.T) {
	var buf bytes.Buffer
	if err := png.Encode(&buf, image.NewRGBA(image.Rect(0, 0, 32, 32))); err != nil {
		t.Fatal(err)
	}
	valid := "data:image/png;base64," + base64.StdEncoding.EncodeToString(buf.Bytes())
	if _, err := cleanAvatar(valid); err != nil {
		t.Fatal(err)
	}
	buf.Reset()
	if err := png.Encode(&buf, image.NewRGBA(image.Rect(0, 0, 257, 1))); err != nil {
		t.Fatal(err)
	}
	for _, value := range []string{"https://example.com/avatar.png", "data:image/svg+xml;base64,PHN2Zz4=", "data:image/png;base64,broken", "data:image/png;base64," + base64.StdEncoding.EncodeToString(buf.Bytes()), strings.Repeat("x", 180001)} {
		if _, err := cleanAvatar(value); err == nil {
			t.Fatal("accepted invalid avatar")
		}
	}
}

func TestProfilesPostgres(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL required")
	}
	ctx := context.Background()
	conn, err := pgx.Connect(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = conn.Close(ctx) }()
	schema := fmt.Sprintf("test_profiles_%d", time.Now().UnixNano())
	if _, err = conn.Exec(ctx, `CREATE SCHEMA `+schema); err != nil {
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
	if err = store.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	if err = store.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	profileStore := profiles.New(store.Pool())
	f := newSigningFixture(t)
	handler := newHandler(AuthConfig{}, PrivateProblems{Store: store, Profiles: profileStore, Posts: posts.New(store.Pool()), Operators: map[string]bool{"alice": true}, Verifier: newCognitoVerifier(f.server.URL, "client")})
	request := func(method, path, owner, body string) *httptest.ResponseRecorder {
		r := httptest.NewRequest(method, path, strings.NewReader(body))
		r.Header.Set("Content-Type", "application/json")
		if owner != "" {
			r.Header.Set("Authorization", "Bearer "+f.token(t, owner, nil))
		}
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, r)
		return w
	}
	if w := request("GET", "/my/profile", "", ""); w.Code != 401 {
		t.Fatalf("anonymous: %d", w.Code)
	}
	if w := request("GET", "/my/profile", "alice", ""); w.Code != 200 || !strings.Contains(w.Body.String(), `"profile":null`) {
		t.Fatalf("missing: %d %s", w.Code, w.Body.String())
	}
	if w := request("GET", "/my/problems", "alice", ""); w.Code != 403 {
		t.Fatalf("onboarding gate: %d", w.Code)
	}
	for _, body := range []string{`{"handle":"ab","version":0}`, `{"handle":"9alice","version":0}`, `{"handle":"alice","owner":"bob","version":0}`, `{"handle":"alice","avatar":"https://example.com/x","version":0}`} {
		if w := request("PUT", "/my/profile", "alice", body); w.Code != 400 {
			t.Fatalf("invalid accepted: %d", w.Code)
		}
	}
	if w := request("PUT", "/my/profile", "alice", `{"handle":"ALICE","avatar":"","version":0}`); w.Code != 200 || !strings.Contains(w.Body.String(), `"handle":"alice"`) {
		t.Fatalf("create: %d %s", w.Code, w.Body.String())
	}
	if w := request("GET", "/my/problems", "alice", ""); w.Code != 200 {
		t.Fatalf("registered gate: %d", w.Code)
	}
	if w := request("PUT", "/my/profile", "bob", `{"handle":"Alice","avatar":"","version":0}`); w.Code != 409 || !strings.Contains(w.Body.String(), "handle_taken") {
		t.Fatalf("duplicate: %d %s", w.Code, w.Body.String())
	}
	if w := request("GET", "/my/profile", "bob", ""); !strings.Contains(w.Body.String(), `"profile":null`) {
		t.Fatal("profile leaked")
	}
	if w := request("PUT", "/my/profile", "alice", `{"handle":"alice_new","avatar":"","version":1}`); w.Code != 200 {
		t.Fatalf("edit: %d", w.Code)
	}
	if w := request("PUT", "/my/profile", "alice", `{"handle":"stale","avatar":"","version":1}`); w.Code != 409 {
		t.Fatalf("stale: %d", w.Code)
	}
	var result struct {
		Profile profiles.Profile `json:"profile"`
	}
	if err = json.Unmarshal(request("GET", "/my/profile", "alice", "").Body.Bytes(), &result); err != nil || result.Profile.Handle != "alice_new" {
		t.Fatal("profile not persisted")
	}

	// Public snapshots never expose later private edits; all mutation paths enforce ownership and version.
	if w := request("PUT", "/my/profile", "bob", `{"handle":"bob","avatar":"","version":0}`); w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	for _, kind := range []string{"problems", "posts"} {
		id := "22222222-2222-4222-8222-222222222222"
		private := "/my/" + kind + "/" + id
		public := "/" + kind + "/" + id
		body := func(version int, text string) string {
			if kind == "problems" {
				return fmt.Sprintf(`{"version":%d,"draft":{"title":"Published title","markdown":%q,"timeLimitMs":"2000","memoryLimitMb":"256"}}`, version, text)
			}
			return fmt.Sprintf(`{"version":%d,"title":"Published title","markdown":%q}`, version, text)
		}
		check := func(method, path, owner, body string, code int) string {
			t.Helper()
			w := request(method, path, owner, body)
			if w.Code != code {
				t.Fatalf("%s %s: %d %s", method, path, w.Code, w.Body.String())
			}
			return w.Body.String()
		}
		check("PUT", private, "", body(0, "public body"), 401)
		check("PUT", private, "alice", body(0, "public body"), 200)
		check("GET", public, "", "", 404)
		check("PUT", private+"/publication", "bob", `{"version":1,"publish":true}`, 404)
		check("PUT", private+"/publication", "alice", `{"version":1}`, 400)
		check("PUT", private+"/publication", "alice", `{"version":1,"publish":true}`, 200)
		visible := check("GET", public, "", "", 200)
		if !strings.Contains(visible, "public body") || !strings.Contains(visible, `"author":"alice_new"`) || strings.Contains(visible, "owner") {
			t.Fatal(visible)
		}
		if kind == "posts" && !strings.Contains(visible, `"isOperator":true`) {
			t.Fatal("missing operator badge")
		}
		check("PUT", private, "alice", body(2, "private secret"), 200)
		if strings.Contains(check("GET", public, "", "", 200), "private secret") {
			t.Fatal("draft leaked")
		}
		listing := check("GET", "/"+kind, "", "", 200)
		if !strings.Contains(listing, id) || strings.Contains(listing, "private secret") {
			t.Fatal(listing)
		}
		check("PUT", private+"/publication", "alice", `{"version":2,"publish":true}`, 409)
		check("PUT", private+"/publication", "alice", `{"version":3,"publish":true}`, 200)
		if !strings.Contains(check("GET", public, "", "", 200), "private secret") {
			t.Fatal("snapshot not updated")
		}
		check("PUT", private+"/publication", "alice", `{"version":4,"publish":false}`, 200)
		check("GET", public, "", "", 404)
		if strings.Contains(check("GET", "/"+kind, "", "", 200), id) {
			t.Fatal("unpublished listed")
		}
		check("PUT", private, "alice", body(5, ""), 200)
		check("PUT", private+"/publication", "alice", `{"version":6,"publish":true}`, 400)
		check("PUT", private, "alice", body(6, "publish again"), 200)
		check("PUT", private+"/publication", "alice", `{"version":7,"publish":true}`, 200)
		check("DELETE", private+"?version=8", "bob", "", 404)
		check("DELETE", private+"?version=7", "alice", "", 409)
		check("DELETE", private+"?version=8", "alice", "", 204)
		check("GET", public, "", "", 404)
	}
	// Two different owners cannot claim the same handle concurrently.
	var wg sync.WaitGroup
	statuses := make(chan error, 2)
	for _, owner := range []string{"one", "two"} {
		wg.Add(1)
		go func() { defer wg.Done(); _, e := profileStore.Save(ctx, owner, "unique_name", "", 0); statuses <- e }()
	}
	wg.Wait()
	close(statuses)
	success := 0
	for e := range statuses {
		if e == nil {
			success++
		} else if e != profiles.ErrHandleTaken {
			t.Fatal(e)
		}
	}
	if success != 1 {
		t.Fatalf("unique winners: %d", success)
	}
	// Upgrading a version-1 database preserves saved problems and creates profiles.
	id := "11111111-1111-4111-8111-111111111111"
	if _, err = store.Save(ctx, "alice", id, 0, problems.Draft{Title: "before upgrade"}); err != nil {
		t.Fatal(err)
	}
	if _, err = store.Pool().Exec(ctx, `DROP TABLE blog_posts; DROP TABLE user_profiles; ALTER TABLE problem_drafts DROP COLUMN published_draft, DROP COLUMN published_version, DROP COLUMN published_at; DELETE FROM schema_migrations WHERE version>=2`); err != nil {
		t.Fatal(err)
	}
	if err = store.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	if value, e := store.Get(ctx, "alice", id); e != nil || value.Draft.Title != "before upgrade" {
		t.Fatal("migration lost draft")
	}
}
