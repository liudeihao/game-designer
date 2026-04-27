package api

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

func (s *Server) listProjects(w http.ResponseWriter, r *http.Request) {
	uid, _ := userID(r.Context())
	ctx := r.Context()
	rows, err := s.pool.Query(ctx, `SELECT id, name, updated_at FROM projects WHERE user_id = $1 ORDER BY updated_at DESC`, uid)
	if err != nil {
		writeErr(w, 500, err.Error(), "internal")
		return
	}
	defer rows.Close()
	var out []any
	for rows.Next() {
		var id uuid.UUID
		var name string
		var up time.Time
		if err := rows.Scan(&id, &name, &up); err != nil {
			writeErr(w, 500, err.Error(), "internal")
			return
		}
		out = append(out, map[string]any{
			"id": id.String(), "name": name, "updatedAt": up.Format(time.RFC3339),
		})
	}
	writeJSON(w, 200, out)
}

type createProjectBody struct {
	Name string `json:"name"`
}

func (s *Server) createProject(w http.ResponseWriter, r *http.Request) {
	uid, _ := userID(r.Context())
	var b createProjectBody
	if err := readJSON(r, &b); err != nil || b.Name == "" {
		writeErr(w, 400, "name required", "bad_request")
		return
	}
	ctx := r.Context()
	var id uuid.UUID
	defaultDoc := json.RawMessage(`{"type":"tldraw","version":1,"shapeIds":[]}`)
	err := s.pool.QueryRow(ctx, `INSERT INTO projects (user_id, name, canvas_document) VALUES ($1, $2, $3) RETURNING id`, uid, b.Name, defaultDoc).Scan(&id)
	if err != nil {
		writeErr(w, 500, err.Error(), "internal")
		return
	}
	m, err := s.getProjectDetail(ctx, id)
	if err != nil {
		writeErr(w, 500, err.Error(), "internal")
		return
	}
	writeJSON(w, 201, m)
}

func (s *Server) getProject(w http.ResponseWriter, r *http.Request) {
	uid, _ := userID(r.Context())
	pid, err := uuid.Parse(chi.URLParam(r, "projectId"))
	if err != nil {
		writeErr(w, 400, "bad id", "bad_request")
		return
	}
	ctx := r.Context()
	var owner uuid.UUID
	err = s.pool.QueryRow(ctx, `SELECT user_id FROM projects WHERE id = $1`, pid).Scan(&owner)
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
	m, err := s.getProjectDetail(ctx, pid)
	if err != nil {
		writeErr(w, 500, err.Error(), "internal")
		return
	}
	writeJSON(w, 200, m)
}

func (s *Server) getProjectDetail(ctx context.Context, id uuid.UUID) (map[string]any, error) {
	var name string
	var up time.Time
	var doc []byte
	err := s.pool.QueryRow(ctx, `SELECT name, updated_at, canvas_document FROM projects WHERE id = $1`, id).Scan(&name, &up, &doc)
	if err != nil {
		return nil, err
	}
	var canvas any
	if len(doc) > 0 {
		_ = json.Unmarshal(doc, &canvas)
	}
	if canvas == nil {
		canvas = map[string]any{"type": "tldraw", "version": 1, "shapeIds": []any{}}
	}
	return map[string]any{
		"id": id.String(), "name": name, "updatedAt": up.Format(time.RFC3339),
		"canvasDocument": canvas,
	}, nil
}

func (s *Server) patchProject(w http.ResponseWriter, r *http.Request) {
	uid, _ := userID(r.Context())
	pid, err := uuid.Parse(chi.URLParam(r, "projectId"))
	if err != nil {
		writeErr(w, 400, "bad id", "bad_request")
		return
	}
	var b struct {
		Name           *string         `json:"name"`
		CanvasDocument json.RawMessage `json:"canvasDocument"`
	}
	if err := readJSONRelaxed(r, &b); err != nil {
		writeErr(w, 400, "bad json", "bad_request")
		return
	}
	ctx := r.Context()
	var owner uuid.UUID
	err = s.pool.QueryRow(ctx, `SELECT user_id FROM projects WHERE id = $1`, pid).Scan(&owner)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeErr(w, 404, "not found", "not_found")
			return
		}
		writeErr(w, 500, err.Error(), "internal")
		return
	}
	if owner != uid {
		writeErr(w, 403, "forbidden", "forbidden")
		return
	}
	if b.Name != nil {
		_, _ = s.pool.Exec(ctx, `UPDATE projects SET name = $1, updated_at = now() WHERE id = $2`, *b.Name, pid)
	}
	if len(b.CanvasDocument) > 0 {
		_, _ = s.pool.Exec(ctx, `UPDATE projects SET canvas_document = $1, updated_at = now() WHERE id = $2`, b.CanvasDocument, pid)
	}
	m, err := s.getProjectDetail(ctx, pid)
	if err != nil {
		writeErr(w, 500, err.Error(), "internal")
		return
	}
	writeJSON(w, 200, m)
}
