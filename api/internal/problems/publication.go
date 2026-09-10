package problems

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
)

type PublicProblem struct {
	ID            string    `json:"id"`
	Title         string    `json:"title"`
	Markdown      string    `json:"markdown,omitempty"`
	TimeLimitMS   string    `json:"timeLimitMs,omitempty"`
	MemoryLimitMB string    `json:"memoryLimitMb,omitempty"`
	Author        string    `json:"author"`
	PublishedAt   time.Time `json:"publishedAt"`
}
type Publications interface {
	Publish(context.Context, string, string, int64, bool) (Problem, error)
	PublicGet(context.Context, string) (PublicProblem, error)
	PublicList(context.Context, *Cursor) ([]PublicProblem, error)
}

func (s *Store) Publish(ctx context.Context, owner, id string, version int64, publish bool) (Problem, error) {
	query := `UPDATE problem_drafts SET published_draft=NULL,published_version=0,published_at=NULL,version=version+1 WHERE owner_id=$1 AND id=$2 AND version=$3 RETURNING id,version,updated_at,draft,published_version`
	if publish {
		query = `UPDATE problem_drafts SET published_draft=draft,published_version=version+1,published_at=clock_timestamp(),version=version+1 WHERE owner_id=$1 AND id=$2 AND version=$3 RETURNING id,version,updated_at,draft,published_version`
	}
	p, err := scan(s.pool.QueryRow(ctx, query, owner, id, version))
	if errors.Is(err, ErrNotFound) {
		if _, e := s.Get(ctx, owner, id); e != nil {
			return p, e
		}
		return p, ErrConflict
	}
	return p, err
}

func (s *Store) PublicGet(ctx context.Context, id string) (PublicProblem, error) {
	var p PublicProblem
	var data []byte
	err := s.pool.QueryRow(ctx, `SELECT d.id,d.published_draft,u.handle,d.published_at FROM problem_drafts d JOIN user_profiles u ON u.owner_id=d.owner_id WHERE d.id=$1 AND d.published_draft IS NOT NULL`, id).Scan(&p.ID, &data, &p.Author, &p.PublishedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return p, ErrNotFound
		}
		return p, err
	}
	var d Draft
	if err = json.Unmarshal(data, &d); err != nil {
		return p, err
	}
	p.Title = d.Title
	p.Markdown = d.Markdown
	p.TimeLimitMS = d.TimeLimitMS
	p.MemoryLimitMB = d.MemoryLimitMB
	return p, nil
}

func (s *Store) PublicList(ctx context.Context, cursor *Cursor) ([]PublicProblem, error) {
	query := `SELECT d.id,d.published_draft->>'title',u.handle,d.published_at FROM problem_drafts d JOIN user_profiles u ON u.owner_id=d.owner_id WHERE d.published_draft IS NOT NULL`
	args := []any{}
	if cursor != nil {
		query += ` AND (d.published_at,d.id)<($1,$2::uuid)`
		args = append(args, cursor.UpdatedAt, cursor.ID)
	}
	rows, err := s.pool.Query(ctx, query+` ORDER BY d.published_at DESC,d.id DESC LIMIT 51`, args...)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (PublicProblem, error) {
		var p PublicProblem
		err := row.Scan(&p.ID, &p.Title, &p.Author, &p.PublishedAt)
		return p, err
	})
}
