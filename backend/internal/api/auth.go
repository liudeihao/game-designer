package api

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
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

const maxProfileMediaURL = 2048

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

func parseOptionalProfileURL(raw json.RawMessage) (set bool, val any, err error) {
	if len(raw) == 0 {
		return false, nil, nil
	}
	if bytes.Equal(raw, []byte("null")) {
		return true, nil, nil
	}
	var s string
	if err := json.Unmarshal(raw, &s); err != nil {
		return false, nil, err
	}
	s = strings.TrimSpace(s)
	if s == "" {
		return true, nil, nil
	}
	if len(s) > maxProfileMediaURL {
		return false, nil, errors.New("url too long")
	}
	low := strings.ToLower(s)
	if !strings.HasPrefix(low, "https://") && !strings.HasPrefix(low, "http://") {
		return false, nil, errors.New("avatarUrl and coverUrl must be http(s) URLs")
	}
	return true, s, nil
}

func (s *Server) patchMe(w http.ResponseWriter, r *http.Request) {
	uid, _ := userID(r.Context())
	var raw map[string]json.RawMessage
	if err := json.NewDecoder(r.Body).Decode(&raw); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid json", "bad_request")
		return
	}
	if len(raw) == 0 {
		writeErr(w, http.StatusBadRequest, "at least one field required", "bad_request")
		return
	}
	var sets []string
	var args []any
	n := 1
	if v, ok := raw["displayName"]; ok {
		var disp any
		if bytes.Equal(v, []byte("null")) {
			disp = nil
		} else {
			var dn string
			if err := json.Unmarshal(v, &dn); err != nil {
				writeErr(w, http.StatusBadRequest, "displayName invalid", "bad_request")
				return
			}
			dn = strings.TrimSpace(dn)
			if dn == "" {
				disp = nil
			} else {
				if utf8.RuneCountInString(dn) > 80 {
					writeErr(w, http.StatusBadRequest, "displayName too long", "bad_request")
					return
				}
				disp = dn
			}
		}
		sets = append(sets, fmt.Sprintf("display_name = $%d", n))
		args = append(args, disp)
		n++
	}
	if v, ok := raw["avatarUrl"]; ok {
		okURL, val, err := parseOptionalProfileURL(v)
		if err != nil {
			writeErr(w, http.StatusBadRequest, err.Error(), "bad_request")
			return
		}
		if !okURL {
			writeErr(w, http.StatusBadRequest, "avatarUrl invalid", "bad_request")
			return
		}
		sets = append(sets, fmt.Sprintf("avatar_url = $%d", n))
		args = append(args, val)
		n++
	}
	if v, ok := raw["coverUrl"]; ok {
		okURL, val, err := parseOptionalProfileURL(v)
		if err != nil {
			writeErr(w, http.StatusBadRequest, err.Error(), "bad_request")
			return
		}
		if !okURL {
			writeErr(w, http.StatusBadRequest, "coverUrl invalid", "bad_request")
			return
		}
		sets = append(sets, fmt.Sprintf("cover_url = $%d", n))
		args = append(args, val)
		n++
	}
	if len(sets) == 0 {
		writeErr(w, http.StatusBadRequest, "no recognized fields", "bad_request")
		return
	}
	ctx := r.Context()
	args = append(args, uid)
	q := fmt.Sprintf("UPDATE users SET %s WHERE id = $%d", strings.Join(sets, ", "), n)
	_, err := s.pool.Exec(ctx, q, args...)
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
	var displayName, avatarURL, coverURL sql.NullString
	var u string
	var pubCount, forkSum, projCount int64
	err := s.pool.QueryRow(ctx, `
		SELECT u.id, u.username, u.display_name, u.avatar_url, u.cover_url,
			(SELECT count(*)::bigint FROM assets a WHERE a.author_id = u.id AND a.visibility = 'public' AND a.deleted_at IS NULL),
			(SELECT COALESCE(sum(a.fork_count), 0)::bigint FROM assets a WHERE a.author_id = u.id AND a.visibility = 'public' AND a.deleted_at IS NULL),
			(SELECT count(*)::bigint FROM projects p WHERE p.user_id = u.id)
		FROM users u WHERE u.username = $1`, name,
	).Scan(&id, &u, &displayName, &avatarURL, &coverURL, &pubCount, &forkSum, &projCount)
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
	out := map[string]any{
		"id": id.String(), "username": u, "displayName": dn,
		"stats": map[string]any{
			"publicAssets":  pubCount,
			"forksReceived": forkSum,
			"projects":      projCount,
		},
	}
	if avatarURL.Valid {
		out["avatarUrl"] = avatarURL.String
	} else {
		out["avatarUrl"] = nil
	}
	if coverURL.Valid {
		out["coverUrl"] = coverURL.String
	} else {
		out["coverUrl"] = nil
	}
	writeJSON(w, http.StatusOK, out)
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
	var displayName, avatarURL, coverURL sql.NullString
	err := s.pool.QueryRow(ctx,
		`SELECT username, display_name, avatar_url, cover_url FROM users WHERE id = $1`, id,
	).Scan(&username, &displayName, &avatarURL, &coverURL)
	if err != nil {
		return nil, err
	}
	dn := any(nil)
	if displayName.Valid {
		dn = displayName.String
	}
	out := map[string]any{
		"id": id.String(), "username": username, "displayName": dn,
	}
	if avatarURL.Valid {
		out["avatarUrl"] = avatarURL.String
	} else {
		out["avatarUrl"] = nil
	}
	if coverURL.Valid {
		out["coverUrl"] = coverURL.String
	} else {
		out["coverUrl"] = nil
	}
	return out, nil
}
