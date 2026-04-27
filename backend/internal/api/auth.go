package api

import (
	"context"
	"database/sql"
	"errors"
	"net/http"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"game-designer/backend/internal/config"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"golang.org/x/crypto/bcrypt"
)

var usernameRe = regexp.MustCompile(`^[a-zA-Z0-9_]{1,32}$`)

type registerBody struct {
	Email       string  `json:"email"`
	Password    string  `json:"password"`
	Username    string  `json:"username"`
	DisplayName *string `json:"displayName"`
}

type loginBody struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type mePatchBody struct {
	DisplayName *string `json:"displayName"`
}

func (s *Server) handleRegister(w http.ResponseWriter, r *http.Request) {
	var b registerBody
	if err := readJSON(r, &b); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid json", "bad_request")
		return
	}
	email := strings.TrimSpace(strings.ToLower(b.Email))
	if !strings.Contains(email, "@") || utf8.RuneCountInString(email) > 254 {
		writeErr(w, http.StatusBadRequest, "invalid email", "bad_request")
		return
	}
	if utf8.RuneCountInString(b.Password) < 8 {
		writeErr(w, http.StatusBadRequest, "password must be at least 8 characters", "bad_request")
		return
	}
	if !usernameRe.MatchString(b.Username) {
		writeErr(w, http.StatusBadRequest, "username: 1–32 chars, letters, digits, underscore only", "bad_request")
		return
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(b.Password), bcrypt.DefaultCost)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "hash error", "internal")
		return
	}
	ctx := r.Context()
	var disp sql.NullString
	if b.DisplayName != nil && strings.TrimSpace(*b.DisplayName) != "" {
		disp = sql.NullString{String: strings.TrimSpace(*b.DisplayName), Valid: true}
	}
	var id uuid.UUID
	err = s.pool.QueryRow(ctx,
		`INSERT INTO users (username, display_name, email, password_hash) VALUES ($1, $2, $3, $4) RETURNING id`,
		b.Username, disp, email, string(hash),
	).Scan(&id)
	if err != nil {
		if isPGUnique(err) {
			writeErr(w, http.StatusConflict, "email or username already in use", "conflict")
			return
		}
		writeErr(w, http.StatusInternalServerError, err.Error(), "internal")
		return
	}
	if err := s.createSessionForUser(w, ctx, id); err != nil {
		writeErr(w, http.StatusInternalServerError, "session error", "internal")
		return
	}
	m, err := s.meMap(ctx, id)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error(), "internal")
		return
	}
	writeJSON(w, http.StatusCreated, m)
}

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	var b loginBody
	if err := readJSON(r, &b); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid json", "bad_request")
		return
	}
	email := strings.TrimSpace(strings.ToLower(b.Email))
	ctx := r.Context()
	var id uuid.UUID
	var hash string
	err := s.pool.QueryRow(ctx,
		`SELECT id, password_hash FROM users WHERE lower(email) = $1`, email,
	).Scan(&id, &hash)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeErr(w, http.StatusUnauthorized, "invalid email or password", "unauthorized")
			return
		}
		writeErr(w, http.StatusInternalServerError, err.Error(), "internal")
		return
	}
	if err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(b.Password)); err != nil {
		writeErr(w, http.StatusUnauthorized, "invalid email or password", "unauthorized")
		return
	}
	if err := s.createSessionForUser(w, ctx, id); err != nil {
		writeErr(w, http.StatusInternalServerError, "session error", "internal")
		return
	}
	m, err := s.meMap(ctx, id)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error(), "internal")
		return
	}
	writeJSON(w, http.StatusOK, m)
}

func (s *Server) handleLogout(w http.ResponseWriter, r *http.Request) {
	c, err := r.Cookie(sessionCookie)
	if err == nil && c.Value != "" {
		_, _ = s.pool.Exec(r.Context(), `DELETE FROM auth_sessions WHERE token = $1`, c.Value)
	}
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookie,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   -1,
	})
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) patchMe(w http.ResponseWriter, r *http.Request) {
	uid, _ := userID(r.Context())
	var b mePatchBody
	if err := readJSON(r, &b); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid json", "bad_request")
		return
	}
	if b.DisplayName == nil {
		writeErr(w, http.StatusBadRequest, "displayName is required (use empty string to clear)", "bad_request")
		return
	}
	v := strings.TrimSpace(*b.DisplayName)
	var disp any
	if v == "" {
		disp = nil
	} else {
		disp = v
	}
	ctx := r.Context()
	_, err := s.pool.Exec(ctx, `UPDATE users SET display_name = $1 WHERE id = $2`, disp, uid)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error(), "internal")
		return
	}
	m, err := s.meMap(ctx, uid)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error(), "internal")
		return
	}
	writeJSON(w, http.StatusOK, m)
}

func (s *Server) getUserPublic(w http.ResponseWriter, r *http.Request) {
	name := strings.TrimSpace(chi.URLParam(r, "username"))
	if name == "" {
		writeErr(w, http.StatusBadRequest, "username required", "bad_request")
		return
	}
	ctx := r.Context()
	var id uuid.UUID
	var displayName sql.NullString
	var u string
	err := s.pool.QueryRow(ctx,
		`SELECT id, username, display_name FROM users WHERE username = $1`, name,
	).Scan(&id, &u, &displayName)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeErr(w, http.StatusNotFound, "not found", "not_found")
			return
		}
		writeErr(w, http.StatusInternalServerError, err.Error(), "internal")
		return
	}
	dn := any(nil)
	if displayName.Valid {
		dn = displayName.String
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"id": id.String(), "username": u, "displayName": dn,
	})
}

func isPGUnique(err error) bool {
	var pg *pgconn.PgError
	return errors.As(err, &pg) && pg.Code == "23505"
}

func (s *Server) createSessionForUser(w http.ResponseWriter, ctx context.Context, userID uuid.UUID) error {
	tok, err := randomToken(32)
	if err != nil {
		return err
	}
	exp := time.Now().Add(config.SessionTTL())
	_, err = s.pool.Exec(ctx, `INSERT INTO auth_sessions (user_id, token, expires_at) VALUES ($1, $2, $3)`,
		userID, tok, exp)
	if err != nil {
		return err
	}
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookie,
		Value:    tok,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   int(config.SessionTTL().Seconds()),
	})
	return nil
}

func (s *Server) meMap(ctx context.Context, id uuid.UUID) (map[string]any, error) {
	var username string
	var displayName sql.NullString
	err := s.pool.QueryRow(ctx, `SELECT username, display_name FROM users WHERE id = $1`, id).Scan(&username, &displayName)
	if err != nil {
		return nil, err
	}
	dn := any(nil)
	if displayName.Valid {
		dn = displayName.String
	}
	return map[string]any{
		"id": id.String(), "username": username, "displayName": dn,
	}, nil
}
