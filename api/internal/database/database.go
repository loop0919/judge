// Package database manages the shared PostgreSQL pool and versioned migrations.
package database

import (
	"context"
	_ "embed"
	"errors"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

func Open(ctx context.Context, url string) (*pgxpool.Pool, error) {
	cfg, err := pgxpool.ParseConfig(url)
	if err != nil {
		return nil, errors.New("invalid DATABASE_URL")
	}
	cfg.MaxConns = 4
	cfg.MinConns = 0
	cfg.MaxConnIdleTime = 5 * time.Minute
	cfg.ConnConfig.ConnectTimeout = 5 * time.Second
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, errors.New("cannot create database pool")
	}
	return pool, nil
}

//go:embed 001_problems.sql
var problemsSchema string

//go:embed 002_profiles.sql
var profilesSchema string

//go:embed 003_publications.sql
var publicationsSchema string

//go:embed 004_submissions.sql
var submissionsSchema string

//go:embed 005_judge_outbox.sql
var judgeOutboxSchema string

//go:embed 006_test_files.sql
var testFilesSchema string

func Migrate(ctx context.Context, pool *pgxpool.Pool) error {
	tx, err := pool.Begin(ctx)
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
	for index, schema := range []string{problemsSchema, profilesSchema, publicationsSchema, submissionsSchema, judgeOutboxSchema, testFilesSchema} {
		version := index + 1
		var applied bool
		if err = tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE version=$1)`, version).Scan(&applied); err != nil {
			return err
		}
		if applied {
			continue
		}
		if _, err = tx.Exec(ctx, schema); err != nil {
			return err
		}
		if _, err = tx.Exec(ctx, `INSERT INTO schema_migrations VALUES ($1)`, version); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}
