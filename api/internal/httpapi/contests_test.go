package httpapi

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"judge/api/internal/contests"
	"judge/api/internal/problems"
	"judge/api/internal/profiles"
	"judge/api/internal/submissions"
)

func TestContestsPostgres(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL required")
	}
	ctx := context.Background()
	conn, err := pgx.Connect(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close(ctx)
	schema := fmt.Sprintf("test_contests_%d", time.Now().UnixNano())
	if _, err = conn.Exec(ctx, `CREATE SCHEMA `+schema); err != nil {
		t.Fatal(err)
	}
	defer conn.Exec(ctx, `DROP SCHEMA `+schema+` CASCADE`)
	u, _ := url.Parse(dsn)
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
	exec := func(query string, args ...any) {
		t.Helper()
		if _, e := store.Pool().Exec(ctx, query, args...); e != nil {
			t.Fatal(e)
		}
	}
	exec(`INSERT INTO user_profiles(owner_id,handle) VALUES ('alice','alice'),('bob','bob'),('tester','tester'),('carol','carol')`)
	const a = "11111111-1111-4111-8111-111111111111"
	const b = "22222222-2222-4222-8222-222222222222"
	const cid = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
	const other = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"
	draft := problems.Draft{Title: "Secret A", Markdown: "secret statement", Editorial: "secret editorial", TimeLimitMS: "1000", MemoryLimitMB: "512", TestCases: []problems.TestCase{{Input: "1", Output: "2", IsSample: true}, {Input: "private input", Output: "private output"}}}
	for _, id := range []string{a, b} {
		if _, err = store.Save(ctx, "alice", id, 0, draft); err != nil {
			t.Fatal(err)
		}
	}
	f := newSigningFixture(t)
	queue := &submissions.Store{Pool: store.Pool()}
	h := newHandler(AuthConfig{}, PrivateProblems{Store: store, Profiles: profiles.New(store.Pool()), Submissions: queue, JudgeImage: "sha256:" + strings.Repeat("a", 64), Verifier: newCognitoVerifier(f.server.URL, "client")})
	request := func(method, path, owner string, body any, want int) string {
		t.Helper()
		raw := ""
		if body != nil {
			data, e := json.Marshal(body)
			if e != nil {
				t.Fatal(e)
			}
			raw = string(data)
		}
		r := httptest.NewRequest(method, path, strings.NewReader(raw))
		r.Header.Set("Content-Type", "application/json")
		if owner != "" {
			r.Header.Set("Authorization", "Bearer "+f.token(t, owner, nil))
		}
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		if w.Code != want {
			t.Fatalf("%s %s: got %d want %d: %s", method, path, w.Code, want, w.Body.String())
		}
		if w.Header().Get("Cache-Control") != "no-store" {
			t.Fatal("cacheable contest response")
		}
		return w.Body.String()
	}
	penalty := 5
	in := contests.Input{Title: "Contest", Description: "Description", StartsAt: time.Now().Add(time.Hour), EndsAt: time.Now().Add(2 * time.Hour), PenaltyMinutes: &penalty, Problems: []contests.Problem{{ID: a, Points: 100}, {ID: b, Points: 200}}}
	request("PUT", "/my/contests/"+cid, "", in, 401)
	request("PUT", "/my/contests/"+cid, "bob", in, 409)
	request("PUT", "/my/contests/"+cid, "alice", in, 200)
	request("PUT", "/my/contests/"+other, "alice", in, 409)
	bad := in
	bad.Problems = []contests.Problem{{ID: a, Points: 100}, {ID: a, Points: 200}}
	request("PUT", "/my/contests/"+other, "alice", bad, 400)
	bad = in
	bad.StartsAt = time.Now().Add(-time.Minute)
	request("PUT", "/my/contests/"+other, "alice", bad, 409)
	request("GET", "/contests", "", nil, 200)
	request("GET", "/contests?offset=-1", "", nil, 400)
	detail := request("GET", "/contests/"+cid, "", nil, 200)
	if strings.Contains(detail, "Secret") || !strings.Contains(detail, `"problems":[]`) {
		t.Fatal("prestart leak", detail)
	}
	request("GET", "/contests/"+cid+"/problems/"+a, "", nil, 404)
	request("GET", "/problems/"+a, "", nil, 404)
	if detail = request("GET", "/my/contests/"+cid+"/problems/"+a, "alice", nil, 200); !strings.Contains(detail, "secret editorial") || strings.Contains(detail, "private input") {
		t.Fatal(detail)
	}
	request("GET", "/my/contests/"+cid+"/problems/"+a, "bob", nil, 404)
	request("PUT", "/my/problems/"+a+"/publication", "alice", map[string]any{"version": 1, "publish": true}, 409)
	request("DELETE", "/my/problems/"+a+"?version=1", "alice", nil, 409)
	// The owner can resave and reorder before the start. Stale writes are rejected.
	in.Version = 1
	in.Problems = []contests.Problem{{ID: b, Points: 200}, {ID: a, Points: 100}}
	request("PUT", "/my/contests/"+cid, "alice", in, 200)
	request("PUT", "/my/contests/"+cid, "alice", in, 409)
	request("PUT", "/my/contests/"+cid, "bob", in, 404)
	// Only the registered problem is visible to a tester before the start.
	exec(`INSERT INTO problem_testers(problem_id,owner_id) VALUES($1,'tester')`, a)
	request("GET", "/my/contests/"+cid+"/problems/"+a, "tester", nil, 200)
	request("GET", "/my/contests/"+cid+"/problems/"+b, "tester", nil, 404)
	var testerView contests.Contest
	json.Unmarshal([]byte(request("GET", "/my/contests/"+cid, "tester", nil, 200)), &testerView)
	if testerView.Official || len(testerView.Problems) != 1 {
		t.Fatal(testerView)
	}
	submit := func(owner, pid string, easy bool) submissions.Submission {
		t.Helper()
		var s submissions.Submission
		raw := request("POST", "/my/submissions", owner, map[string]any{"problemId": pid, "contestId": cid, "runtime": "cpp17", "source": "code of " + owner, "easyTest": easy}, 202)
		if e := json.Unmarshal([]byte(raw), &s); e != nil {
			t.Fatal(e)
		}
		return s
	}
	request("POST", "/my/submissions", "bob", map[string]any{"problemId": a, "contestId": cid, "runtime": "cpp17", "source": "code"}, 409)
	pre := submit("tester", a, false)
	start := time.Now().Add(-time.Hour).UTC().Truncate(time.Millisecond)
	end := time.Now().Add(time.Hour).UTC().Truncate(time.Millisecond)
	exec(`UPDATE contests SET starts_at=$2,ends_at=$3 WHERE id=$1`, cid, start, end)
	// Preserve the actual pre-start relation after moving the test clock.
	exec(`UPDATE submissions SET created_at=$2 WHERE id=$1`, pre.ID, start.Add(-time.Minute))
	in.Version = 2
	request("PUT", "/my/contests/"+cid, "alice", in, 409)
	detail = request("GET", "/contests/"+cid+"/problems/"+a, "", nil, 200)
	if !strings.Contains(detail, "secret statement") || strings.Contains(detail, "secret editorial") || strings.Contains(detail, "private input") {
		t.Fatal("running leak", detail)
	}
	// Editing a source draft cannot change the contest's pinned statement, tests or publication.
	draft.Title = "Changed draft"
	draft.Markdown = "changed statement"
	draft.TestCases[0].Output = "changed output"
	if _, err = store.Save(ctx, "alice", a, 1, draft); err != nil {
		t.Fatal(err)
	}
	accepted := submit("bob", a, false)
	var job []byte
	if err = store.Pool().QueryRow(ctx, `SELECT job FROM submissions WHERE id=$1`, accepted.ID).Scan(&job); err != nil || strings.Contains(string(job), "changed output") {
		t.Fatalf("snapshot %s %v", job, err)
	}
	if accepted.ContestID != cid {
		t.Fatal("missing contest context")
	}
	// Create out of judging order; ranking uses acceptance order, including delayed results.
	set := func(s submissions.Submission, minute int, verdict string) {
		t.Helper()
		exec(`UPDATE submissions SET created_at=$2,status='DONE',result=jsonb_build_object('verdict',$3::text,'passed',1,'total',1,'checkerLog','private diagnostic') WHERE id=$1`, s.ID, start.Add(time.Duration(minute)*time.Minute), verdict)
	}
	set(accepted, 30, "AC")
	wa := submit("bob", a, false)
	set(wa, 10, "WA")
	ce := submit("bob", a, false)
	set(ce, 11, "CE")
	re := submit("bob", a, false)
	set(re, 12, "RE")
	after := submit("bob", a, false)
	set(after, 31, "WA")
	unsolved := submit("bob", b, false)
	set(unsolved, 5, "WA")
	easy := submit("bob", b, true)
	set(easy, 20, "AC")
	creator := submit("alice", b, false)
	set(creator, 15, "AC")
	tester := submit("tester", b, false)
	set(tester, 15, "AC")
	tied := submit("carol", a, false)
	set(tied, 40, "AC")
	rank := func() []contests.Standing {
		t.Helper()
		var rows []contests.Standing
		json.Unmarshal([]byte(request("GET", "/contests/"+cid+"/standings", "", nil, 200)), &rows)
		return rows
	}
	rows := rank()
	if len(rows) != 2 || rows[0].Points != 100 || rows[0].TimeMS != 40*60000 || rows[0].Rank != 1 || rows[1].Rank != 1 {
		t.Fatalf("rank: %+v", rows)
	}
	request("GET", "/contests/"+cid+"/submissions", "", nil, 404)
	request("GET", "/contests/"+cid+"/submissions/"+accepted.ID, "", nil, 404)
	request("GET", "/my/submissions/"+accepted.ID, "carol", nil, 404)
	// Stop at 50 minutes, then finish a previously queued submission.
	end = start.Add(50 * time.Minute)
	delayed := submit("carol", b, false)
	exec(`UPDATE submissions SET created_at=$2 WHERE id=$1`, delayed.ID, end.Add(-time.Microsecond))
	boundary := submit("bob", b, false)
	exec(`UPDATE submissions SET created_at=$2 WHERE id=$1`, boundary.ID, end)
	exec(`UPDATE contests SET ends_at=$2 WHERE id=$1`, cid, end)
	detail = request("GET", "/problems/"+a, "", nil, 200)
	if !strings.Contains(detail, "secret editorial") || strings.Contains(detail, "changed statement") {
		t.Fatal("auto publication", detail)
	}
	var public problems.PublicProblem
	json.Unmarshal([]byte(detail), &public)
	if !public.PublishedAt.Equal(end) {
		t.Fatal(public.PublishedAt, end)
	}
	published, err := store.Get(ctx, "alice", a)
	if err != nil {
		t.Fatal(err)
	}
	request("GET", "/problems", "", nil, 200)
	again, _ := store.Get(ctx, "alice", a)
	if again.Version != published.Version {
		t.Fatal("release is not idempotent")
	}
	exec(`UPDATE submissions SET status='DONE',result='{"verdict":"AC","passed":1,"total":1}' WHERE id=ANY($1::uuid[])`, []string{delayed.ID, boundary.ID})
	rows = rank()
	if len(rows) != 2 || rows[0].Handle != "carol" || rows[0].Points != 300 || rows[1].Points != 100 {
		t.Fatalf("late results: %+v", rows)
	}
	practice := submit("bob", b, false)
	exec(`UPDATE submissions SET status='DONE',result='{"verdict":"AC","passed":1,"total":1}' WHERE id=$1`, practice.ID)
	if rows = rank(); rows[1].Points != 100 {
		t.Fatal("practice counted", rows)
	}
	detail = request("GET", "/contests/"+cid+"/submissions/"+accepted.ID, "", nil, 200)
	if !strings.Contains(detail, "code of bob") || strings.Contains(detail, "private diagnostic") {
		t.Fatal("public source/diagnostic", detail)
	}
	request("GET", "/contests/"+cid+"/submissions/"+easy.ID, "", nil, 404)
	request("GET", "/contests/"+cid+"/submissions/"+pre.ID, "", nil, 404)
	list := request("GET", "/contests/"+cid+"/submissions", "", nil, 200)
	if strings.Contains(list, "code of") || !strings.Contains(list, accepted.ID) {
		t.Fatal(list)
	}
	// Becoming a tester on either problem removes the user from the entire official table.
	exec(`INSERT INTO problem_testers(problem_id,owner_id) VALUES($1,'bob')`, b)
	if rows = rank(); len(rows) != 1 || rows[0].Handle != "carol" {
		t.Fatal(rows)
	}
	// Ordinary practice works after automatic publication, without contest context.
	request("POST", "/my/submissions", "bob", map[string]any{"problemId": a, "runtime": "cpp17", "source": "practice"}, 202)
}
