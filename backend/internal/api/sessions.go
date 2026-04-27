package api

import (
	"context"
	"errors"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type chatPostBody struct {
	Message string `json:"message"`
}

func (s *Server) listChatSessions(w http.ResponseWriter, r *http.Request) {
	uid, _ := userID(r.Context())
	ctx := r.Context()
	rows, err := s.pool.Query(ctx, `
		SELECT cs.id, cs.title, cs.updated_at,
			(SELECT COUNT(*)::int FROM draft_assets d WHERE d.session_id = cs.id)
		FROM chat_sessions cs
		WHERE cs.user_id = $1
		ORDER BY cs.updated_at DESC
	`, uid)
	if err != nil {
		writeErr(w, 500, err.Error(), "internal")
		return
	}
	defer rows.Close()
	var out []any
	for rows.Next() {
		var id uuid.UUID
		var title string
		var up time.Time
		var draftCount int
		if err := rows.Scan(&id, &title, &up, &draftCount); err != nil {
			writeErr(w, 500, err.Error(), "internal")
			return
		}
		out = append(out, map[string]any{
			"id": id.String(), "title": title, "updatedAt": up.Format(time.RFC3339),
			"draftAssetCount": draftCount,
		})
	}
	writeJSON(w, 200, out)
}

type createSessionBody struct {
	Title string `json:"title"`
}

func (s *Server) createChatSession(w http.ResponseWriter, r *http.Request) {
	uid, _ := userID(r.Context())
	var b createSessionBody
	_ = readJSON(r, &b)
	title := b.Title
	if title == "" {
		title = "新会话"
	}
	ctx := r.Context()
	var id uuid.UUID
	err := s.pool.QueryRow(ctx, `INSERT INTO chat_sessions (user_id, title) VALUES ($1, $2) RETURNING id`, uid, title).Scan(&id)
	if err != nil {
		writeErr(w, 500, err.Error(), "internal")
		return
	}
	m, err := s.getSessionDetail(ctx, id)
	if err != nil {
		writeErr(w, 500, err.Error(), "internal")
		return
	}
	writeJSON(w, 201, m)
}

func (s *Server) getChatSession(w http.ResponseWriter, r *http.Request) {
	uid, _ := userID(r.Context())
	sid, err := uuid.Parse(chi.URLParam(r, "sessionId"))
	if err != nil {
		writeErr(w, 400, "bad id", "bad_request")
		return
	}
	ctx := r.Context()
	var owner uuid.UUID
	err = s.pool.QueryRow(ctx, `SELECT user_id FROM chat_sessions WHERE id = $1`, sid).Scan(&owner)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeErr(w, 404, "not found", "not_found")
			return
		}
		writeErr(w, 500, err.Error(), "internal")
		return
	}
	if owner != uid {
		writeErr(w, 404, "not found", "not_found")
		return
	}
	m, err := s.getSessionDetail(ctx, sid)
	if err != nil {
		writeErr(w, 500, err.Error(), "internal")
		return
	}
	writeJSON(w, 200, m)
}

func (s *Server) getSessionDetail(ctx context.Context, sessionID uuid.UUID) (map[string]any, error) {
	var title string
	var up time.Time
	err := s.pool.QueryRow(ctx, `SELECT title, updated_at FROM chat_sessions WHERE id = $1`, sessionID).Scan(&title, &up)
	if err != nil {
		return nil, err
	}
	var draftCount int
	_ = s.pool.QueryRow(ctx, `SELECT COUNT(*)::int FROM draft_assets WHERE session_id = $1`, sessionID).Scan(&draftCount)
	msgs, err := s.sessionMessages(ctx, sessionID)
	if err != nil {
		return nil, err
	}
	drafts, err := s.sessionDrafts(ctx, sessionID)
	if err != nil {
		return nil, err
	}
	return map[string]any{
		"id": sessionID.String(), "title": title, "updatedAt": up.Format(time.RFC3339),
		"draftAssetCount": draftCount,
		"messages":        msgs, "draftAssets": drafts,
	}, nil
}

func (s *Server) sessionMessages(ctx context.Context, sessionID uuid.UUID) ([]any, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, role, content, created_at FROM chat_messages WHERE session_id = $1 ORDER BY created_at
	`, sessionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []any
	for rows.Next() {
		var id uuid.UUID
		var role, content string
		var created time.Time
		if err := rows.Scan(&id, &role, &content, &created); err != nil {
			return nil, err
		}
		out = append(out, map[string]any{
			"id": id.String(), "role": role, "content": content, "createdAt": created.Format(time.RFC3339),
		})
	}
	return out, nil
}

func (s *Server) sessionDrafts(ctx context.Context, sessionID uuid.UUID) ([]any, error) {
	rows, err := s.pool.Query(ctx, `SELECT temp_id, name, description, done FROM draft_assets WHERE session_id = $1`, sessionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []any
	for rows.Next() {
		var tempID, name, desc string
		var done bool
		if err := rows.Scan(&tempID, &name, &desc, &done); err != nil {
			return nil, err
		}
		out = append(out, map[string]any{"tempId": tempID, "name": name, "description": desc, "done": done})
	}
	return out, nil
}

func (s *Server) deleteChatSession(w http.ResponseWriter, r *http.Request) {
	uid, _ := userID(r.Context())
	sid, err := uuid.Parse(chi.URLParam(r, "sessionId"))
	if err != nil {
		writeErr(w, 400, "bad id", "bad_request")
		return
	}
	ctx := r.Context()
	res, err := s.pool.Exec(ctx, `DELETE FROM chat_sessions WHERE id = $1 AND user_id = $2`, sid, uid)
	if err != nil {
		writeErr(w, 500, err.Error(), "internal")
		return
	}
	if res.RowsAffected() == 0 {
		writeErr(w, 404, "not found", "not_found")
		return
	}
	w.WriteHeader(204)
}

func (s *Server) postChat(w http.ResponseWriter, r *http.Request) {
	uid, _ := userID(r.Context())
	sid, err := uuid.Parse(chi.URLParam(r, "sessionId"))
	if err != nil {
		writeErr(w, 400, "bad id", "bad_request")
		return
	}
	var b chatPostBody
	if err := readJSON(r, &b); err != nil || b.Message == "" {
		writeErr(w, 400, "message required", "bad_request")
		return
	}
	ctx := r.Context()
	var owner uuid.UUID
	err = s.pool.QueryRow(ctx, `SELECT user_id FROM chat_sessions WHERE id = $1`, sid).Scan(&owner)
	if err != nil {
		writeErr(w, 404, "not found", "not_found")
		return
	}
	if owner != uid {
		writeErr(w, 404, "not found", "not_found")
		return
	}
	_, _ = s.pool.Exec(ctx, `INSERT INTO chat_messages (session_id, role, content) VALUES ($1, 'user', $2)`, sid, b.Message)
	_, _ = s.pool.Exec(ctx, `UPDATE chat_sessions SET updated_at = now() WHERE id = $1`, sid)

	draftTemp := "temp_" + uuid.NewString()[:8]
	w.Header().Set("Content-Type", "text/event-stream; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache, no-transform")
	w.Header().Set("Connection", "keep-alive")
	w.WriteHeader(200)
	if f, ok := w.(http.Flusher); ok {
		f.Flush()
	}
	err = s.ai.Chat.StreamChat(ctx, w, sid, uid, b.Message, draftTemp)
	if err != nil {
		return
	}
	// after stream: assistant summary + draft (mock one asset)
	_, _ = s.pool.Exec(ctx, `INSERT INTO chat_messages (session_id, role, content) VALUES ($1, 'assistant', $2)`,
		sid, "已生成一条素材，可在右侧暂存区导出。")
	_, _ = s.pool.Exec(ctx, `INSERT INTO draft_assets (session_id, temp_id, name, description, done) VALUES ($1, $2, $3, $4, true)
		ON CONFLICT (session_id, temp_id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, done = true`,
		sid, draftTemp, "MOCK ASSET", "由 Go Mock 生成的草稿")
	_, _ = s.pool.Exec(ctx, `UPDATE chat_sessions SET updated_at = now() WHERE id = $1`, sid)
}
