// Package submissions stores local-development C++ submissions and their immutable inputs.
package submissions

import (
	"context"
	"encoding/json"
	"errors"
	"judge/api/internal/problems"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrNotReady = errors.New("problem is not ready for judging")

type Case = problems.TestCase

type Job struct {
	Image         string `json:"image"`
	TimeLimitMS   int    `json:"timeLimitMs"`
	MemoryLimitMB int    `json:"memoryLimitMb"`
	Cases         []Case `json:"cases"`
}

type CaseResult struct {
	Name    string `json:"name"`
	Verdict string `json:"verdict"`
}

type Result struct {
	Cases      []CaseResult `json:"cases,omitempty"`
	Verdict    string       `json:"verdict"`
	Passed     int          `json:"passed"`
	Total      int          `json:"total"`
	CompileLog string       `json:"compileLog,omitempty"`
}

type Submission struct {
	ID             string    `json:"id"`
	ProblemID      string    `json:"problemId"`
	ProblemVersion int64     `json:"problemVersion"`
	ProblemTitle   string    `json:"problemTitle"`
	Runtime        string    `json:"runtime"`
	Source         string    `json:"source,omitempty"`
	Status         string    `json:"status"`
	Result         *Result   `json:"result"`
	CreatedAt      time.Time `json:"createdAt"`
}

type Store struct{ Pool *pgxpool.Pool }

const columns = `id,problem_id,problem_version,problem_title,runtime,source,status,result,created_at`

func scan(row pgx.Row) (Submission, error) {
	var s Submission
	var result []byte
	err := row.Scan(&s.ID, &s.ProblemID, &s.ProblemVersion, &s.ProblemTitle, &s.Runtime, &s.Source, &s.Status, &result, &s.CreatedAt)
	if err == nil && result != nil {
		err = json.Unmarshal(result, &s.Result)
	}
	return s, err
}

// Create pins the published version and limits in the same statement as insertion.
func (s *Store) Create(ctx context.Context, owner, id, problemID, source, image string) (Submission, error) {
	result, err := scan(s.Pool.QueryRow(ctx, `INSERT INTO submissions
  (id,owner_id,problem_id,problem_version,problem_title,runtime,source,job)
  SELECT $1,$2,id,published_version,published_draft->>'title','cpp17-local',$4,
  jsonb_build_object('image',$5::text,'cases',published_draft->'testCases',
  'timeLimitMs',(published_draft->>'timeLimitMs')::int,
  'memoryLimitMb',(published_draft->>'memoryLimitMb')::int)
  FROM problem_drafts WHERE id=$3 AND published_draft IS NOT NULL
  AND jsonb_array_length(COALESCE(published_draft->'testCases','[]'::jsonb)) > 0
  AND jsonb_array_length(COALESCE(published_draft->'testCases','[]'::jsonb)) <= 100
  RETURNING `+columns, id, owner, problemID, source, image))
	if errors.Is(err, pgx.ErrNoRows) {
		err = ErrNotReady
	}
	return result, err
}

func (s *Store) Get(ctx context.Context, owner, id string) (Submission, error) {
	return scan(s.Pool.QueryRow(ctx, `SELECT `+columns+` FROM submissions WHERE id=$1 AND owner_id=$2`, id, owner))
}

func (s *Store) List(ctx context.Context, owner string) ([]Submission, error) {
	rows, err := s.Pool.Query(ctx, `SELECT `+columns+` FROM submissions WHERE owner_id=$1 ORDER BY created_at DESC,id DESC LIMIT 50`, owner)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (Submission, error) {
		item, err := scan(row)
		item.Source = ""
		return item, err
	})
}

func (s *Store) Claim(ctx context.Context) (Submission, Job, error) {
	// ponytail: one attempt; interrupted jobs become JE after the judge deadline. Add retry attempts for production.
	_, err := s.Pool.Exec(ctx, `UPDATE submissions SET status='DONE',finished_at=clock_timestamp(),result='{"verdict":"JE","passed":0,"total":0}' WHERE status='RUNNING' AND started_at < clock_timestamp()-$1::int * interval '1 second'`, int((JudgeTimeout+time.Minute)/time.Second))
	if err != nil {
		return Submission{}, Job{}, err
	}
	var id string
	var raw []byte
	err = s.Pool.QueryRow(ctx, `UPDATE submissions SET status='RUNNING',started_at=clock_timestamp()
		WHERE id=(SELECT id FROM submissions WHERE status='QUEUED' ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT 1)
		RETURNING id,job`).Scan(&id, &raw)
	if err != nil {
		return Submission{}, Job{}, err
	}
	item, err := scan(s.Pool.QueryRow(ctx, `SELECT `+columns+` FROM submissions WHERE id=$1`, id))
	var job Job
	if err == nil {
		err = json.Unmarshal(raw, &job)
	}
	return item, job, err
}

func (s *Store) Finish(ctx context.Context, id string, result Result) error {
	data, err := json.Marshal(result)
	if err != nil {
		return err
	}
	_, err = s.Pool.Exec(ctx, `UPDATE submissions SET status='DONE',result=$2,finished_at=clock_timestamp() WHERE id=$1 AND status='RUNNING'`, id, data)
	return err
}
