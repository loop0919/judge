// Package problems persists private, owner-scoped problem drafts.
package problems

import (
	"context"
	_ "embed"
	"encoding/json"
	"errors"
	"time"

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
	ID        string    `json:"id"`
	Version   int64     `json:"version"`
	UpdatedAt time.Time `json:"updatedAt"`
	Draft     Draft     `json:"draft"`
}

type Summary struct {
	ID        string    `json:"id"`
	Title     string    `json:"title"`
	UpdatedAt time.Time `json:"updatedAt"`
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

func Open(ctx context.Context, url string) (*Store, error) {
	cfg, err := pgxpool.ParseConfig(url)
	if err != nil {
		return nil, errors.New("invalid DATABASE_URL")
	}
	// Bound connections per API/Lambda process. No schema changes at startup.
	cfg.MaxConns = 4
	cfg.MinConns = 0
	cfg.MaxConnIdleTime = 5 * time.Minute
	cfg.ConnConfig.ConnectTimeout = 5 * time.Second
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, errors.New("cannot create database pool")
	}
	return &Store{pool: pool}, nil
}

func (s *Store) Close() { s.pool.Close() }

//go:embed schema.sql
var schema string

func (s *Store) Migrate(ctx context.Context) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if _, err = tx.Exec(ctx, `SELECT pg_advisory_xact_lock(709091001)`); err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, `CREATE TABLE IF NOT EXISTS schema_migrations (version bigint PRIMARY KEY)`); err != nil {
		return err
	}
	var applied bool
	if err = tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE version = 1)`).Scan(&applied); err != nil {
		return err
	}
	if !applied {
		if _, err = tx.Exec(ctx, schema); err != nil {
			return err
		}
		if _, err = tx.Exec(ctx, `INSERT INTO schema_migrations VALUES (1)`); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

func scan(row pgx.Row) (Problem, error) {
	var p Problem
	var data []byte
	err := row.Scan(&p.ID, &p.Version, &p.UpdatedAt, &data)
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
	return scan(s.pool.QueryRow(ctx, `SELECT id, version, updated_at, draft FROM problem_drafts WHERE owner_id=$1 AND id=$2`, owner, id))
}

// List returns at most 51 rows; the HTTP layer exposes 50 and a next cursor.
func (s *Store) List(ctx context.Context, owner string, cursor *Cursor) ([]Summary, error) {
	query := `SELECT id, draft->>'title', updated_at FROM problem_drafts WHERE owner_id=$1`
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
		if err := rows.Scan(&p.ID, &p.Title, &p.UpdatedAt); err != nil {
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
		p, err = scan(s.pool.QueryRow(ctx, `INSERT INTO problem_drafts (id, owner_id, draft) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING RETURNING id, version, updated_at, draft`, id, owner, data))
	} else {
		p, err = scan(s.pool.QueryRow(ctx, `UPDATE problem_drafts SET draft=$4, version=version+1, updated_at=clock_timestamp() WHERE owner_id=$1 AND id=$2 AND version=$3 RETURNING id, version, updated_at, draft`, owner, id, version, data))
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
