package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"game-designer/backend/internal/ai"
	"game-designer/backend/internal/api"
	"game-designer/backend/internal/config"
	"game-designer/backend/internal/db"

	"github.com/jackc/pgx/v5/pgxpool"
)

func main() {
	cfg := config.Load()
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("db: %v", err)
	}
	defer pool.Close()
	if err := db.Migrate(ctx, pool); err != nil {
		log.Fatalf("migrate: %v", err)
	}
	var reg *ai.Registry
	switch strings.ToLower(strings.TrimSpace(cfg.AIDriver)) {
	case "mock", "":
		reg = ai.NewMockRegistry()
	case "eino":
		if strings.TrimSpace(cfg.AIAPIKey) == "" {
			log.Printf("AI_DRIVER=eino but AI_API_KEY is empty; using mock")
			reg = ai.NewMockRegistry()
		} else {
			chat, err := ai.NewEinoChat(ctx, cfg.AIAPIKey, cfg.AIBaseURL, cfg.AIChatModel, cfg.AIHTTPTimeout)
			if err != nil {
				log.Printf("eino chat init: %v; using mock", err)
				reg = ai.NewMockRegistry()
			} else {
				reg = &ai.Registry{Chat: chat, Image: &ai.MockImage{}}
			}
		}
	default:
		log.Printf("unknown AI_DRIVER=%q, using mock", cfg.AIDriver)
		reg = ai.NewMockRegistry()
	}
	srv := api.New(pool, reg, cfg)
	httpSrv := &http.Server{Addr: cfg.HTTPAddr, Handler: srv.Router()}

	go func() {
		log.Printf("listening %s", cfg.HTTPAddr)
		if err := httpSrv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("http: %v", err)
		}
	}()

	ch := make(chan os.Signal, 1)
	signal.Notify(ch, syscall.SIGINT, syscall.SIGTERM)
	<-ch
	shutdown, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := httpSrv.Shutdown(shutdown); err != nil {
		log.Printf("shutdown: %v", err)
	}
}
