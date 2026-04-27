package api

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type sessionStagingGroupCreate struct {
	Name          string `json:"name"`
	DraftStaging  string `json:"draftStaging"` // "independent" | "shared"
}

type sessionStagingGroupPatch struct {
	Name         *string `json:"name"`
	DraftStaging *string `json:"draftStaging"`
}

func (s *Server) listSessionStagingGroups(w http.ResponseWriter, r *http.Request) {
	uid, _ := userID(r.Context())
	ctx := r.Context()
	rows, err := s.pool.Query(ctx, `
		SELECT id, name, position, draft_staging, created_at
		FROM session_staging_groups
		WHERE user_id = $1
		ORDER BY position ASC, created_at ASC
	`, uid)
	if err != nil {
		writeErr(w, 500, err.Error(), "internal")
		return
	}
	defer rows.Close()
	var out []any
	for rows.Next() {
		var id uuid.UUID
		var name, ds string
		var pos int
		var created time.Time
		if e := rows.Scan(&id, &name, &pos, &ds, &created); e != nil {
			writeErr(w, 500, e.Error(), "internal")
			return
		}
		out = append(out, map[string]any{
			"id": id.String(), "name": name, "position": pos,
			"draftStaging": ds, "createdAt": created.Format(time.RFC3339),
		})
	}
	if out == nil {
		out = []any{}
	}
	writeJSON(w, 200, out)
}

// listSessionStagingGroupDrafts returns all staging rows for a group: shared pool on group_id,
// or union of per-session rows for independent mode (each item includes owner session id/title).
func (s *Server) listSessionStagingGroupDrafts(w http.ResponseWriter, r *http.Request) {
	uid, _ := userID(r.Context())
	gid, err := uuid.Parse(chi.URLParam(r, "groupId"))
	if err != nil {
		writeErr(w, 400, "bad id", "bad_request")
		return
	}
	ctx := r.Context()
	var ds string
	err = s.pool.QueryRow(ctx, `
		SELECT draft_staging FROM session_staging_groups WHERE id = $1 AND user_id = $2
	`, gid, uid).Scan(&ds)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeErr(w, 404, "not found", "not_found")
		} else {
			writeErr(w, 500, err.Error(), "internal")
		}
		return
	}
	var out []any
	if ds == "shared" {
		rows, err := s.pool.Query(ctx, `
			SELECT temp_id, name, description, done FROM draft_assets WHERE group_id = $1 ORDER BY id
		`, gid)
		if err != nil {
			writeErr(w, 500, err.Error(), "internal")
			return
		}
		defer rows.Close()
		for rows.Next() {
			var tempID, name, desc string
			var done bool
			if err := rows.Scan(&tempID, &name, &desc, &done); err != nil {
				writeErr(w, 500, err.Error(), "internal")
				return
			}
			out = append(out, map[string]any{
				"tempId": tempID, "name": name, "description": desc, "done": done,
			})
		}
	} else {
		rows, err := s.pool.Query(ctx, `
			SELECT d.temp_id, d.name, d.description, d.done, cs.id, cs.title
			FROM draft_assets d
			INNER JOIN chat_sessions cs ON cs.id = d.session_id
			WHERE cs.staging_group_id = $1 AND cs.user_id = $2 AND d.group_id IS NULL
			ORDER BY cs.updated_at DESC, d.id
		`, gid, uid)
		if err != nil {
			writeErr(w, 500, err.Error(), "internal")
			return
		}
		defer rows.Close()
		for rows.Next() {
			var tempID, name, desc string
			var done bool
			var sid uuid.UUID
			var title string
			if err := rows.Scan(&tempID, &name, &desc, &done, &sid, &title); err != nil {
				writeErr(w, 500, err.Error(), "internal")
				return
			}
			out = append(out, map[string]any{
				"tempId":            tempID,
				"name":              name,
				"description":       desc,
				"done":              done,
				"ownerSessionId":    sid.String(),
				"ownerSessionTitle": title,
			})
		}
	}
	if out == nil {
		out = []any{}
	}
	writeJSON(w, 200, out)
}

func (s *Server) createSessionStagingGroup(w http.ResponseWriter, r *http.Request) {
	uid, _ := userID(r.Context())
	var b sessionStagingGroupCreate
	if e := readJSON(r, &b); e != nil {
		writeErr(w, 400, "invalid json", "bad_request")
		return
	}
	name := strings.TrimSpace(b.Name)
	if name == "" || len(name) > 120 {
		writeErr(w, 400, "name required (max 120)", "bad_request")
		return
	}
	ds := strings.TrimSpace(b.DraftStaging)
	if ds == "" {
		ds = "independent"
	}
	if ds != "independent" && ds != "shared" {
		writeErr(w, 400, "draftStaging must be independent or shared", "bad_request")
		return
	}
	ctx := r.Context()
	var maxPos int
	_ = s.pool.QueryRow(ctx, `SELECT coalesce(max(position), -1) + 1 FROM session_staging_groups WHERE user_id = $1`, uid).Scan(&maxPos)
	var id uuid.UUID
	err := s.pool.QueryRow(ctx, `
		INSERT INTO session_staging_groups (user_id, name, position, draft_staging) VALUES ($1, $2, $3, $4) RETURNING id
	`, uid, name, maxPos, ds).Scan(&id)
	if err != nil {
		writeErr(w, 500, err.Error(), "internal")
		return
	}
	writeJSON(w, 201, map[string]any{
		"id": id.String(), "name": name, "position": maxPos, "draftStaging": ds,
		"createdAt": time.Now().UTC().Format(time.RFC3339),
	})
}

func (s *Server) patchSessionStagingGroup(w http.ResponseWriter, r *http.Request) {
	uid, _ := userID(r.Context())
	gid, err := uuid.Parse(chi.URLParam(r, "groupId"))
	if err != nil {
		writeErr(w, 400, "bad id", "bad_request")
		return
	}
	var b sessionStagingGroupPatch
	if e := readJSON(r, &b); e != nil {
		writeErr(w, 400, "invalid json", "bad_request")
		return
	}
	ctx := r.Context()
	var owner uuid.UUID
	err = s.pool.QueryRow(ctx, `SELECT user_id FROM session_staging_groups WHERE id = $1`, gid).Scan(&owner)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeErr(w, 404, "not found", "not_found")
		} else {
			writeErr(w, 500, err.Error(), "internal")
		}
		return
	}
	if owner != uid {
		writeErr(w, 404, "not found", "not_found")
		return
	}
	if b.Name != nil {
		n := strings.TrimSpace(*b.Name)
		if n == "" || len(n) > 120 {
			writeErr(w, 400, "name invalid", "bad_request")
			return
		}
		_, _ = s.pool.Exec(ctx, `UPDATE session_staging_groups SET name = $1 WHERE id = $2`, n, gid)
	}
	if b.DraftStaging != nil {
		ds := strings.TrimSpace(*b.DraftStaging)
		if ds != "independent" && ds != "shared" {
			writeErr(w, 400, "draftStaging must be independent or shared", "bad_request")
			return
		}
		var cur string
		_ = s.pool.QueryRow(ctx, `SELECT draft_staging FROM session_staging_groups WHERE id = $1`, gid).Scan(&cur)
		if cur != ds {
			if err := s.assertSessionGroupDraftStagingChange(ctx, gid, cur, ds); err != nil {
				writeErr(w, 400, err.Error(), "bad_request")
				return
			}
			_, _ = s.pool.Exec(ctx, `UPDATE session_staging_groups SET draft_staging = $1 WHERE id = $2`, ds, gid)
		}
	}
	var name string
	var pos int
	var ds string
	var created time.Time
	err = s.pool.QueryRow(ctx, `SELECT name, position, draft_staging, created_at FROM session_staging_groups WHERE id = $1`, gid).Scan(&name, &pos, &ds, &created)
	if err != nil {
		writeErr(w, 500, err.Error(), "internal")
		return
	}
	writeJSON(w, 200, map[string]any{
		"id": gid.String(), "name": name, "position": pos, "draftStaging": ds,
		"createdAt": created.Format(time.RFC3339),
	})
}

// assertSessionGroupDraftStagingChange blocks unsafe toggles when drafts would be orphaned or collide.
func (s *Server) assertSessionGroupDraftStagingChange(ctx context.Context, groupID uuid.UUID, from, to string) error {
	if from == to {
		return nil
	}
	var nSess, nGroup int
	_ = s.pool.QueryRow(ctx, `
		SELECT coalesce((
			SELECT count(*)::int FROM draft_assets d
			JOIN chat_sessions cs ON cs.id = d.session_id
			WHERE cs.staging_group_id = $1 AND d.group_id IS NULL
		), 0)`, groupID).Scan(&nSess)
	_ = s.pool.QueryRow(ctx, `SELECT count(*)::int FROM draft_assets WHERE group_id = $1`, groupID).Scan(&nGroup)
	if to == "shared" {
		if nGroup > 0 {
			return errors.New("clear group-level drafts before switching to shared (invalid state)")
		}
		if nSess > 0 {
			return errors.New("remove or export per-session drafts in this group before enabling group-shared staging")
		}
	} else { // to independent
		if nSess > 0 {
			return errors.New("clear per-session drafts before switching away from independent (invalid state)")
		}
		if nGroup > 0 {
			return errors.New("remove or export group-shared drafts before switching to per-session staging")
		}
	}
	return nil
}

func (s *Server) deleteSessionStagingGroup(w http.ResponseWriter, r *http.Request) {
	uid, _ := userID(r.Context())
	gid, err := uuid.Parse(chi.URLParam(r, "groupId"))
	if err != nil {
		writeErr(w, 400, "bad id", "bad_request")
		return
	}
	ctx := r.Context()
	var owner uuid.UUID
	err = s.pool.QueryRow(ctx, `SELECT user_id FROM session_staging_groups WHERE id = $1`, gid).Scan(&owner)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeErr(w, 404, "not found", "not_found")
		} else {
			writeErr(w, 500, err.Error(), "internal")
		}
		return
	}
	if owner != uid {
		writeErr(w, 404, "not found", "not_found")
		return
	}
	_, err = s.pool.Exec(ctx, `DELETE FROM session_staging_groups WHERE id = $1 AND user_id = $2`, gid, uid)
	if err != nil {
		writeErr(w, 500, err.Error(), "internal")
		return
	}
	w.WriteHeader(204)
}
