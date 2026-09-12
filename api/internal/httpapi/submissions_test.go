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
	"judge/api/internal/testfiles"
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

func TestDraftEditorialLimit(t *testing.T) {
	draft := problems.Draft{TimeLimitMS: "2000", MemoryLimitMB: "512", Editorial: strings.Repeat("あ", 100000)}
	if !validDraft(draft) {
		t.Fatal("editorial at character limit should be valid")
	}
	draft.Editorial += "あ"
	if validDraft(draft) {
		t.Fatal("editorial over character limit should be invalid")
	}
	draft.Editorial = "解説\x00"
	if validDraft(draft) {
		t.Fatal("editorial containing NUL should be invalid")
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
	dispatches := 0
	h = newHandler(AuthConfig{}, PrivateProblems{Store: store, Profiles: profiles.New(store.Pool()), Submissions: queue, JudgeImage: image, JudgeRuntime: "cpp17-isolate", Verifier: newCognitoVerifier(f.server.URL, "client"), DispatchJudge: func(ctx context.Context) error {
		dispatches++
		var count int
		if err := store.Pool().QueryRow(ctx, `SELECT count(*) FROM submissions WHERE runtime='cpp17-isolate' AND status='QUEUED'`).Scan(&count); err != nil || count != 1 {
			t.Fatalf("wake-up before durable commit: %d %v", count, err)
		}
		if deadline, ok := ctx.Deadline(); !ok || time.Until(deadline) > 2*time.Second {
			t.Fatal("unbounded dispatch")
		}
		return fmt.Errorf("simulated dispatch outage")
	}})
	request("POST", "/my/submissions", "alice", body, 400)
	var cloud submissions.Submission
	if err := json.Unmarshal([]byte(request("POST", "/my/submissions", "alice", strings.Replace(body, "cpp17-local", "cpp17", 1), 202)), &cloud); err != nil || cloud.Runtime != "cpp17-isolate" {
		t.Fatalf("cloud runtime not pinned: %+v %v", cloud, err)
	}
	request("POST", "/my/submissions", "alice", strings.Replace(body, "cpp17-local", "c23-gcc-isolate", 1), 400)
	if dispatches != 1 {
		t.Fatalf("dispatches=%d; accepted submission must wake once, rejected ones never", dispatches)
	}
	h = newHandler(AuthConfig{}, PrivateProblems{Store: store, Profiles: profiles.New(store.Pool()), Submissions: queue, JudgeImage: image, JudgeRuntime: "cpp17-isolate", JudgeEnabledRuntimes: "cpp17,c23-gcc", Verifier: newCognitoVerifier(f.server.URL, "client")})
	if err := json.Unmarshal([]byte(request("POST", "/my/submissions", "alice", strings.Replace(body, "cpp17-local", "c23-gcc", 1), 202)), &cloud); err != nil || cloud.Runtime != "c23-gcc-isolate" {
		t.Fatalf("C runtime not pinned: %+v %v", cloud, err)
	}
	request("POST", "/my/submissions", "alice", strings.Replace(body, "cpp17-local", "java24", 1), 400)
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

	// Generation works without published tests and remains scoped to the draft owner.
	generation := strings.TrimSuffix(body, "}") + `,"generation":{"mode":"input","start":7,"count":2}}`
	request("POST", "/my/submissions", "bob", generation, 404)
	for _, invalid := range []string{
		strings.Replace(generation, `"count":2`, `"count":0`, 1),
		strings.Replace(generation, `"start":7`, `"start":2147483647`, 1),
		strings.Replace(generation, `"mode":"input"`, `"mode":"output"`, 1),
	} {
		request("POST", "/my/submissions", "alice", invalid, 400)
	}
	var generated submissions.Submission
	if err := json.Unmarshal([]byte(request("POST", "/my/submissions", "alice", generation, 202)), &generated); err != nil {
		t.Fatal(err)
	}
	var raw []byte
	if err := store.Pool().QueryRow(ctx, `SELECT job FROM submissions WHERE id=$1`, generated.ID).Scan(&raw); err != nil {
		t.Fatal(err)
	}
	var generationJob submissions.Job
	if json.Unmarshal(raw, &generationJob) != nil || !generationJob.Generate || len(generationJob.Cases) != 2 || generationJob.Cases[0].Input != "7\n" || generationJob.Cases[1].Input != "8\n" {
		t.Fatalf("generation job: %s", raw)
	}
	if got := request("GET", "/my/submissions", "alice", "", 200); strings.Contains(got, generated.ID) {
		t.Fatal("generation appeared in submission history")
	}
	request("GET", "/my/submissions/"+generated.ID, "bob", "", 404)
	current, err = store.Get(ctx, "alice", id)
	if err != nil {
		t.Fatal(err)
	}
	current.Draft.TestCases = []problems.TestCase{{Input: " 1  2\n", Output: "secret"}}
	if _, err = store.Save(ctx, "alice", id, current.Version, current.Draft); err != nil {
		t.Fatal(err)
	}
	generation = strings.Replace(generation, `"mode":"input","start":7,"count":2`, `"mode":"output","start":1,"count":1`, 1)
	if err := json.Unmarshal([]byte(request("POST", "/my/submissions", "alice", generation, 202)), &generated); err != nil {
		t.Fatal(err)
	}
	if err := store.Pool().QueryRow(ctx, `SELECT job FROM submissions WHERE id=$1`, generated.ID).Scan(&raw); err != nil {
		t.Fatal(err)
	}
	if json.Unmarshal(raw, &generationJob) != nil || generationJob.Cases[0].Input != " 1  2\n" || generationJob.Cases[0].Output != "" {
		t.Fatalf("output generation job: %s", raw)
	}

	validation := strings.Replace(generation, `"mode":"output"`, `"mode":"validation"`, 1)
	request("POST", "/my/submissions", "bob", validation, 404)
	request("POST", "/my/submissions", "alice", strings.Replace(validation, `"start":1`, `"start":2`, 1), 400)
	var validated submissions.Submission
	if err := json.Unmarshal([]byte(request("POST", "/my/submissions", "alice", validation, 202)), &validated); err != nil {
		t.Fatal(err)
	}
	var validationRaw []byte
	if err := store.Pool().QueryRow(ctx, `SELECT job FROM submissions WHERE id=$1`, validated.ID).Scan(&validationRaw); err != nil {
		t.Fatal(err)
	}
	var validationJob submissions.Job
	if json.Unmarshal(validationRaw, &validationJob) != nil || !validationJob.Validate || validationJob.Generate || len(validationJob.Cases) != 1 || validationJob.Cases[0].Input != " 1  2\n" || validationJob.Cases[0].Output != "" || validationJob.Cases[0].OutputFile != nil {
		t.Fatalf("validation job: %s", validationRaw)
	}
	if strings.Contains(request("GET", "/my/submissions", "alice", "", 200), validated.ID) {
		t.Fatal("validation appeared in submission history")
	}
	if generationJob.GenerationBaseBytes != int64(len(" 1  2\n")) {
		t.Fatalf("replaced output still counted: %+v", generationJob)
	}
	if _, err = store.Pool().Exec(ctx, `UPDATE submissions SET status='RUNNING' WHERE id=$1`, generated.ID); err != nil {
		t.Fatal(err)
	}
	file := problems.TestFile{ID: "44444444-4444-4444-8444-444444444444", Size: 16 << 20, SHA256: strings.Repeat("a", 64), Key: testfiles.GenerationPrefix("bob", id) + "44444444-4444-4444-8444-444444444444", Version: "generated-version"}
	generatedResult := submissions.Result{Verdict: "AC", Passed: 1, Total: 1, Cases: []submissions.CaseResult{{Verdict: "AC", OutputFile: &file}}}
	if err = queue.Finish(ctx, generated.ID, generatedResult); err == nil {
		t.Fatal("cross-owner generated file registered")
	}
	file.Key = testfiles.GenerationPrefix("alice", id) + file.ID
	// A result cannot bypass the complete set budget even if the worker is wrong.
	if _, err = store.Pool().Exec(ctx, `UPDATE submissions SET job=jsonb_set(job,'{generationBaseBytes}',to_jsonb($2::bigint)) WHERE id=$1`, generated.ID, int64(submissions.GenerationOutputLimit)-(16<<20)+1); err != nil {
		t.Fatal(err)
	}
	if err = queue.Finish(ctx, generated.ID, generatedResult); err == nil {
		t.Fatal("over-budget generated file registered")
	}
	if _, err = store.Pool().Exec(ctx, `UPDATE submissions SET job=jsonb_set(job,'{generationBaseBytes}',to_jsonb($2::bigint)) WHERE id=$1`, generated.ID, int64(submissions.GenerationOutputLimit)-(16<<20)); err != nil {
		t.Fatal(err)
	}
	if err = queue.Finish(ctx, generated.ID, generatedResult); err != nil {
		t.Fatal(err)
	}
	if err = queue.Finish(ctx, generated.ID, generatedResult); err != nil {
		t.Fatal("duplicate result not ignored", err)
	}
	got = request("GET", "/my/submissions/"+generated.ID, "alice", "", 200)
	if strings.Contains(got, "generated-version") || strings.Contains(got, "test-files/") || !strings.Contains(got, `"size":16777216`) {
		t.Fatal("invalid generated reference response", got)
	}
	var pinned string
	var ready bool
	if err = store.Pool().QueryRow(ctx, `SELECT upload_version_id,ready FROM test_files WHERE id=$1 AND owner_id='alice'`, file.ID).Scan(&pinned, &ready); err != nil || pinned != "generated-version" || ready {
		t.Fatal("generated file skipped validation", pinned, ready, err)
	}

}
