package api

import (
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

type assetGroupCreate struct {
	Name string `json:"name"`
}

func (s *Server) listAssetGroups(w http.ResponseWriter, r *http.Request) {
	uid, err := s.sessionUserID(r)
	if err != nil || uid == uuid.Nil {
		writeErr(w, http.StatusUnauthorized, "not logged in", "unauthorized")
		return
	}
	ctx := r.Context()
	rows, err := s.pool.Query(ctx, `
		SELECT id, name, position, created_at FROM asset_groups
		WHERE user_id = $1
		ORDER BY position ASC, created_at ASC
	`, uid)
	if err != nil {
		writeErr(w, 500, err.Error(), "internal")
		return
	}
	defer rows.Close()
	var items []any
	for rows.Next() {
		var id uuid.UUID
		var name string
		var pos int
		var created time.Time
		if e := rows.Scan(&id, &name, &pos, &created); e != nil {
			writeErr(w, 500, e.Error(), "internal")
			return
		}
		items = append(items, map[string]any{
			"id": id.String(), "name": name, "position": pos,
			"createdAt": created.Format(time.RFC3339),
		})
	}
	if items == nil {
		items = []any{}
	}
	writeJSON(w, 200, map[string]any{"items": items})
}

func (s *Server) createAssetGroup(w http.ResponseWriter, r *http.Request) {
	uid, err := s.sessionUserID(r)
	if err != nil || uid == uuid.Nil {
		writeErr(w, http.StatusUnauthorized, "not logged in", "unauthorized")
		return
	}
	var b assetGroupCreate
	if e := readJSON(r, &b); e != nil {
		writeErr(w, 400, "invalid json", "bad_request")
		return
	}
	name := strings.TrimSpace(b.Name)
	if name == "" || len(name) > 120 {
		writeErr(w, 400, "name required (max 120)", "bad_request")
		return
	}
	ctx := r.Context()
	var maxPos int
	_ = s.pool.QueryRow(ctx, `SELECT coalesce(max(position), -1) + 1 FROM asset_groups WHERE user_id = $1`, uid).Scan(&maxPos)
	var id uuid.UUID
	err = s.pool.QueryRow(ctx, `
		INSERT INTO asset_groups (user_id, name, position) VALUES ($1, $2, $3) RETURNING id
	`, uid, name, maxPos).Scan(&id)
	if err != nil {
		writeErr(w, 500, err.Error(), "internal")
		return
	}
	writeJSON(w, 201, map[string]any{
		"id": id.String(), "name": name, "position": maxPos,
	})
}

func (s *Server) deleteAssetGroup(w http.ResponseWriter, r *http.Request) {
	uid, err := s.sessionUserID(r)
	if err != nil || uid == uuid.Nil {
		writeErr(w, http.StatusUnauthorized, "not logged in", "unauthorized")
		return
	}
	gid, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeErr(w, 400, "bad id", "bad_request")
		return
	}
	ctx := r.Context()
	res, err := s.pool.Exec(ctx, `DELETE FROM asset_groups WHERE id = $1 AND user_id = $2`, gid, uid)
	if err != nil {
		writeErr(w, 500, err.Error(), "internal")
		return
	}
	if res.RowsAffected() == 0 {
		writeErr(w, 404, "not found", "not_found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
