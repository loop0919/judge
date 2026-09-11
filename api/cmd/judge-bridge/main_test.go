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
}

func TestOutboxAndResultIdempotency(t *testing.T) {
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
	raw, _ := json.Marshal(submissions.Job{Image: digest, TimeLimitMS: 1000, MemoryLimitMB: 512, Cases: []submissions.Case{{Input: "input-secret", Output: "", OutputFile: &problems.TestFile{ID: fileID, Size: 12, SHA256: fileDigest}}}})
	_, err = db.Exec(ctx, `INSERT INTO submissions(id,owner_id,problem_id,problem_version,problem_title,runtime,source,job,judge_attempt)
 VALUES ($1,'alice',$1,1,'test','cpp17-isolate','source-secret',$2,$3)`, id, raw, attempt)
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
	if _, _, err = (&submissions.Store{Pool: db}).Claim(ctx); !errors.Is(err, pgx.ErrNoRows) {
		t.Fatal("local worker claimed a cloud job", err)
	}
	final := func(a string, r submissions.Result) {
		body, _ := json.Marshal(envelope{ID: id, Attempt: a, Result: r})
		response := b.results(ctx, events.SQSEvent{Records: []events.SQSMessage{{MessageId: "one", Body: string(body)}}})
		if len(response.BatchItemFailures) > 0 {
			t.Fatal(response)
		}
	}
	final("wrong-attempt", submissions.Result{Verdict: "JE"})
	var status string
	if err = db.QueryRow(ctx, `SELECT status FROM submissions WHERE id=$1`, id).Scan(&status); err != nil || status != "RUNNING" {
		t.Fatal(status, err)
	}
	final(attempt, submissions.Result{Verdict: "CE", Total: 1, CompileLog: "compiler diagnostic"})
	final(attempt, submissions.Result{Verdict: "JE"})
	var verdict string
	if err = db.QueryRow(ctx, `SELECT result->>'verdict' FROM submissions WHERE id=$1`, id).Scan(&verdict); err != nil || verdict != "CE" {
		t.Fatal("final result overwritten", verdict, err)
	}
}
