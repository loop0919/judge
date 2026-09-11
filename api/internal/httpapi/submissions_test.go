package httpapi

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http/httptest"
	"net/url"
	"os"
	"os/exec"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"judge/api/internal/problems"
	"judge/api/internal/profiles"
	"judge/api/internal/submissions"
)

func TestDraftTestCaseLimits(t *testing.T) {
	draft := problems.Draft{TimeLimitMS: "2000", MemoryLimitMB: "512"}
	file := &problems.TestFile{ID: "11111111-1111-4111-8111-111111111111", Size: 16 << 20, SHA256: strings.Repeat("a", 64)}
	atSetLimit := make([]problems.TestCase, 16)
	for i := range atSetLimit {
		atSetLimit[i] = problems.TestCase{InputFile: file, OutputFile: file}
	}
	for _, tc := range []struct {
		name  string
		cases []problems.TestCase
		valid bool
	}{
		{"legacy", nil, true},
		{"empty input and output", []problems.TestCase{{}}, true},
		{"at case limit", make([]problems.TestCase, 100), true},
		{"over case limit", make([]problems.TestCase, 101), false},
		{"byte limit", []problems.TestCase{{Input: strings.Repeat("あ", 22000)}}, false},
		{"16 MiB file", []problems.TestCase{{InputFile: &problems.TestFile{ID: "11111111-1111-4111-8111-111111111111", Size: 16 << 20, SHA256: strings.Repeat("a", 64)}}}, true},
		{"over 16 MiB file", []problems.TestCase{{InputFile: &problems.TestFile{ID: "11111111-1111-4111-8111-111111111111", Size: 16<<20 + 1, SHA256: strings.Repeat("a", 64)}}}, false},
		{"file and inline data", []problems.TestCase{{Input: "x", InputFile: &problems.TestFile{ID: "11111111-1111-4111-8111-111111111111", Size: 1, SHA256: strings.Repeat("a", 64)}}}, false},
		{"at test set limit", atSetLimit, true},
		{"over test set limit", append(atSetLimit, problems.TestCase{Input: "x"}), false},
		{"NUL", []problems.TestCase{{Output: "\x00"}}, false},
		{"named case", []problems.TestCase{{Name: "最大値のケース"}}, true},
		{"long name", []problems.TestCase{{Name: strings.Repeat("あ", 65)}}, false},
		{"duplicate name", []problems.TestCase{{Name: "sample"}, {Name: " sample "}}, false},
		{"blank name", []problems.TestCase{{Name: "   "}}, false},
		{"control in name", []problems.TestCase{{Name: "a\nb"}}, false},
		{"total limit", []problems.TestCase{{Input: strings.Repeat("x", 65536), Output: strings.Repeat("x", 65536)}, {Input: strings.Repeat("x", 65536), Output: strings.Repeat("x", 65536)}, {Input: "x"}}, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			draft.TestCases = tc.cases
			if validDraft(draft) != tc.valid {
				t.Fatal("unexpected validation result")
			}
		})
	}
}

func TestDraftMemoryLimit(t *testing.T) {
	for memory, valid := range map[string]bool{"63": false, "64": true, "512": true, "513": false, "1024": false, "invalid": false} {
		draft := problems.Draft{TimeLimitMS: "2000", MemoryLimitMB: memory}
		if actual := validDraft(draft); actual != valid {
			t.Errorf("memory %s: got valid=%v, want %v", memory, actual, valid)
		}
	}
}

func TestDraftCaseLimitIndependentOfTL(t *testing.T) {
	for _, tl := range []int{100, 1000, 2000, 2300, 5000} {
		for _, extra := range []int{0, 1} {
			count := 100 + extra
			t.Run(fmt.Sprintf("%dms/%dcases", tl, count), func(t *testing.T) {
				draft := problems.Draft{TimeLimitMS: fmt.Sprint(tl), MemoryLimitMB: "512", TestCases: make([]problems.TestCase, count)}
				if validDraft(draft) != (extra == 0) {
					t.Fatal("unexpected case limit validation")
				}
			})
		}
	}
}

func TestSubmissionsPostgres(t *testing.T) {
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
	schema := fmt.Sprintf("test_submissions_%d", time.Now().UnixNano())
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
	if _, err := store.Pool().Exec(ctx, `INSERT INTO user_profiles(owner_id,handle) VALUES ('alice','alice'),('bob','bob')`); err != nil {
		t.Fatal(err)
	}
	const id = "11111111-1111-4111-8111-111111111111"
	_, err = store.Save(ctx, "alice", id, 0, problems.Draft{Title: "A+B", Markdown: "Add", TimeLimitMS: "2000", MemoryLimitMB: "512", TestCases: []problems.TestCase{{Input: "1 2", Output: "3"}}})
	if err != nil {
		t.Fatal(err)
	}
	published, err := store.Publish(ctx, "alice", id, 1, true)
	if err != nil {
		t.Fatal(err)
	}
	f := newSigningFixture(t)
	queue := &submissions.Store{Pool: store.Pool()}
	image := "sha256:" + strings.Repeat("a", 64)
	if configured := os.Getenv("TEST_JUDGE_CPP_IMAGE"); configured != "" {
		data, err := exec.CommandContext(ctx, "docker", "image", "inspect", "--format={{.Id}}", configured).Output()
		if err != nil {
			t.Fatal(err)
		}
		image = strings.TrimSpace(string(data))
	}
	h := newHandler(AuthConfig{}, PrivateProblems{Store: store, Profiles: profiles.New(store.Pool()), Submissions: queue, JudgeImage: image, Verifier: newCognitoVerifier(f.server.URL, "client")})
	request := func(method, path, owner, body string, want int) string {
		t.Helper()
		r := httptest.NewRequest(method, path, strings.NewReader(body))
		r.Header.Set("Content-Type", "application/json")
		if owner != "" {
			r.Header.Set("Authorization", "Bearer "+f.token(t, owner, nil))
		}
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		if w.Code != want {
			t.Fatalf("%s %s: %d %s", method, path, w.Code, w.Body.String())
		}
		if w.Header().Get("Cache-Control") != "no-store" {
			t.Fatal("private response cacheable")
		}
		return w.Body.String()
	}
	body := `{"problemId":"` + id + `","runtime":"cpp17-local","source":"#include <cstdio>\nint main(){puts(\"3\");}"}`
	request("POST", "/my/submissions", "", body, 401)
	request("POST", "/my/submissions", "alice", strings.Replace(body, "cpp17-local", "python", 1), 400)
	request("POST", "/my/submissions", "alice", strings.TrimSuffix(body, "}")+`,"owner_id":"bob"}`, 400)
	var item submissions.Submission
	if err := json.Unmarshal([]byte(request("POST", "/my/submissions", "alice", body, 202)), &item); err != nil {
		t.Fatal(err)
	}
	request("GET", "/my/submissions/"+item.ID, "bob", "", 404)
	if got := request("GET", "/my/submissions", "bob", "", 200); strings.Contains(got, item.ID) {
		t.Fatal("owner leaked")
	}
	if got := request("GET", "/my/submissions", "alice", "", 200); strings.Contains(got, "int main") {
		t.Fatal("list leaked source")
	}
	// The same UI language selects a pinned cloud runtime, never the local worker.
	localHandler := h
	h = newHandler(AuthConfig{}, PrivateProblems{Store: store, Profiles: profiles.New(store.Pool()), Submissions: queue, JudgeImage: image, JudgeRuntime: "cpp17-isolate", Verifier: newCognitoVerifier(f.server.URL, "client")})
	request("POST", "/my/submissions", "alice", body, 400)
	var cloud submissions.Submission
	if err := json.Unmarshal([]byte(request("POST", "/my/submissions", "alice", strings.Replace(body, "cpp17-local", "cpp17", 1), 202)), &cloud); err != nil || cloud.Runtime != "cpp17-isolate" {
		t.Fatalf("cloud runtime not pinned: %+v %v", cloud, err)
	}
	h = localHandler
	// Draft changes must not affect published tests or accepted submissions.
	changed := published.Draft
	changed.TestCases = []problems.TestCase{{Input: "secret-input", Output: "999"}}
	updated, err := store.Save(ctx, "alice", id, published.Version, changed)
	if err != nil {
		t.Fatal(err)
	}
	public, err := store.PublicGet(ctx, id)
	if err != nil {
		t.Fatal(err)
	}
	publicJSON, _ := json.Marshal(public)
	if strings.Contains(string(publicJSON), "testCases") || strings.Contains(string(publicJSON), "secret-input") {
		t.Fatal("public API leaked tests")
	}
	claimed, job, err := queue.Claim(ctx)
	if err != nil || claimed.ID != item.ID || job.Cases[0].Output != "3" || job.TimeLimitMS != 2000 {
		t.Fatalf("claim: %+v %+v %v", claimed, job, err)
	}
	if _, _, err = queue.Claim(ctx); err != pgx.ErrNoRows {
		t.Fatal("job claimed twice", err)
	}
	result := submissions.Result{Verdict: "AC", Passed: 1, Total: 1}
	if os.Getenv("TEST_JUDGE_CPP_IMAGE") != "" {
		result = submissions.Judge(ctx, claimed.Source, job)
		if result.Verdict != "AC" {
			t.Fatalf("real C++ submission: %+v", result)
		}
	}
	if err := queue.Finish(ctx, item.ID, result); err != nil {
		t.Fatal(err)
	}
	if err := queue.Finish(ctx, item.ID, submissions.Result{Verdict: "WA"}); err != nil {
		t.Fatal(err)
	}
	got := request("GET", "/my/submissions/"+item.ID, "alice", "", 200)
	if !strings.Contains(got, `"verdict":"AC"`) || strings.Contains(got, `"cases"`) {
		t.Fatal(got)
	}
	// Submitting before publication still uses the old cases.
	var before submissions.Submission
	if err := json.Unmarshal([]byte(request("POST", "/my/submissions", "alice", body, 202)), &before); err != nil {
		t.Fatal(err)
	}
	_, oldJob, err := queue.Claim(ctx)
	if err != nil || oldJob.Cases[0].Output != "3" {
		t.Fatalf("draft leaked into judging: %+v %v", oldJob, err)
	}
	if _, err := store.Publish(ctx, "alice", id, updated.Version, true); err != nil {
		t.Fatal(err)
	}
	request("POST", "/my/submissions", "alice", body, 202)
	_, newJob, err := queue.Claim(ctx)
	if err != nil || newJob.Cases[0].Output != "999" {
		t.Fatalf("published tests not used: %+v %v", newJob, err)
	}
	current, err := store.Get(ctx, "alice", id)
	if err != nil {
		t.Fatal(err)
	}

	// A published set over the case limit cannot enqueue a job.
	for _, tc := range []struct{ tl, count, status int }{{100, 101, 409}, {5000, 100, 202}} {
		data, err := json.Marshal(problems.Draft{Title: "Budget", TimeLimitMS: fmt.Sprint(tc.tl), MemoryLimitMB: "512", TestCases: make([]problems.TestCase, tc.count)})
		if err != nil {
			t.Fatal(err)
		}
		if _, err := store.Pool().Exec(ctx, `UPDATE problem_drafts SET published_draft=$2 WHERE id=$1`, id, data); err != nil {
			t.Fatal(err)
		}
		request("POST", "/my/submissions", "alice", body, tc.status)
	}
	current.Draft.TestCases = nil
	saved, err := store.Save(ctx, "alice", id, current.Version, current.Draft)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.Publish(ctx, "alice", id, saved.Version, true); err != nil {
		t.Fatal(err)
	}
	request("POST", "/my/submissions", "alice", body, 409)

}
