package api

import (
	"crypto/rand"
	"encoding/hex"
	"net/http"
	"time"

	"game-designer/backend/internal/ai"
	"game-designer/backend/internal/config"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

const sessionCookie = "gd_session"

type Server struct {
	pool  *pgxpool.Pool
	ai    *ai.Registry
	cfg   config.Config
	mount string // "/api"
}

func New(pool *pgxpool.Pool, reg *ai.Registry, cfg config.Config) *Server {
	if reg == nil {
		reg = ai.NewMockRegistry()
	}
	return &Server{pool: pool, ai: reg, cfg: cfg, mount: "/api"}
}

func (s *Server) Router() http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.RequestID, middleware.RealIP, middleware.Recoverer, middleware.Timeout(120*time.Second))
	r.Route(s.mount, func(r chi.Router) {
		if s.cfg.DevLogin {
			r.Post("/dev/login", s.handleDevLogin)
		}
		r.Post("/auth/register", s.handleRegister)
		r.Post("/auth/login", s.handleLogin)
		r.Post("/auth/logout", s.handleLogout)
		r.Get("/users/{username}", s.getUserPublic)
		r.Get("/me", s.handleMe)
		r.With(s.requireUser).Patch("/me", s.patchMe)

		r.With(s.requireUser).Get("/asset-groups", s.listAssetGroups)
		r.With(s.requireUser).Post("/asset-groups", s.createAssetGroup)
		r.With(s.requireUser).Delete("/asset-groups/{id}", s.deleteAssetGroup)

		r.Route("/assets", func(r chi.Router) {
			r.Get("/", s.listAssets)
			r.With(s.requireUser).Post("/", s.createAsset)
			// subpaths before /{id} to avoid route shadowing
			r.Get("/{id}/forks", s.getForks)
			r.With(s.requireUser).Post("/{id}/publish", s.publishAsset)
			r.With(s.requireUser).Post("/{id}/fork", s.forkAsset)
			r.With(s.requireUser).Post("/{id}/images", s.postImage)
			r.Get("/{id}", s.getAsset)
			r.With(s.requireUser).Patch("/{id}", s.patchAsset)
		})

		r.Route("/sessions", func(r chi.Router) {
			r.With(s.requireUser).Get("/", s.listChatSessions)
			r.With(s.requireUser).Post("/", s.createChatSession)
			r.With(s.requireUser).Get("/{sessionId}", s.getChatSession)
			r.With(s.requireUser).Delete("/{sessionId}", s.deleteChatSession)
			r.With(s.requireUser).Post("/{sessionId}/chat", s.postChat)
		})

		r.Route("/projects", func(r chi.Router) {
			r.With(s.requireUser).Get("/", s.listProjects)
			r.With(s.requireUser).Post("/", s.createProject)
			r.With(s.requireUser).Get("/{projectId}", s.getProject)
			r.With(s.requireUser).Patch("/{projectId}", s.patchProject)
		})
	})
	return r
}

func (s *Server) handleMe(w http.ResponseWriter, r *http.Request) {
	uid, err := s.sessionUserID(r)
	if err != nil || uid == uuid.Nil {
		writeErr(w, http.StatusUnauthorized, "not logged in", "unauthorized")
		return
	}
	m, err := s.meMap(r.Context(), uid)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, "not logged in", "unauthorized")
		return
	}
	writeJSON(w, http.StatusOK, m)
}

func (s *Server) handleDevLogin(w http.ResponseWriter, r *http.Request) {
	uid := uuid.MustParse("00000000-0000-0000-0000-000000000001")
	tok, err := randomToken(32)
	if err != nil {
		writeErr(w, 500, "token error", "internal")
		return
	}
	exp := time.Now().Add(config.SessionTTL())
	_, err = s.pool.Exec(r.Context(), `INSERT INTO auth_sessions (user_id, token, expires_at) VALUES ($1, $2, $3)`,
		uid, tok, exp)
	if err != nil {
		writeErr(w, 500, "session error", "internal")
		return
	}
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookie,
		Value:    tok,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   int(config.SessionTTL().Seconds()),
	})
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) sessionUserID(r *http.Request) (uuid.UUID, error) {
	c, err := r.Cookie(sessionCookie)
	if err != nil || c.Value == "" {
		return uuid.Nil, err
	}
	var uid uuid.UUID
	err = s.pool.QueryRow(r.Context(),
		`SELECT user_id FROM auth_sessions WHERE token = $1 AND expires_at > now()`,
		c.Value,
	).Scan(&uid)
	if err != nil {
		return uuid.Nil, err
	}
	return uid, nil
}

func (s *Server) requireUser(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		uid, err := s.sessionUserID(r)
		if err != nil || uid == uuid.Nil {
			writeErr(w, http.StatusUnauthorized, "not logged in", "unauthorized")
			return
		}
		next.ServeHTTP(w, r.WithContext(withUserID(r.Context(), uid)))
	})
}

func randomToken(n int) (string, error) {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

// — asset handlers in assets.go, sessions in sessions.go, projects in projects.go
