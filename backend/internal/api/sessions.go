package api

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// draftTarget is where rows in draft_assets live for the given chat session (UI path).
type draftTarget struct {
	useGroup  bool
	groupID   uuid.UUID
	sessionID uuid.UUID
}

type chatPostBody struct {
	Message string `json:"message"`
}

func (s *Server) resolveDraftTarget(ctx context.Context, sessionID uuid.UUID) (draftTarget, error) {
	var sgid *uuid.UUID
	var ds *string
	err := s.pool.QueryRow(ctx, `
		SELECT cs.staging_group_id, g.draft_staging
		FROM chat_sessions cs
		LEFT JOIN session_staging_groups g ON g.id = cs.staging_group_id
		WHERE cs.id = $1
	`, sessionID).Scan(&sgid, &ds)
	if err != nil {
		return draftTarget{}, err
	}
	if sgid == nil || ds == nil || *ds == "independent" {
		return draftTarget{useGroup: false, sessionID: sessionID}, nil
	}
	return draftTarget{useGroup: true, groupID: *sgid}, nil
}

func (s *Server) listChatSessions(w http.ResponseWriter, r *http.Request) {
	uid, _ := userID(r.Context())
	ctx := r.Context()
	rows, err := s.pool.Query(ctx, `
		SELECT
			cs.id, cs.title, cs.updated_at,
			g.id, g.name, g.draft_staging,
			CASE
				WHEN g.draft_staging = 'shared' AND g.id IS NOT NULL THEN
					(SELECT count(*)::int FROM draft_assets d WHERE d.group_id = g.id)
				ELSE
					(SELECT count(*)::int FROM draft_assets d WHERE d.session_id = cs.id AND d.group_id IS NULL)
			END
		FROM chat_sessions cs
		LEFT JOIN session_staging_groups g ON g.id = cs.staging_group_id
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
		var gid *uuid.UUID
		var gname *string
		var gds *string
		var draftCount int
		if err := rows.Scan(&id, &title, &up, &gid, &gname, &gds, &draftCount); err != nil {
			writeErr(w, 500, err.Error(), "internal")
			return
		}
		row := map[string]any{
			"id": id.String(), "title": title, "updatedAt": up.Format(time.RFC3339),
			"draftAssetCount": draftCount,
		}
		if gid != nil && gname != nil && gds != nil {
			row["stagingGroup"] = map[string]any{
				"id": gid.String(), "name": *gname, "draftStaging": *gds,
			}
		} else {
			row["stagingGroup"] = nil
		}
		out = append(out, row)
	}
	if out == nil {
		out = []any{}
	}
	writeJSON(w, 200, out)
}

type createSessionBody struct {
	Title          string  `json:"title"`
	StagingGroupID *string `json:"stagingGroupId"`
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
	var err error
	if b.StagingGroupID != nil && strings.TrimSpace(*b.StagingGroupID) != "" {
		gid, perr := uuid.Parse(strings.TrimSpace(*b.StagingGroupID))
		if perr != nil {
			writeErr(w, 400, "bad stagingGroupId", "bad_request")
			return
		}
		var owner uuid.UUID
		err = s.pool.QueryRow(ctx, `SELECT user_id FROM session_staging_groups WHERE id = $1`, gid).Scan(&owner)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				writeErr(w, 400, "staging group not found", "bad_request")
			} else {
				writeErr(w, 500, err.Error(), "internal")
			}
			return
		}
		if owner != uid {
			writeErr(w, 400, "staging group not found", "bad_request")
			return
		}
		err = s.pool.QueryRow(ctx, `
			INSERT INTO chat_sessions (user_id, title, staging_group_id) VALUES ($1, $2, $3) RETURNING id`, uid, title, gid).Scan(&id)
	} else {
		err = s.pool.QueryRow(ctx, `INSERT INTO chat_sessions (user_id, title) VALUES ($1, $2) RETURNING id`, uid, title).Scan(&id)
	}
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
	var sgid *uuid.UUID
	var gname *string
	var gds *string
	err := s.pool.QueryRow(ctx, `
		SELECT cs.title, cs.updated_at, g.id, g.name, g.draft_staging
		FROM chat_sessions cs
		LEFT JOIN session_staging_groups g ON g.id = cs.staging_group_id
		WHERE cs.id = $1`, sessionID).Scan(&title, &up, &sgid, &gname, &gds)
	if err != nil {
		return nil, err
	}
	tgt, err := s.resolveDraftTarget(ctx, sessionID)
	if err != nil {
		return nil, err
	}
	draftCount, err := s.countDrafts(ctx, tgt)
	if err != nil {
		return nil, err
	}
	msgs, err := s.sessionMessages(ctx, sessionID)
	if err != nil {
		return nil, err
	}
	drafts, err := s.sessionDraftsForTarget(ctx, tgt)
	if err != nil {
		return nil, err
	}
	m := map[string]any{
		"id": sessionID.String(), "title": title, "updatedAt": up.Format(time.RFC3339),
		"draftAssetCount": draftCount,
		"messages":        msgs, "draftAssets": drafts,
	}
	if sgid != nil && gname != nil && gds != nil {
		m["stagingGroup"] = map[string]any{
			"id": sgid.String(), "name": *gname, "draftStaging": *gds,
		}
	} else {
		m["stagingGroup"] = nil
	}
	return m, nil
}

func (s *Server) countDrafts(ctx context.Context, tgt draftTarget) (int, error) {
	var n int
	if tgt.useGroup {
		err := s.pool.QueryRow(ctx, `SELECT count(*)::int FROM draft_assets WHERE group_id = $1`, tgt.groupID).Scan(&n)
		return n, err
	}
	err := s.pool.QueryRow(ctx, `SELECT count(*)::int FROM draft_assets WHERE session_id = $1 AND group_id IS NULL`, tgt.sessionID).Scan(&n)
	return n, err
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
	if out == nil {
		return []any{}, nil
	}
	return out, nil
}

func (s *Server) sessionDraftsForTarget(ctx context.Context, tgt draftTarget) ([]any, error) {
	var q string
	var arg any
	if tgt.useGroup {
		q = `SELECT temp_id, name, description, done FROM draft_assets WHERE group_id = $1 ORDER BY id`
		arg = tgt.groupID
	} else {
		q = `SELECT temp_id, name, description, done FROM draft_assets WHERE session_id = $1 AND group_id IS NULL ORDER BY id`
		arg = tgt.sessionID
	}
	rows, err := s.pool.Query(ctx, q, arg)
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
	if out == nil {
		return []any{}, nil
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
	// Persist assistant line for history (UI also showed stream); drafts are user-driven via postSessionDraft.
	_, _ = s.pool.Exec(ctx, `INSERT INTO chat_messages (session_id, role, content) VALUES ($1, 'assistant', $2)`,
		sid, "[mock] 這條回覆由 Go MockChat 生成。若你已有清晰的素材名稱與說明，可在右側「暫存」手動填寫後加入，再一鍵導出到我的庫。")
	_, _ = s.pool.Exec(ctx, `UPDATE chat_sessions SET updated_at = now() WHERE id = $1`, sid)
}

type draftCreateBody struct {
	Name        string `json:"name"`
	Description string `json:"description"`
}

// postSessionDraft creates a user-authored staging entry (name + description required). Chat stream does not auto-stage.
func (s *Server) postSessionDraft(w http.ResponseWriter, r *http.Request) {
	uid, _ := userID(r.Context())
	sid, err := uuid.Parse(chi.URLParam(r, "sessionId"))
	if err != nil {
		writeErr(w, 400, "bad id", "bad_request")
		return
	}
	var b draftCreateBody
	if err := readJSON(r, &b); err != nil {
		writeErr(w, 400, "invalid json", "bad_request")
		return
	}
	name := strings.TrimSpace(b.Name)
	desc := strings.TrimSpace(b.Description)
	if name == "" || desc == "" {
		writeErr(w, 400, "name and description required", "bad_request")
		return
	}
	ctx := r.Context()
	if err := s.assertChatSessionOwner(ctx, sid, uid); err != nil {
		if errors.Is(err, errSessionNotFound) {
			writeErr(w, 404, "not found", "not_found")
		} else {
			writeErr(w, 500, err.Error(), "internal")
		}
		return
	}
	tgt, err := s.resolveDraftTarget(ctx, sid)
	if err != nil {
		writeErr(w, 500, err.Error(), "internal")
		return
	}
	tempID := "user-" + uuid.NewString()
	if tgt.useGroup {
		_, err = s.pool.Exec(ctx, `
			INSERT INTO draft_assets (group_id, temp_id, name, description, done) VALUES ($1, $2, $3, $4, true)
			ON CONFLICT (group_id, temp_id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, done = true`,
			tgt.groupID, tempID, name, desc)
	} else {
		_, err = s.pool.Exec(ctx, `
			INSERT INTO draft_assets (session_id, temp_id, name, description, done) VALUES ($1, $2, $3, $4, true)
			ON CONFLICT (session_id, temp_id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, done = true`,
			sid, tempID, name, desc)
	}
	if err != nil {
		writeErr(w, 500, err.Error(), "internal")
		return
	}
	s.touchSessionActivity(ctx, sid)
	writeJSON(w, 201, map[string]any{
		"tempId":      tempID,
		"name":        name,
		"description": desc,
		"done":        true,
	})
}

func (s *Server) assertChatSessionOwner(ctx context.Context, sid, uid uuid.UUID) error {
	var owner uuid.UUID
	err := s.pool.QueryRow(ctx, `SELECT user_id FROM chat_sessions WHERE id = $1`, sid).Scan(&owner)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return errSessionNotFound
		}
		return err
	}
	if owner != uid {
		return errSessionNotFound
	}
	return nil
}

var errSessionNotFound = errors.New("session not found")

func (s *Server) patchSessionDraft(w http.ResponseWriter, r *http.Request) {
	uid, _ := userID(r.Context())
	sid, err := uuid.Parse(chi.URLParam(r, "sessionId"))
	if err != nil {
		writeErr(w, 400, "bad id", "bad_request")
		return
	}
	tempID := chi.URLParam(r, "tempId")
	if tempID == "" {
		writeErr(w, 400, "bad temp id", "bad_request")
		return
	}
	var b draftCreateBody
	if err := readJSON(r, &b); err != nil {
		writeErr(w, 400, "invalid json", "bad_request")
		return
	}
	name := strings.TrimSpace(b.Name)
	desc := strings.TrimSpace(b.Description)
	if name == "" || desc == "" {
		writeErr(w, 400, "name and description required", "bad_request")
		return
	}
	ctx := r.Context()
	if err := s.assertChatSessionOwner(ctx, sid, uid); err != nil {
		if errors.Is(err, errSessionNotFound) {
			writeErr(w, 404, "not found", "not_found")
		} else {
			writeErr(w, 500, err.Error(), "internal")
		}
		return
	}
	tgt, err := s.resolveDraftTarget(ctx, sid)
	if err != nil {
		writeErr(w, 500, err.Error(), "internal")
		return
	}
	var rowCount int64
	if tgt.useGroup {
		ct, e := s.pool.Exec(ctx, `
			UPDATE draft_assets SET name = $1, description = $2
			WHERE group_id = $3 AND temp_id = $4`,
			name, desc, tgt.groupID, tempID)
		err = e
		if err == nil {
			rowCount = ct.RowsAffected()
		}
	} else {
		ct, e := s.pool.Exec(ctx, `
			UPDATE draft_assets SET name = $1, description = $2
			WHERE session_id = $3 AND group_id IS NULL AND temp_id = $4`,
			name, desc, sid, tempID)
		err = e
		if err == nil {
			rowCount = ct.RowsAffected()
		}
	}
	if err != nil {
		writeErr(w, 500, err.Error(), "internal")
		return
	}
	if rowCount == 0 {
		writeErr(w, 404, "not found", "not_found")
		return
	}
	s.touchSessionActivity(ctx, sid)
	writeJSON(w, 200, map[string]any{
		"tempId":      tempID,
		"name":        name,
		"description": desc,
		"done":        true,
	})
}

// exportSessionDraftToLibrary creates a private library asset from the staged row and removes that draft (single transaction).
func (s *Server) exportSessionDraftToLibrary(w http.ResponseWriter, r *http.Request) {
	uid, _ := userID(r.Context())
	sid, err := uuid.Parse(chi.URLParam(r, "sessionId"))
	if err != nil {
		writeErr(w, 400, "bad id", "bad_request")
		return
	}
	tempID := chi.URLParam(r, "tempId")
	if tempID == "" {
		writeErr(w, 400, "bad temp id", "bad_request")
		return
	}
	ctx := r.Context()
	if err := s.assertChatSessionOwner(ctx, sid, uid); err != nil {
		if errors.Is(err, errSessionNotFound) {
			writeErr(w, 404, "not found", "not_found")
		} else {
			writeErr(w, 500, err.Error(), "internal")
		}
		return
	}
	tgt, err := s.resolveDraftTarget(ctx, sid)
	if err != nil {
		writeErr(w, 500, err.Error(), "internal")
		return
	}
	var name, desc string
	if tgt.useGroup {
		err = s.pool.QueryRow(ctx, `
			SELECT name, description FROM draft_assets WHERE group_id = $1 AND temp_id = $2
		`, tgt.groupID, tempID).Scan(&name, &desc)
	} else {
		err = s.pool.QueryRow(ctx, `
			SELECT name, description FROM draft_assets
			WHERE session_id = $1 AND group_id IS NULL AND temp_id = $2
		`, sid, tempID).Scan(&name, &desc)
	}
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeErr(w, 404, "not found", "not_found")
		} else {
			writeErr(w, 500, err.Error(), "internal")
		}
		return
	}
	name = strings.TrimSpace(name)
	desc = strings.TrimSpace(desc)
	if name == "" || desc == "" {
		writeErr(w, 400, "draft name and description required", "bad_request")
		return
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		writeErr(w, 500, err.Error(), "internal")
		return
	}
	defer tx.Rollback(ctx)

	var assetID uuid.UUID
	err = tx.QueryRow(ctx, `
		INSERT INTO assets (author_id, name, description, annotation, visibility, forked_from_id, fork_count, cover_image_id, deleted_at, updated_at)
		VALUES ($1, $2, $3, null, 'private', null, 0, null, null, now())
		RETURNING id
	`, uid, name, desc).Scan(&assetID)
	if err != nil {
		writeErr(w, 500, err.Error(), "internal")
		return
	}
	var rowCount int64
	if tgt.useGroup {
		ct, e := tx.Exec(ctx, `DELETE FROM draft_assets WHERE group_id = $1 AND temp_id = $2`, tgt.groupID, tempID)
		err = e
		if err == nil {
			rowCount = ct.RowsAffected()
		}
	} else {
		ct, e := tx.Exec(ctx, `DELETE FROM draft_assets WHERE session_id = $1 AND group_id IS NULL AND temp_id = $2`, sid, tempID)
		err = e
		if err == nil {
			rowCount = ct.RowsAffected()
		}
	}
	if err != nil {
		writeErr(w, 500, err.Error(), "internal")
		return
	}
	if rowCount == 0 {
		writeErr(w, 500, "draft not removed", "internal")
		return
	}
	if err := tx.Commit(ctx); err != nil {
		writeErr(w, 500, err.Error(), "internal")
		return
	}
	s.touchSessionActivity(ctx, sid)
	m, err := s.getAssetByID(ctx, assetID)
	if err != nil {
		writeErr(w, 500, err.Error(), "internal")
		return
	}
	writeJSON(w, 201, m)
}

func (s *Server) deleteSessionDraft(w http.ResponseWriter, r *http.Request) {
	uid, _ := userID(r.Context())
	sid, err := uuid.Parse(chi.URLParam(r, "sessionId"))
	if err != nil {
		writeErr(w, 400, "bad id", "bad_request")
		return
	}
	tempID := chi.URLParam(r, "tempId")
	if tempID == "" {
		writeErr(w, 400, "bad temp id", "bad_request")
		return
	}
	ctx := r.Context()
	if err := s.assertChatSessionOwner(ctx, sid, uid); err != nil {
		if errors.Is(err, errSessionNotFound) {
			writeErr(w, 404, "not found", "not_found")
		} else {
			writeErr(w, 500, err.Error(), "internal")
		}
		return
	}
	tgt, err := s.resolveDraftTarget(ctx, sid)
	if err != nil {
		writeErr(w, 500, err.Error(), "internal")
		return
	}
	var rowCount int64
	if tgt.useGroup {
		ct, e := s.pool.Exec(ctx, `DELETE FROM draft_assets WHERE group_id = $1 AND temp_id = $2`, tgt.groupID, tempID)
		err = e
		if err == nil {
			rowCount = ct.RowsAffected()
		}
	} else {
		ct, e := s.pool.Exec(ctx, `DELETE FROM draft_assets WHERE session_id = $1 AND group_id IS NULL AND temp_id = $2`, sid, tempID)
		err = e
		if err == nil {
			rowCount = ct.RowsAffected()
		}
	}
	if err != nil {
		writeErr(w, 500, err.Error(), "internal")
		return
	}
	if rowCount == 0 {
		writeErr(w, 404, "not found", "not_found")
		return
	}
	s.touchSessionActivity(ctx, sid)
	w.WriteHeader(204)
}

func (s *Server) touchSessionActivity(ctx context.Context, sessionID uuid.UUID) {
	_, _ = s.pool.Exec(ctx, `
		WITH s AS (SELECT id, staging_group_id FROM chat_sessions WHERE id = $1)
		UPDATE chat_sessions cs SET updated_at = now()
		FROM s
		WHERE cs.id = s.id
		   OR (s.staging_group_id IS NOT NULL AND cs.staging_group_id = s.staging_group_id)
	`, sessionID)
}

type patchChatSessionBody struct {
	Title            *string         `json:"title"`
	StagingGroupID   json.RawMessage `json:"stagingGroupId"`
}

func (s *Server) patchChatSession(w http.ResponseWriter, r *http.Request) {
	uid, _ := userID(r.Context())
	sid, err := uuid.Parse(chi.URLParam(r, "sessionId"))
	if err != nil {
		writeErr(w, 400, "bad id", "bad_request")
		return
	}
	var b patchChatSessionBody
	if err := readJSONRelaxed(r, &b); err != nil {
		writeErr(w, 400, "invalid json", "bad_request")
		return
	}
	ctx := r.Context()
	if err := s.assertChatSessionOwner(ctx, sid, uid); err != nil {
		if errors.Is(err, errSessionNotFound) {
			writeErr(w, 404, "not found", "not_found")
		} else {
			writeErr(w, 500, err.Error(), "internal")
		}
		return
	}
	if b.Title != nil {
		t := strings.TrimSpace(*b.Title)
		if t != "" {
			_, _ = s.pool.Exec(ctx, `UPDATE chat_sessions SET title = $1, updated_at = now() WHERE id = $2`, t, sid)
		}
	}
	if len(b.StagingGroupID) > 0 {
		raw := strings.TrimSpace(string(b.StagingGroupID))
		if raw == "null" || raw == `""` {
			_, err := s.pool.Exec(ctx, `UPDATE chat_sessions SET staging_group_id = NULL, updated_at = now() WHERE id = $1`, sid)
			if err != nil {
				writeErr(w, 500, err.Error(), "internal")
				return
			}
		} else {
			var gidStr string
			if err := json.Unmarshal(b.StagingGroupID, &gidStr); err != nil {
				writeErr(w, 400, "bad stagingGroupId", "bad_request")
				return
			}
			gid, err := uuid.Parse(strings.TrimSpace(gidStr))
			if err != nil {
				writeErr(w, 400, "bad stagingGroupId", "bad_request")
				return
			}
			var owner uuid.UUID
			err = s.pool.QueryRow(ctx, `SELECT user_id FROM session_staging_groups WHERE id = $1`, gid).Scan(&owner)
			if err != nil {
				if errors.Is(err, pgx.ErrNoRows) {
					writeErr(w, 400, "staging group not found", "bad_request")
				} else {
					writeErr(w, 500, err.Error(), "internal")
				}
				return
			}
			if owner != uid {
				writeErr(w, 400, "staging group not found", "bad_request")
				return
			}
			_, err = s.pool.Exec(ctx, `UPDATE chat_sessions SET staging_group_id = $1, updated_at = now() WHERE id = $2`, gid, sid)
			if err != nil {
				writeErr(w, 500, err.Error(), "internal")
				return
			}
		}
	}
	m, err := s.getSessionDetail(ctx, sid)
	if err != nil {
		writeErr(w, 500, err.Error(), "internal")
		return
	}
	writeJSON(w, 200, m)
}
