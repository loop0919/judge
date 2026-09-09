package main

import (
	"context"
	"log"
	"os"
	"time"

	"judge/api/internal/problems"
)

func main() {
	if os.Getenv("DATABASE_URL") == "" {
		log.Fatal("DATABASE_URL is required")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	store, err := problems.Open(ctx, os.Getenv("DATABASE_URL"))
	if err != nil {
		log.Fatal("Cannot configure database")
	}
	defer store.Close()
	if err := store.Migrate(ctx); err != nil {
		log.Fatal("Database migration failed; check connectivity and schema permissions")
	}
	log.Print("Database migrations applied")
}
