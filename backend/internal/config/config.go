package config

import (
	"os"
	"time"
)

type Config struct {
	DatabaseURL string
	HTTPAddr    string
	DevLogin    bool
	AIDriver    string // "mock" | "eino"
	// Eino + OpenAI-compatible Chat Completions (server-side only).
	AIAPIKey      string
	AIBaseURL     string // optional; empty = default OpenAI host
	AIChatModel   string
	AIHTTPTimeout time.Duration
}

func Load() Config {
	u := os.Getenv("DATABASE_URL")
	if u == "" {
		u = "postgres://postgres:postgres@127.0.0.1:5432/game_designer?sslmode=disable"
	}
	addr := os.Getenv("HTTP_ADDR")
	if addr == "" {
		addr = ":8080"
	}
	dev := os.Getenv("DEV") == "1" || os.Getenv("DEV") == "true"
	ai := os.Getenv("AI_DRIVER")
	if ai == "" {
		ai = "mock"
	}
	aiKey := os.Getenv("AI_API_KEY")
	aiBase := os.Getenv("AI_BASE_URL")
	aiModel := os.Getenv("AI_CHAT_MODEL")
	if aiModel == "" {
		aiModel = "gpt-4o-mini"
	}
	aiTimeout := 90 * time.Second
	if d := os.Getenv("AI_HTTP_TIMEOUT"); d != "" {
		if x, err := time.ParseDuration(d); err == nil {
			aiTimeout = x
		}
	}
	return Config{
		DatabaseURL: u, HTTPAddr: addr, DevLogin: dev, AIDriver: ai,
		AIAPIKey: aiKey, AIBaseURL: aiBase, AIChatModel: aiModel, AIHTTPTimeout: aiTimeout,
	}
}

func SessionTTL() time.Duration {
	if d := os.Getenv("SESSION_TTL"); d != "" {
		if x, err := time.ParseDuration(d); err == nil {
			return x
		}
	}
	return 30 * 24 * time.Hour
}
