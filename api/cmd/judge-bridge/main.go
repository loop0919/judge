// judge-bridge dispatches the durable DB outbox and applies SQS results.
// The Lightsail runner has no database credentials.
package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/sqs"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"judge/api/internal/database"
	"judge/api/internal/submissions"
)

type bridge struct {
	db                        *pgxpool.Pool
	objects                   *s3.Client
	queue                     *sqs.Client
	bucket, queueURL, runtime string
}

type envelope struct {
	ID      string             `json:"submissionId"`
	Attempt string             `json:"attemptId"`
	Result  submissions.Result `json:"result"`
}

func validResult(r submissions.Result) bool {
	allowed := map[string]bool{"AC": true, "WA": true, "TLE": true, "MLE": true, "OLE": true, "RE": true, "CE": true, "JE": true}
	if !allowed[r.Verdict] || r.Total < 0 || r.Total > 100 || r.Passed < 0 || r.Passed > r.Total || len(r.CompileLog) > 196608 {
		return false
	}
	if r.Verdict == "JE" || r.Verdict == "CE" {
		return r.Passed == 0 && len(r.Cases) == 0
	}
	if len(r.Cases) != r.Total || r.Total == 0 {
		return false
	}
	passed := 0
	verdict := "AC"
	for _, c := range r.Cases {
		if !allowed[c.Verdict] || c.Verdict == "CE" || c.Verdict == "JE" || c.CPUTimeMS == nil || c.WallTimeMS == nil || c.MemoryBytes == nil {
			return false
		}
		if len(c.Name) > 256 || *c.CPUTimeMS < 0 || *c.CPUTimeMS > 120000 || *c.WallTimeMS < 0 || *c.WallTimeMS > 120000 || *c.MemoryBytes < 0 || *c.MemoryBytes > 4<<30 {
			return false
		}
		if c.Verdict == "AC" {
			passed++
		} else if verdict == "AC" {
			verdict = c.Verdict
		}
	}
	return passed == r.Passed && verdict == r.Verdict
}

func (b bridge) results(ctx context.Context, event events.SQSEvent) events.SQSEventResponse {
	response := events.SQSEventResponse{}
	for _, record := range event.Records {
		var e envelope
		if len(record.Body) > 256<<10 || json.Unmarshal([]byte(record.Body), &e) != nil || !validResult(e.Result) {
			response.BatchItemFailures = append(response.BatchItemFailures, events.SQSBatchItemFailure{ItemIdentifier: record.MessageId})
			continue
		}
		raw, err := json.Marshal(e.Result)
		if err == nil {
			// UUID parameters are compared as text so poison IDs cannot abort unrelated records.
			_, err = b.db.Exec(ctx, `UPDATE submissions SET status='DONE',result=$3,finished_at=clock_timestamp()
    WHERE id::text=$1 AND judge_attempt::text=$2 AND runtime='cpp17-isolate' AND status <> 'DONE'`, e.ID, e.Attempt, raw)
		}
		if err != nil {
			response.BatchItemFailures = append(response.BatchItemFailures, events.SQSBatchItemFailure{ItemIdentifier: record.MessageId})
		}
	}
	return response
}

func (b bridge) dispatch(ctx context.Context) error {
	// Bounded expiry covers queue retries too; it does not rejudge a finalized submission.
	_, err := b.db.Exec(ctx, `UPDATE submissions SET status='DONE',finished_at=clock_timestamp(),result='{"verdict":"JE","passed":0,"total":0}'
  WHERE runtime='cpp17-isolate' AND status <> 'DONE' AND created_at < clock_timestamp()-interval '6 hours'`)
	if err != nil {
		return err
	}
	for range 20 {
		tx, err := b.db.Begin(ctx)
		if err != nil {
			return err
		}
		err = b.dispatchOne(ctx, tx)
		if err != nil {
			_ = tx.Rollback(ctx)
			if errors.Is(err, pgx.ErrNoRows) {
				return nil
			}
			return err
		}
		if err = tx.Commit(ctx); err != nil {
			return err
		}
	}
	return nil
}

func (b bridge) dispatchOne(ctx context.Context, tx pgx.Tx) error {
	var id, attempt, source string
	var raw []byte
	err := tx.QueryRow(ctx, `SELECT id::text,judge_attempt::text,source,job FROM submissions
  WHERE runtime='cpp17-isolate' AND dispatched_at IS NULL AND status <> 'DONE'
  ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT 1`).Scan(&id, &attempt, &source, &raw)
	if err != nil {
		return err
	}
	var job submissions.Job
	if err = json.Unmarshal(raw, &job); err != nil {
		return err
	}
	if err = (&submissions.Store{Pool: b.db}).ResolveTestFiles(ctx, &job); err != nil {
		return err
	}
	if job.Image != b.runtime || job.MemoryLimitMB != 512 {
		_, err = tx.Exec(ctx, `UPDATE submissions SET status='DONE',finished_at=clock_timestamp(),result='{"verdict":"JE","passed":0,"total":0}' WHERE id=$1`, id)
		return err
	}
	payload, err := json.Marshal(map[string]any{"submissionId": id, "attemptId": attempt, "runtime": "cpp17-isolate", "runtimeDigest": job.Image, "source": source, "cases": job.Cases, "timeLimitMs": job.TimeLimitMS, "memoryLimitMb": job.MemoryLimitMB})
	if err != nil {
		return err
	}
	sum := sha256.Sum256(payload)
	key := "jobs/" + id + "/" + attempt + ".json"
	obj, err := b.objects.PutObject(ctx, &s3.PutObjectInput{Bucket: aws.String(b.bucket), Key: aws.String(key), Body: bytes.NewReader(payload), ContentType: aws.String("application/json")})
	if err != nil {
		return err
	}
	if obj.VersionId == nil {
		return errors.New("versioned job bucket required")
	}
	pointer, _ := json.Marshal(map[string]string{"submissionId": id, "attemptId": attempt, "key": key, "versionId": *obj.VersionId, "sha256": hex.EncodeToString(sum[:])})
	_, err = b.queue.SendMessage(ctx, &sqs.SendMessageInput{QueueUrl: aws.String(b.queueURL), MessageBody: aws.String(string(pointer))})
	if err != nil {
		return err
	}
	// If commit fails after SendMessage, the same stable attempt is sent again.
	_, err = tx.Exec(ctx, `UPDATE submissions SET status='RUNNING',started_at=clock_timestamp(),dispatched_at=clock_timestamp() WHERE id=$1`, id)
	return err
}

func main() {
	ctx := context.Background()
	db, err := database.OpenConfigured(ctx, os.Getenv)
	if err != nil {
		panic("database configuration unavailable")
	}
	sdk, err := config.LoadDefaultConfig(ctx)
	if err != nil {
		panic("AWS configuration unavailable")
	}
	b := bridge{db: db, objects: s3.NewFromConfig(sdk), queue: sqs.NewFromConfig(sdk), bucket: os.Getenv("JUDGE_JOB_BUCKET"), queueURL: os.Getenv("JUDGE_REQUEST_QUEUE_URL"), runtime: os.Getenv("JUDGE_RUNTIME_DIGEST")}
	lambda.Start(func(ctx context.Context, raw json.RawMessage) (any, error) {
		var event events.SQSEvent
		if err := json.Unmarshal(raw, &event); err != nil {
			return nil, fmt.Errorf("invalid event")
		}
		if len(event.Records) > 0 {
			return b.results(ctx, event), nil
		}
		return nil, b.dispatch(ctx)
	})
}
