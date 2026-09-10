// judge-worker processes the local development queue. Do not run inside the API Lambda.
package main

import (
	"context"
	"errors"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5"
	"judge/api/internal/database"
	"judge/api/internal/submissions"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	if os.Getenv("DATABASE_URL") == "" {
		log.Fatal("DATABASE_URL is required")
	}
	pool, err := database.Open(ctx, os.Getenv("DATABASE_URL"))
	if err != nil {
		log.Fatal(err)
	}
	defer pool.Close()
	store := submissions.Store{Pool: pool}
	log.Print("Local C++ judge worker started")
	for ctx.Err() == nil {
		item, job, err := store.Claim(ctx)
		if err == nil {
			jobCtx, cancel := context.WithTimeout(ctx, 5*time.Minute)
			result := submissions.Judge(jobCtx, item.Source, job)
			cancel()
			saveCtx, saveCancel := context.WithTimeout(context.Background(), 10*time.Second)
			if err := store.Finish(saveCtx, item.ID, result); err != nil {
				log.Print("Could not persist judge result")
			}
			saveCancel()
			continue
		}
		if !errors.Is(err, pgx.ErrNoRows) && ctx.Err() == nil {
			log.Print("Judge queue unavailable")
		}
		select {
		case <-ctx.Done():
		case <-time.After(time.Second):
		}
	}
}
