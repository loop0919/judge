// This Lambda has no public HTTP route. The deployment role invokes it directly.
package main

import (
	"context"
	"errors"
	"os"
	"time"

	"github.com/aws/aws-lambda-go/lambda"
	"judge/api/internal/database"
)

func migrate(ctx context.Context) (map[string]bool, error) {
	ctx, cancel := context.WithTimeout(ctx, 110*time.Second)
	defer cancel()
	pool, err := database.OpenConfigured(ctx, os.Getenv)
	if err != nil {
		return nil, errors.New("cannot configure migration database")
	}
	defer pool.Close()
	if err := database.Migrate(ctx, pool); err != nil {
		return nil, errors.New("database migration failed; check connectivity and schema permissions")
	}
	return map[string]bool{"migrated": true}, nil
}

func main() { lambda.Start(migrate) }
