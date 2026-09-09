// Package problems persists private, owner-scoped problem drafts.
package problems

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"judge/api/internal/database"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrNotFound = errors.New("problem not found")
	ErrConflict = errors.New("problem changed")
)

type Draft struct {
	Title         string `json:"title"`
	Markdown      string `json:"markdown"`
	TimeLimitMS   string `json:"timeLimitMs"`
	MemoryLimitMB string `json:"memoryLimitMb"`
}

type Problem struct {
	PublishedVersion int64     `json:"publishedVersion"`
	ID               string    `json:"id"`
	Version          int64     `json:"version"`
	UpdatedAt        time.Time `json:"updatedAt"`
	Draft            Draft     `json:"draft"`
}

type Summary struct {
	PublishedVersion int64     `json:"publishedVersion"`
	ID               string    `json:"id"`
	Title            string    `json:"title"`
	UpdatedAt        time.Time `json:"updatedAt"`
}

type Cursor struct {
	UpdatedAt time.Time `json:"updatedAt"`
	ID        string    `json:"id"`
}

type Repository interface {
	Get(context.Context, string, string) (Problem, error)
	List(context.Context, string, *Cursor) ([]Summary, error)
	Save(context.Context, string, string, int64, Draft) (Problem, error)
	Delete(context.Context, string, string, int64) error
}

type Store struct{ pool *pgxpool.Pool }

func New(pool *pgxpool.Pool) *Store { return &Store{pool: pool} }

func Open(ctx context.Context, url string) (*Store, error) {
	pool, err := database.Open(ctx, url)
	if err != nil {
		return nil, err
	}
	return &Store{pool: pool}, nil
}

func (s *Store) Pool() *pgxpool.Pool               { return s.pool }
func (s *Store) Close()                            { s.pool.Close() }
func (s *Store) Migrate(ctx context.Context) error { return database.Migrate(ctx, s.pool) }

func scan(row pgx.Row) (Problem, error) {
	var p Problem
	var data []byte
	err := row.Scan(&p.ID, &p.Version, &p.UpdatedAt, &data, &p.PublishedVersion)
	if errors.Is(err, pgx.ErrNoRows) {
		return p, ErrNotFound
	}
	if err != nil {
		return p, err
	}
	err = json.Unmarshal(data, &p.Draft)
	return p, err
}

func (s *Store) Get(ctx context.Context, owner, id string) (Problem, error) {
	return scan(s.pool.QueryRow(ctx, `SELECT id, version, updated_at, draft, published_version FROM problem_drafts WHERE owner_id=$1 AND id=$2`, owner, id))
}

// List returns at most 51 rows; the HTTP layer exposes 50 and a next cursor.
func (s *Store) List(ctx context.Context, owner string, cursor *Cursor) ([]Summary, error) {
	query := `SELECT id, draft->>'title', updated_at, published_version FROM problem_drafts WHERE owner_id=$1`
	args := []any{owner}
	if cursor != nil {
		query += ` AND (updated_at, id) < ($2, $3::uuid)`
		args = append(args, cursor.UpdatedAt, cursor.ID)
	}
	rows, err := s.pool.Query(ctx, query+` ORDER BY updated_at DESC, id DESC LIMIT 51`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]Summary, 0)
	for rows.Next() {
		var p Summary
		if err := rows.Scan(&p.ID, &p.Title, &p.UpdatedAt, &p.PublishedVersion); err != nil {
			return nil, err
		}
		items = append(items, p)
	}
	return items, rows.Err()
}

func (s *Store) Save(ctx context.Context, owner, id string, version int64, draft Draft) (Problem, error) {
	data, err := json.Marshal(draft)
	if err != nil {
		return Problem{}, err
	}
	var p Problem
	if version == 0 {
		p, err = scan(s.pool.QueryRow(ctx, `INSERT INTO problem_drafts (id, owner_id, draft) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING RETURNING id, version, updated_at, draft, published_version`, id, owner, data))
	} else {
		p, err = scan(s.pool.QueryRow(ctx, `UPDATE problem_drafts SET draft=$4, version=version+1, updated_at=clock_timestamp() WHERE owner_id=$1 AND id=$2 AND version=$3 RETURNING id, version, updated_at, draft, published_version`, owner, id, version, data))
	}
	if !errors.Is(err, ErrNotFound) {
		return p, err
	}
	if _, getErr := s.Get(ctx, owner, id); getErr != nil {
		return Problem{}, getErr
	}
	return Problem{}, ErrConflict
}

func (s *Store) Delete(ctx context.Context, owner, id string, version int64) error {
	result, err := s.pool.Exec(ctx, `DELETE FROM problem_drafts WHERE owner_id=$1 AND id=$2 AND version=$3`, owner, id, version)
	if err != nil {
		return err
	}
	if result.RowsAffected() == 1 {
		return nil
	}
	if _, err := s.Get(ctx, owner, id); err != nil {
		return err
	}
	return ErrConflict
}
