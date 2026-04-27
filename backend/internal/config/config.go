package config

import (
	"os"
	"time"
)

type Config struct {
	DatabaseURL string
	HTTPAddr    string
	DevLogin    bool
	AIDriver    string // "mock" | future values
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
	return Config{DatabaseURL: u, HTTPAddr: addr, DevLogin: dev, AIDriver: ai}
}

func SessionTTL() time.Duration {
	if d := os.Getenv("SESSION_TTL"); d != "" {
		if x, err := time.ParseDuration(d); err == nil {
			return x
		}
	}
	return 30 * 24 * time.Hour
}
