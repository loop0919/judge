package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/sqs"
	"github.com/jackc/pgx/v5"
	"judge/api/internal/database"

	"judge/api/internal/problems"
	"judge/api/internal/submissions"
)

func TestResultValidation(t *testing.T) {
	cpu, wall, memory := 0.0, 1.0, int64(1024)
	good := submissions.Result{Verdict: "AC", Total: 1, Passed: 1, Cases: []submissions.CaseResult{{Name: "one", Verdict: "AC", CPUTimeMS: &cpu, WallTimeMS: &wall, MemoryBytes: &memory}}}
	if !validResult(good) {
		t.Fatal("zero CPU measurement is valid")
	}
	good.Cases[0].SampleDetails = &submissions.SampleDetails{Input: submissions.TextPreview{Text: "1 2\n"}}
	if !validResult(good) {
		t.Fatal("sample preview rejected")
	}
	good.Cases[0].SampleDetails.Input.Text = strings.Repeat("x", 4097)
	if validResult(good) {
		t.Fatal("unbounded preview accepted")
	}
	good.Cases[0].SampleDetails.Input.Text = "\x00"
	if validResult(good) {
		t.Fatal("NUL preview accepted")
	}
	good.Cases[0].SampleDetails = nil
	good.Cases[0].CheckerLog = &submissions.TextPreview{Text: "対話判定: AC"}
	if !validResult(good) {
		t.Fatal("interactive diagnostic rejected")
	}
	good.Cases[0].CheckerLog.Text = strings.Repeat("x", 4097)
	if validResult(good) {
		t.Fatal("unbounded interactive diagnostic accepted")
	}
	good.Cases[0].CheckerLog = nil
	empty := ""
	good.Cases[0].Output = &empty
	if !validResult(good) {
		t.Fatal("empty generation output rejected")
	}
	inline := "x"
	good.Cases[0].Output = &inline
	if validResult(good) {
		t.Fatal("inline generation bytes must not enter queue")
	}
	good.Cases[0].Output = nil
	file := &problems.TestFile{ID: "33333333-3333-4333-8333-333333333333", Size: 16 << 20, SHA256: strings.Repeat("a", 64), Key: "test-files/owner/problem/generated/file", Version: "version"}
	good.Cases[0].OutputFile = file
	if !validResult(good) {
		t.Fatal("16 MiB file reference rejected")
	}
	encoded, _ := json.Marshal(envelope{Result: &good})
	if len(encoded) > 4096 {
		t.Fatal("result contains generated data")
	}
	file.Size++
	if validResult(good) {
		t.Fatal("oversized generated file accepted")
	}
	good.Cases[0].OutputFile = nil
	good.Cases[0].MemoryBytes = nil
	if validResult(good) {
		t.Fatal("missing measurement must not pass")
	}
	good.Cases[0].MemoryBytes = &memory
	good.Passed = 0
	if validResult(good) {
		t.Fatal("inconsistent aggregate must not pass")
	}
	if !validResult(submissions.Result{Verdict: "JE"}) {
		t.Fatal("infrastructure failure may have no measurements")
	}
	if !validResult(submissions.Result{Verdict: "JE", CheckerLog: strings.Repeat("a", 16384)}) || validResult(submissions.Result{Verdict: "JE", CheckerLog: strings.Repeat("a", 16385)}) {
		t.Fatal("checker diagnostic budget")
	}
}

func TestOutboxAndResultIdempotency(t *testing.T) {
	for _, runtime := range []string{"cpp17-isolate", "rust2024-isolate"} {
		t.Run(runtime, func(t *testing.T) { checkOutboxAndResultIdempotency(t, runtime) })
	}
}

func checkOutboxAndResultIdempotency(t *testing.T, runtime string) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL required")
	}
	ctx := context.Background()
	admin, err := pgx.Connect(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer admin.Close(ctx)
	schema := fmt.Sprintf("test_bridge_%d", time.Now().UnixNano())
	if _, err = admin.Exec(ctx, "CREATE SCHEMA "+schema); err != nil {
		t.Fatal(err)
	}
	defer admin.Exec(ctx, "DROP SCHEMA "+schema+" CASCADE")
	u, _ := url.Parse(dsn)
	q := u.Query()
	q.Set("search_path", schema)
	u.RawQuery = q.Encode()
	db, err := database.Open(ctx, u.String())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if err = database.Migrate(ctx, db); err != nil {
		t.Fatal(err)
	}
	const id = "11111111-1111-4111-8111-111111111111"
	const attempt = "22222222-2222-4222-8222-222222222222"
	digest := "sha256:" + strings.Repeat("a", 64)
	_, err = db.Exec(ctx, `INSERT INTO user_profiles(owner_id,handle) VALUES ('alice','alice')`)
	if err != nil {
		t.Fatal(err)
	}
	fileID := "33333333-3333-4333-8333-333333333333"
	fileDigest := strings.Repeat("b", 64)
	_, err = db.Exec(ctx, `INSERT INTO test_files(id,owner_id,problem_id,object_key,version_id,sha256,size,ready) VALUES ($1,'alice',$2,'test-files/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/11111111-1111-4111-8111-111111111111/33333333-3333-4333-8333-333333333333','test-version',$3,12,true)`, fileID, id, fileDigest)
	if err != nil {
		t.Fatal(err)
	}
	job := submissions.Job{Checker: &problems.Generator{Runtime: "python314", Source: "checker-secret"}, Image: digest, TimeLimitMS: 1000, MemoryLimitMB: 512, Cases: []submissions.Case{{Input: "input-secret", Output: "", OutputFile: &problems.TestFile{ID: fileID, Size: 12, SHA256: fileDigest}}}}
	if runtime == "rust2024-isolate" {
		job.Interactor, job.Checker = job.Checker, nil
	}
	raw, _ := json.Marshal(job)
	_, err = db.Exec(ctx, `INSERT INTO submissions(id,owner_id,problem_id,problem_version,problem_title,runtime,source,job,judge_attempt)
 VALUES ($1,'alice',$1,1,'test',$4,'source-secret',$2,$3)`, id, raw, attempt, runtime)
	if err != nil {
		t.Fatal(err)
	}
	var sent []string
	var jobs [][]byte
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "PUT" {
			data, _ := io.ReadAll(r.Body)
			jobs = append(jobs, data)
			w.Header().Set("x-amz-version-id", "version-one")
			w.WriteHeader(200)
			return
		}
		data, _ := io.ReadAll(r.Body)
		var request struct{ MessageBody string }
		if err := json.Unmarshal(data, &request); err != nil {
			t.Error(err)
		}
		sent = append(sent, request.MessageBody)
		w.Header().Set("Content-Type", "application/x-amz-json-1.0")
		fmt.Fprint(w, `{"MessageId":"test"}`)
	}))
	defer server.Close()
	cfg := aws.Config{Region: "ap-northeast-1", Credentials: credentials.NewStaticCredentialsProvider("test", "test", "")}
	b := bridge{db: db, bucket: "test-bucket", queueURL: server.URL + "/queue", runtime: digest,
		objects: s3.NewFromConfig(cfg, func(o *s3.Options) { o.BaseEndpoint = aws.String(server.URL); o.UsePathStyle = true }),
		queue:   sqs.NewFromConfig(cfg, func(o *sqs.Options) { o.BaseEndpoint = aws.String(server.URL) })}
	// A crash between successful send and DB commit must resend the same attempt.
	tx, _ := db.Begin(ctx)
	if err = b.dispatchOne(ctx, tx); err != nil {
		t.Fatal(err)
	}
	_ = tx.Rollback(ctx)
	if err = b.dispatch(ctx); err != nil {
		t.Fatal(err)
	}
	if len(sent) != 2 || sent[0] != sent[1] || strings.Contains(sent[0], "secret") {
		t.Fatalf("unsafe/unstable queue payloads: %v", sent)
	}
	if len(jobs) != 2 || !bytes.Contains(jobs[0], []byte(`"versionId":"test-version"`)) || !bytes.Contains(jobs[0], []byte(`"key":"test-files/`)) {
		t.Fatalf("test file locator missing from immutable job: %s", jobs[0])
	}
	if !bytes.Contains(jobs[0], []byte(`"runtime":"`+runtime+`"`)) {
		t.Fatal("submitted runtime was not preserved in dispatch")
	}
	field := "checker"
	if job.Interactor != nil {
		field = "interactor"
	}
	if !bytes.Contains(jobs[0], []byte(`"`+field+`":{"runtime":"python314","source":"checker-secret"}`)) {
		t.Fatal("checker was not preserved in dispatch")
	}
	if _, _, err = (&submissions.Store{Pool: db}).Claim(ctx); !errors.Is(err, pgx.ErrNoRows) {
		t.Fatal("local worker claimed a cloud job", err)
	}
	final := func(a string, r submissions.Result) {
		body, _ := json.Marshal(envelope{ID: id, Attempt: a, Result: &r})
		response := b.results(ctx, events.SQSEvent{Records: []events.SQSMessage{{MessageId: "one", Body: string(body)}}})
		if len(response.BatchItemFailures) > 0 {
			t.Fatal(response)
		}
	}
	final("wrong-attempt", submissions.Result{Verdict: "JE"})
	var status string
	if err = db.QueryRow(ctx, `SELECT status FROM submissions WHERE id=$1`, id).Scan(&status); err != nil || status != "QUEUED" {
		t.Fatal(status, err)
	}
	progress := func(a, phase string, completed, total int) {
		body, _ := json.Marshal(envelope{ID: id, Attempt: a, Progress: &submissions.Progress{Phase: phase, Completed: completed, Total: total}})
		if response := b.results(ctx, events.SQSEvent{Records: []events.SQSMessage{{MessageId: "progress", Body: string(body)}}}); len(response.BatchItemFailures) != 0 {
			t.Fatal(response)
		}
	}
	check := func(wantPhase string, wantCompleted int) {
		s, err := (&submissions.Store{Pool: db}).Get(ctx, "alice", id)
		if err != nil || s.Status != "RUNNING" || s.Progress == nil || s.Progress.Phase != wantPhase || s.Progress.Completed != wantCompleted {
			t.Fatalf("unexpected progress: %+v %v", s, err)
		}
	}
	progress("wrong-attempt", "JUDGING", 1, 1)
	progress(attempt, "PREPARING", 0, 1)
	check("PREPARING", 0)
	progress(attempt, "JUDGING", 0, 1)
	check("JUDGING", 0)
	progress(attempt, "JUDGING", 1, 1)
	progress(attempt, "JUDGING", 0, 1)
	progress(attempt, "PREPARING", 0, 1)
	progress(attempt, "JUDGING", 2, 2) // Valid envelope, but not this job's total.
	check("JUDGING", 1)
	final(attempt, submissions.Result{Verdict: "CE", Total: 1, CompileLog: "compiler diagnostic"})
	progress(attempt, "JUDGING", 1, 1)
	final(attempt, submissions.Result{Verdict: "JE"})
	var verdict string
	if err = db.QueryRow(ctx, `SELECT result->>'verdict' FROM submissions WHERE id=$1`, id).Scan(&verdict); err != nil || verdict != "CE" {
		t.Fatal("final result overwritten", verdict, err)
	}
}

func TestProgressValidation(t *testing.T) {
	for _, p := range []submissions.Progress{{Phase: "PREPARING", Total: 4}, {Phase: "JUDGING", Completed: 2, Total: 4}} {
		if !validProgress(p) {
			t.Fatal(p)
		}
	}
	for _, p := range []submissions.Progress{{Phase: "DONE", Total: 4}, {Phase: "PREPARING", Completed: 1, Total: 4}, {Phase: "JUDGING", Completed: 5, Total: 4}, {Phase: "JUDGING", Total: 101}, {Phase: "JUDGING"}, {Phase: "JUDGING", Completed: -1, Total: 4}} {
		if validProgress(p) {
			t.Fatal(p)
		}
	}
	// Ambiguous or empty envelopes must not be applied as either a result or progress.
	for _, body := range []string{`{}`, `{"result":{"verdict":"JE"},"progress":{"phase":"PREPARING","total":4}}`, `{"progress":{"phase":"UNKNOWN","total":4}}`} {
		response := (bridge{}).results(context.Background(), events.SQSEvent{Records: []events.SQSMessage{{MessageId: "bad", Body: body}}})
		if len(response.BatchItemFailures) != 1 {
			t.Fatal(response)
		}
	}
}
