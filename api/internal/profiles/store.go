// Package profiles persists user-chosen identities separately from Cognito subjects.
package profiles

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrNotFound    = errors.New("profile not found")
	ErrHandleTaken = errors.New("handle already used")
	ErrConflict    = errors.New("profile changed")
)

type Profile struct {
	Handle    string    `json:"handle"`
	Avatar    string    `json:"avatar"`
	Version   int64     `json:"version"`
	CreatedAt time.Time `json:"createdAt"`
}
type Repository interface {
	Get(context.Context, string) (Profile, error)
	Save(context.Context, string, string, string, int64) (Profile, error)
}
type Store struct{ pool *pgxpool.Pool }

func New(pool *pgxpool.Pool) *Store { return &Store{pool: pool} }
func scan(row pgx.Row) (Profile, error) {
	var p Profile
	err := row.Scan(&p.Handle, &p.Avatar, &p.Version, &p.CreatedAt)
	return p, err
}

func (s *Store) Get(ctx context.Context, owner string) (Profile, error) {
	p, err := scan(s.pool.QueryRow(ctx, `SELECT handle,avatar,version,created_at FROM user_profiles WHERE owner_id=$1`, owner))
	if errors.Is(err, pgx.ErrNoRows) {
		err = ErrNotFound
	}
	return p, err
}

func (s *Store) Save(ctx context.Context, owner, handle, avatar string, version int64) (Profile, error) {
	var p Profile
	var err error
	if version == 0 {
		p, err = scan(s.pool.QueryRow(ctx, `INSERT INTO user_profiles(owner_id,handle,avatar) VALUES ($1,$2,$3) RETURNING handle,avatar,version,created_at`, owner, handle, avatar))
	} else {
		p, err = scan(s.pool.QueryRow(ctx, `UPDATE user_profiles SET handle=$2,avatar=$3,version=version+1 WHERE owner_id=$1 AND version=$4 RETURNING handle,avatar,version,created_at`, owner, handle, avatar, version))
	}
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" {
		if pgErr.ConstraintName == "user_profiles_handle_key" {
			return p, ErrHandleTaken
		}
		return p, ErrConflict
	}
	if errors.Is(err, pgx.ErrNoRows) {
		return p, ErrConflict
	}
	return p, err
}
