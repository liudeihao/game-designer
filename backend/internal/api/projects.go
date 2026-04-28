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
	"github.com/jackc/pgx/v5/pgxpool"
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
	defaultDoc := json.RawMessage(`{"type":"tldraw","version":1,"shapeIds":[]}`)
	var id uuid.UUID
	err := withTx(ctx, s.pool, func(tx pgx.Tx) error {
		if err := tx.QueryRow(ctx, `
			INSERT INTO projects (user_id, name, canvas_document) VALUES ($1, $2, $3) RETURNING id`,
			uid, b.Name, defaultDoc,
		).Scan(&id); err != nil {
			return err
		}
		_, err := tx.Exec(ctx, `
			INSERT INTO chat_sessions (user_id, title, project_id) VALUES ($1, '设计 1', $2)`,
			uid, id)
		return err
	})
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

func withTx(ctx context.Context, pool *pgxpool.Pool, fn func(pgx.Tx) error) error {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if err := fn(tx); err != nil {
		return err
	}
	return tx.Commit(ctx)
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
	var designDoc string
	err := s.pool.QueryRow(ctx, `
		SELECT name, updated_at, canvas_document, COALESCE(design_document, '') FROM projects WHERE id = $1`,
		id).Scan(&name, &up, &doc, &designDoc)
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
	linked, err := s.projectLinkedAssets(ctx, id)
	if err != nil {
		return nil, err
	}
	return map[string]any{
		"id": id.String(), "name": name, "updatedAt": up.Format(time.RFC3339),
		"canvasDocument": canvas, "linkedAssets": linked,
		"designDocument": designDoc,
	}, nil
}

func (s *Server) projectLinkedAssets(ctx context.Context, projectID uuid.UUID) ([]any, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT a.id, a.name, a.description, a.cover_image_id::text,
		       (SELECT url FROM asset_images WHERE id = a.cover_image_id LIMIT 1)
		FROM project_assets pa
		JOIN assets a ON a.id = pa.asset_id
		WHERE pa.project_id = $1 AND a.deleted_at IS NULL AND a.visibility = 'private'
		ORDER BY pa.created_at ASC
	`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []any
	for rows.Next() {
		var aid uuid.UUID
		var aname, adesc string
		var coverID *string
		var coverURL *string
		if err := rows.Scan(&aid, &aname, &adesc, &coverID, &coverURL); err != nil {
			return nil, err
		}
		row := map[string]any{
			"id": aid.String(), "name": aname, "description": adesc,
		}
		if coverID != nil {
			row["coverImageId"] = *coverID
		} else {
			row["coverImageId"] = nil
		}
		if coverURL != nil {
			row["coverImageUrl"] = *coverURL
		} else {
			row["coverImageUrl"] = nil
		}
		out = append(out, row)
	}
	if out == nil {
		out = []any{}
	}
	return out, nil
}

func (s *Server) assertProjectOwner(ctx context.Context, pid, uid uuid.UUID) error {
	var owner uuid.UUID
	err := s.pool.QueryRow(ctx, `SELECT user_id FROM projects WHERE id = $1`, pid).Scan(&owner)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return errProjectNotFound
		}
		return err
	}
	if owner != uid {
		return errProjectNotFound
	}
	return nil
}

var errProjectNotFound = errors.New("project not found")

func (s *Server) listProjectSessions(w http.ResponseWriter, r *http.Request) {
	uid, _ := userID(r.Context())
	pid, err := uuid.Parse(chi.URLParam(r, "projectId"))
	if err != nil {
		writeErr(w, 400, "bad id", "bad_request")
		return
	}
	ctx := r.Context()
	if err := s.assertProjectOwner(ctx, pid, uid); err != nil {
		if errors.Is(err, errProjectNotFound) {
			writeErr(w, 404, "not found", "not_found")
		} else {
			writeErr(w, 500, err.Error(), "internal")
		}
		return
	}
	rows, err := s.pool.Query(ctx, `
		SELECT id, title, updated_at FROM chat_sessions
		WHERE project_id = $1 AND user_id = $2
		ORDER BY updated_at DESC
	`, pid, uid)
	if err != nil {
		writeErr(w, 500, err.Error(), "internal")
		return
	}
	defer rows.Close()
	var out []any
	for rows.Next() {
		var sid uuid.UUID
		var title string
		var up time.Time
		if err := rows.Scan(&sid, &title, &up); err != nil {
			writeErr(w, 500, err.Error(), "internal")
			return
		}
		out = append(out, map[string]any{
			"id": sid.String(), "title": title, "updatedAt": up.Format(time.RFC3339),
		})
	}
	if out == nil {
		out = []any{}
	}
	writeJSON(w, 200, out)
}

type createProjectSessionBody struct {
	Title string `json:"title"`
}

func (s *Server) createProjectSession(w http.ResponseWriter, r *http.Request) {
	uid, _ := userID(r.Context())
	pid, err := uuid.Parse(chi.URLParam(r, "projectId"))
	if err != nil {
		writeErr(w, 400, "bad id", "bad_request")
		return
	}
	var b createProjectSessionBody
	_ = readJSON(r, &b)
	title := strings.TrimSpace(b.Title)
	if title == "" {
		title = "新设计会话"
	}
	ctx := r.Context()
	if err := s.assertProjectOwner(ctx, pid, uid); err != nil {
		if errors.Is(err, errProjectNotFound) {
			writeErr(w, 404, "not found", "not_found")
		} else {
			writeErr(w, 500, err.Error(), "internal")
		}
		return
	}
	var sid uuid.UUID
	err = s.pool.QueryRow(ctx, `
		INSERT INTO chat_sessions (user_id, title, project_id) VALUES ($1, $2, $3) RETURNING id`,
		uid, title, pid,
	).Scan(&sid)
	if err != nil {
		writeErr(w, 500, err.Error(), "internal")
		return
	}
	m, err := s.getSessionDetail(ctx, sid)
	if err != nil {
		writeErr(w, 500, err.Error(), "internal")
		return
	}
	writeJSON(w, 201, m)
}

type linkProjectAssetBody struct {
	AssetID string `json:"assetId"`
}

func (s *Server) postProjectAsset(w http.ResponseWriter, r *http.Request) {
	uid, _ := userID(r.Context())
	pid, err := uuid.Parse(chi.URLParam(r, "projectId"))
	if err != nil {
		writeErr(w, 400, "bad id", "bad_request")
		return
	}
	var b linkProjectAssetBody
	if err := readJSON(r, &b); err != nil || strings.TrimSpace(b.AssetID) == "" {
		writeErr(w, 400, "assetId required", "bad_request")
		return
	}
	aid, err := uuid.Parse(strings.TrimSpace(b.AssetID))
	if err != nil {
		writeErr(w, 400, "bad assetId", "bad_request")
		return
	}
	ctx := r.Context()
	if err := s.assertProjectOwner(ctx, pid, uid); err != nil {
		if errors.Is(err, errProjectNotFound) {
			writeErr(w, 404, "not found", "not_found")
		} else {
			writeErr(w, 500, err.Error(), "internal")
		}
		return
	}
	var author uuid.UUID
	var vis string
	var del *time.Time
	err = s.pool.QueryRow(ctx, `
		SELECT author_id, visibility, deleted_at FROM assets WHERE id = $1`, aid,
	).Scan(&author, &vis, &del)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeErr(w, 404, "asset not found", "not_found")
		} else {
			writeErr(w, 500, err.Error(), "internal")
		}
		return
	}
	if author != uid || vis != "private" || del != nil {
		writeErr(w, 400, "only private library assets can be linked", "bad_request")
		return
	}
	_, err = s.pool.Exec(ctx, `
		INSERT INTO project_assets (project_id, asset_id) VALUES ($1, $2)
		ON CONFLICT (project_id, asset_id) DO NOTHING`,
		pid, aid)
	if err != nil {
		writeErr(w, 500, err.Error(), "internal")
		return
	}
	m, err := s.getProjectDetail(ctx, pid)
	if err != nil {
		writeErr(w, 500, err.Error(), "internal")
		return
	}
	writeJSON(w, 200, m)
}

func (s *Server) deleteProjectAsset(w http.ResponseWriter, r *http.Request) {
	uid, _ := userID(r.Context())
	pid, err := uuid.Parse(chi.URLParam(r, "projectId"))
	if err != nil {
		writeErr(w, 400, "bad id", "bad_request")
		return
	}
	aid, err := uuid.Parse(chi.URLParam(r, "assetId"))
	if err != nil {
		writeErr(w, 400, "bad asset id", "bad_request")
		return
	}
	ctx := r.Context()
	if err := s.assertProjectOwner(ctx, pid, uid); err != nil {
		if errors.Is(err, errProjectNotFound) {
			writeErr(w, 404, "not found", "not_found")
		} else {
			writeErr(w, 500, err.Error(), "internal")
		}
		return
	}
	ct, err := s.pool.Exec(ctx, `DELETE FROM project_assets WHERE project_id = $1 AND asset_id = $2`, pid, aid)
	if err != nil {
		writeErr(w, 500, err.Error(), "internal")
		return
	}
	if ct.RowsAffected() == 0 {
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

func (s *Server) patchProject(w http.ResponseWriter, r *http.Request) {
	uid, _ := userID(r.Context())
	pid, err := uuid.Parse(chi.URLParam(r, "projectId"))
	if err != nil {
		writeErr(w, 400, "bad id", "bad_request")
		return
	}
	var b struct {
		Name            *string         `json:"name"`
		CanvasDocument  json.RawMessage `json:"canvasDocument"`
		DesignDocument  *string         `json:"designDocument"`
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
	if b.DesignDocument != nil {
		_, _ = s.pool.Exec(ctx, `UPDATE projects SET design_document = $1, updated_at = now() WHERE id = $2`, *b.DesignDocument, pid)
	}
	m, err := s.getProjectDetail(ctx, pid)
	if err != nil {
		writeErr(w, 500, err.Error(), "internal")
		return
	}
	writeJSON(w, 200, m)
}
