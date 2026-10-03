package main

import (
	"context"
	"log"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/mbobrenko/a2casino/backend/internal/db"
)

// connectWithRetry waits for Postgres to come up (docker-compose starts services in parallel).
func connectWithRetry(ctx context.Context, url string) (*pgxpool.Pool, error) {
	var lastErr error
	for i := 0; i < 30; i++ {
		pool, err := db.Connect(ctx, url)
		if err == nil {
			return pool, nil
		}
		lastErr = err
		log.Printf("waiting for database: %v", err)
		time.Sleep(2 * time.Second)
	}
	return nil, lastErr
}
