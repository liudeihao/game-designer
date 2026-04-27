package api

import (
	"context"
	"database/sql"
	"errors"
	"net/http"
	"strconv"
	"time"

	"game-designer/backend/internal/ai"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type assetRowData struct {
	id, authorID     uuid.UUID
	name, desc, vis  string
	ann              sql.NullString
	forkedFrom       sql.NullString
	forkCount        int
	coverID          sql.NullString
	groupID          sql.NullString
	deletedAt        sql.NullTime
	createdAt, upAt  time.Time
}

func (s *Server) scanAssetIter(ctx context.Context, rows pgx.Rows) (map[string]any, error) {
	var a assetRowData
	if err := rows.Scan(
		&a.id, &a.authorID, &a.name, &a.desc, &a.ann, &a.vis, &a.forkedFrom, &a.forkCount,
		&a.coverID, &a.groupID, &a.deletedAt, &a.createdAt, &a.upAt,
	); err != nil {
		return nil, err
	}
	return s.assetDataToMap(ctx, a)
}

func (s *Server) scanAssetOne(ctx context.Context, row pgx.Row) (map[string]any, error) {
	var a assetRowData
	if err := row.Scan(
		&a.id, &a.authorID, &a.name, &a.desc, &a.ann, &a.vis, &a.forkedFrom, &a.forkCount,
		&a.coverID, &a.groupID, &a.deletedAt, &a.createdAt, &a.upAt,
	); err != nil {
		return nil, err
	}
	return s.assetDataToMap(ctx, a)
}

func (s *Server) assetDataToMap(ctx context.Context, a assetRowData) (map[string]any, error) {
	if a.vis == "deleted" {
		return ghostJSON(a.id, a.forkedFrom, a.deletedAt)
	}
	imgs, err := s.loadAssetImages(ctx, a.id)
	if err != nil {
		return nil, err
	}
	annV := any(nil)
	if a.ann.Valid {
		annV = a.ann.String
	}
	forkV := any(nil)
	if a.forkedFrom.Valid {
		forkV = a.forkedFrom.String
	}
	cov := any(nil)
	if a.coverID.Valid {
		cov = a.coverID.String
	}
	gp := any(nil)
	if a.groupID.Valid {
		gp = a.groupID.String
	}
	return map[string]any{
		"id": a.id.String(), "name": a.name, "description": a.desc, "annotation": annV,
		"authorId": a.authorID.String(), "createdAt": a.createdAt.Format(time.RFC3339),
		"updatedAt": a.upAt.Format(time.RFC3339), "visibility": a.vis, "forkedFromId": forkV,
		"forkCount": a.forkCount, "images": imgs, "coverImageId": cov, "groupId": gp, "deletedAt": nil,
	}, nil
}

func ghostJSON(id uuid.UUID, forkedFrom sql.NullString, deletedAt sql.NullTime) (map[string]any, error) {
	fk := any(nil)
	if forkedFrom.Valid {
		fk = forkedFrom.String
	}
	dt := any(nil)
	if deletedAt.Valid {
		dt = deletedAt.Time.Format(time.RFC3339)
	}
	return map[string]any{
		"id": id.String(), "visibility": "deleted", "forkedFromId": fk, "deletedAt": dt,
	}, nil
}

func (s *Server) loadAssetImages(ctx context.Context, assetID uuid.UUID) ([]any, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, url, extra_prompt, created_at, generation_status
		FROM asset_images WHERE asset_id = $1 ORDER BY created_at
	`, assetID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []any
	for rows.Next() {
		var id uuid.UUID
		var url, gen string
		var extra sql.NullString
		var created time.Time
		if err := rows.Scan(&id, &url, &extra, &created, &gen); err != nil {
			return nil, err
		}
		ep := any(nil)
		if extra.Valid {
			ep = extra.String
		}
		out = append(out, map[string]any{
			"id": id.String(), "assetId": assetID.String(), "url": url, "extraPrompt": ep,
			"createdAt": created.Format(time.RFC3339), "generationStatus": gen,
		})
	}
	// nil slice would JSON-encode as null; clients expect an array (images are optional, not absent).
	if out == nil {
		out = []any{}
	}
	return out, nil
}

func (s *Server) listAssets(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	scope := q.Get("scope")
	if scope != "public" && scope != "private" {
		writeErr(w, 400, "scope required: public|private", "bad_request")
		return
	}
	limit, _ := strconv.Atoi(q.Get("limit"))
	if limit < 1 {
		limit = 24
	}
	if limit > 48 {
		limit = 48
	}
	var cursor *uuid.UUID
	if c := q.Get("cursor"); c != "" {
		if id, err := uuid.Parse(c); err == nil {
			cursor = &id
		}
	}
	ctx := r.Context()
	var uid uuid.UUID
	if scope == "private" {
		u, err := s.sessionUserID(r)
		if err != nil || u == uuid.Nil {
			writeErr(w, 401, "not logged in", "unauthorized")
			return
		}
		uid = u
	}
	sel := `
		SELECT a.id, a.author_id, a.name, a.description, a.annotation, a.visibility, a.forked_from_id::text, a.fork_count,
			a.cover_image_id::text, a.group_id::text, a.deleted_at, a.created_at, a.updated_at
		FROM assets a
		WHERE `
	var rows pgx.Rows
	var err error
	if scope == "public" {
		qSQL := sel + `a.visibility = 'public'
			AND ($1::uuid IS NULL OR (a.created_at, a.id) < (SELECT i.created_at, i.id FROM assets i WHERE i.id = $1::uuid))
			ORDER BY a.created_at DESC, a.id DESC LIMIT $2`
		rows, err = s.pool.Query(ctx, qSQL, cursor, limit+1)
	} else {
		gf := r.URL.Query().Get("groupId")
		vf := q.Get("visibility")
		// "未分组" / 指定分组 仅指私库分组；已公开素材不在私库分组中，只在「全部」或「已公开」下列出。
		visExtra := ""
		if gf == "ungrouped" {
			switch vf {
			case "public":
				visExtra = " AND a.visibility = 'public' AND a.group_id IS NULL"
			case "private":
				visExtra = " AND a.visibility = 'private' AND a.group_id IS NULL"
			default:
				visExtra = " AND a.visibility = 'private' AND a.group_id IS NULL"
			}
		} else if _, perr := uuid.Parse(gf); perr == nil && gf != "" {
			switch vf {
			case "public":
				visExtra = " AND a.visibility = 'public' AND a.group_id = $2::uuid"
			case "private":
				visExtra = " AND a.visibility = 'private' AND a.group_id = $2::uuid"
			default:
				visExtra = " AND a.visibility = 'private' AND a.group_id = $2::uuid"
			}
		} else {
			switch vf {
			case "private":
				visExtra = " AND a.visibility = 'private'"
			case "public":
				visExtra = " AND a.visibility = 'public'"
			}
		}
		var qSQL string
		if gf == "ungrouped" {
			qSQL = sel + `a.author_id = $1::uuid AND a.visibility != 'deleted'` + visExtra + `
			AND ($2::uuid IS NULL OR (a.created_at, a.id) < (SELECT i.created_at, i.id FROM assets i WHERE i.id = $2::uuid))
			ORDER BY a.created_at DESC, a.id DESC LIMIT $3`
			rows, err = s.pool.Query(ctx, qSQL, uid, cursor, limit+1)
		} else if gu, perr := uuid.Parse(gf); perr == nil && gf != "" {
			qSQL = sel + `a.author_id = $1::uuid AND a.visibility != 'deleted'` + visExtra + `
			AND ($3::uuid IS NULL OR (a.created_at, a.id) < (SELECT i.created_at, i.id FROM assets i WHERE i.id = $3::uuid))
			ORDER BY a.created_at DESC, a.id DESC LIMIT $4`
			rows, err = s.pool.Query(ctx, qSQL, uid, gu, cursor, limit+1)
		} else {
			qSQL = sel + `a.author_id = $1::uuid AND a.visibility != 'deleted'` + visExtra + `
			AND ($2::uuid IS NULL OR (a.created_at, a.id) < (SELECT i.created_at, i.id FROM assets i WHERE i.id = $2::uuid))
			ORDER BY a.created_at DESC, a.id DESC LIMIT $3`
			rows, err = s.pool.Query(ctx, qSQL, uid, cursor, limit+1)
		}
	}
	if err != nil {
		writeErr(w, 500, err.Error(), "internal")
		return
	}
	defer rows.Close()
	items := []any{}
	for rows.Next() {
		m, e := s.scanAssetIter(ctx, rows)
		if e != nil {
			writeErr(w, 500, e.Error(), "internal")
			return
		}
		items = append(items, m)
	}
	hasMore := len(items) > limit
	if hasMore {
		items = items[:limit]
	}
	var nextCursor any
	if hasMore && len(items) > 0 {
		nextCursor = items[len(items)-1].(map[string]any)["id"]
	} else {
		nextCursor = nil
	}
	writeJSON(w, 200, map[string]any{"items": items, "nextCursor": nextCursor, "total": nil})
}

func (s *Server) getAsset(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeErr(w, 400, "bad id", "bad_request")
		return
	}
	row := s.pool.QueryRow(ctx, `
		SELECT a.id, a.author_id, a.name, a.description, a.annotation, a.visibility, a.forked_from_id::text, a.fork_count,
			a.cover_image_id::text, a.group_id::text, a.deleted_at, a.created_at, a.updated_at
		FROM assets a WHERE a.id = $1
	`, id)
	m, err := s.scanAssetOne(ctx, row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeErr(w, 404, "not found", "not_found")
			return
		}
		writeErr(w, 500, err.Error(), "internal")
		return
	}
	if m["visibility"] == "deleted" {
		writeJSON(w, 200, m)
		return
	}
	cur, _ := s.sessionUserID(r)
	authorStr, _ := m["authorId"].(string)
	aid, _ := uuid.Parse(authorStr)
	if m["visibility"] == "private" {
		if cur == uuid.Nil || cur != aid {
			writeErr(w, 404, "not found", "not_found")
			return
		}
	}
	_ = cur
	_ = aid
	writeJSON(w, 200, m)
}

func (s *Server) getAssetByID(ctx context.Context, id uuid.UUID) (map[string]any, error) {
	row := s.pool.QueryRow(ctx, `
		SELECT a.id, a.author_id, a.name, a.description, a.annotation, a.visibility, a.forked_from_id::text, a.fork_count,
			a.cover_image_id::text, a.group_id::text, a.deleted_at, a.created_at, a.updated_at
		FROM assets a WHERE a.id = $1
	`, id)
	return s.scanAssetOne(ctx, row)
}

type assetCreate struct {
	Name         string  `json:"name"`
	Description  string  `json:"description"`
	Annotation   *string `json:"annotation"`
	SessionID    *string `json:"sessionId"`
	ForkedFromID *string `json:"forkedFromId"`
}

func (s *Server) createAsset(w http.ResponseWriter, r *http.Request) {
	uid, _ := userID(r.Context())
	var b assetCreate
	if err := readJSON(r, &b); err != nil || b.Name == "" {
		writeErr(w, 400, "name and description required", "bad_request")
		return
	}
	ctx := r.Context()
	var forkID *uuid.UUID
	if b.ForkedFromID != nil && *b.ForkedFromID != "" {
		if pid, perr := uuid.Parse(*b.ForkedFromID); perr == nil {
			forkID = &pid
		}
	}
	var id uuid.UUID
	err := s.pool.QueryRow(ctx, `
		INSERT INTO assets (author_id, name, description, annotation, visibility, forked_from_id, fork_count, cover_image_id, deleted_at, updated_at)
		VALUES ($1, $2, $3, $4, 'private', $5, 0, null, null, now())
		RETURNING id
	`, uid, b.Name, b.Description, b.Annotation, forkID).Scan(&id)
	if err != nil {
		writeErr(w, 500, err.Error(), "internal")
		return
	}
	_ = b.SessionID
	if forkID != nil {
		_, _ = s.pool.Exec(ctx, `UPDATE assets SET fork_count = fork_count + 1, updated_at = now() WHERE id = $1`, *forkID)
	}
	m, err := s.getAssetByID(ctx, id)
	if err != nil {
		writeErr(w, 500, err.Error(), "internal")
		return
	}
	writeJSON(w, 201, m)
}

type assetPatch struct {
	Name         *string `json:"name"`
	Description  *string `json:"description"`
	Annotation   *string `json:"annotation"`
	CoverImageID *string `json:"coverImageId"`
	GroupID      *string `json:"groupId"`
}

func (s *Server) patchAsset(w http.ResponseWriter, r *http.Request) {
	uid, _ := userID(r.Context())
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeErr(w, 400, "bad id", "bad_request")
		return
	}
	var p assetPatch
	_ = readJSON(r, &p)
	ctx := r.Context()
	var author uuid.UUID
	var vis string
	err = s.pool.QueryRow(ctx, `SELECT author_id, visibility::text FROM assets WHERE id = $1`, id).Scan(&author, &vis)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeErr(w, 404, "not found", "not_found")
		} else {
			writeErr(w, 500, err.Error(), "internal")
		}
		return
	}
	if author != uid {
		writeErr(w, 403, "forbidden", "forbidden")
		return
	}
	// 已公开素材不属于私库分组；元数据、封面可改。
	if p.GroupID != nil && vis == "public" {
		writeErr(w, 400, "public materials are not in private groups; fork to a private copy to organize", "bad_request")
		return
	}
	_, _ = s.pool.Exec(ctx, `
		UPDATE assets SET
			name = COALESCE($1, name),
			description = COALESCE($2, description),
			annotation = COALESCE($3, annotation),
			updated_at = now()
		WHERE id = $4
	`, p.Name, p.Description, p.Annotation, id)
	if p.CoverImageID != nil {
		if *p.CoverImageID == "" {
			_, _ = s.pool.Exec(ctx, `UPDATE assets SET cover_image_id = null, updated_at = now() WHERE id = $1`, id)
		} else if cid, perr := uuid.Parse(*p.CoverImageID); perr == nil {
			_, _ = s.pool.Exec(ctx, `UPDATE assets SET cover_image_id = $1, updated_at = now() WHERE id = $2`, cid, id)
		}
	}
	if p.GroupID != nil && vis == "private" {
		if *p.GroupID == "" {
			_, _ = s.pool.Exec(ctx, `UPDATE assets SET group_id = null, updated_at = now() WHERE id = $1`, id)
		} else if gid, perr := uuid.Parse(*p.GroupID); perr == nil {
			var n int
			err := s.pool.QueryRow(ctx, `SELECT count(*)::int FROM asset_groups WHERE id = $1 AND user_id = $2`, gid, uid).Scan(&n)
			if err != nil || n == 0 {
				writeErr(w, 400, "invalid group", "bad_request")
				return
			}
			_, _ = s.pool.Exec(ctx, `UPDATE assets SET group_id = $1, updated_at = now() WHERE id = $2`, gid, id)
		}
	}
	m, err := s.getAssetByID(ctx, id)
	if err != nil {
		writeErr(w, 500, err.Error(), "internal")
		return
	}
	writeJSON(w, 200, m)
}

func (s *Server) publishAsset(w http.ResponseWriter, r *http.Request) {
	uid, _ := userID(r.Context())
	id, _ := uuid.Parse(chi.URLParam(r, "id"))
	ctx := r.Context()
	var author uuid.UUID
	var preVis string
	err := s.pool.QueryRow(ctx, `SELECT author_id, visibility FROM assets WHERE id = $1`, id).Scan(&author, &preVis)
	if err != nil {
		writeErr(w, 404, "not found", "not_found")
		return
	}
	if author != uid {
		writeErr(w, 403, "forbidden", "forbidden")
		return
	}
	if preVis == "public" {
		m, err := s.getAssetByID(ctx, id)
		if err != nil {
			writeErr(w, 500, err.Error(), "internal")
			return
		}
		writeJSON(w, 200, m)
		return
	}
	_, err = s.pool.Exec(ctx, `UPDATE assets SET visibility = 'public', group_id = null, updated_at = now() WHERE id = $1`, id)
	if err != nil {
		writeErr(w, 500, err.Error(), "internal")
		return
	}
	m, err := s.getAssetByID(ctx, id)
	if err != nil {
		writeErr(w, 500, err.Error(), "internal")
		return
	}
	writeJSON(w, 200, m)
}

func (s *Server) forkAsset(w http.ResponseWriter, r *http.Request) {
	uid, _ := userID(r.Context())
	src, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeErr(w, 400, "bad id", "bad_request")
		return
	}
	ctx := r.Context()
	var name, desc, vis string
	var pubAuthor uuid.UUID
	err = s.pool.QueryRow(ctx, `SELECT name, description, visibility, author_id FROM assets WHERE id = $1`, src).Scan(&name, &desc, &vis, &pubAuthor)
	if err != nil {
		writeErr(w, 404, "cannot fork", "cannot_fork")
		return
	}
	if vis == "deleted" {
		writeErr(w, 404, "cannot fork", "cannot_fork")
		return
	}
	newName := name + " (FORK)"
	if vis == "private" {
		if pubAuthor != uid {
			writeErr(w, 404, "cannot fork", "cannot_fork")
			return
		}
		newName = name + " (COPY)"
	} else if vis == "public" && pubAuthor == uid {
		// 自己的公开件「复制到私库」与私库自复制语义一致
		newName = name + " (COPY)"
	}
	var nid uuid.UUID
	err = s.pool.QueryRow(ctx, `
		INSERT INTO assets (author_id, name, description, visibility, forked_from_id, fork_count, updated_at)
		VALUES ($1, $2, $3, 'private', $4, 0, now())
		RETURNING id
	`, uid, newName, desc, src).Scan(&nid)
	if err != nil {
		writeErr(w, 500, err.Error(), "internal")
		return
	}
	_, _ = s.pool.Exec(ctx, `UPDATE assets SET fork_count = fork_count + 1, updated_at = now() WHERE id = $1`, src)
	m, err := s.getAssetByID(ctx, nid)
	if err != nil {
		writeErr(w, 500, err.Error(), "internal")
		return
	}
	writeJSON(w, 201, m)
}

type postImageBody struct {
	ExtraPrompt *string `json:"extraPrompt"`
}

func (s *Server) postImage(w http.ResponseWriter, r *http.Request) {
	uid, _ := userID(r.Context())
	aid, _ := uuid.Parse(chi.URLParam(r, "id"))
	var b postImageBody
	_ = readJSON(r, &b)
	ctx := r.Context()
	var author uuid.UUID
	var vis string
	err := s.pool.QueryRow(ctx, `SELECT author_id, visibility FROM assets WHERE id = $1`, aid).Scan(&author, &vis)
	if err != nil {
		writeErr(w, 404, "not found", "not_found")
		return
	}
	if vis == "public" && author != uid {
		writeErr(w, 403, "fork first", "forbidden")
		return
	}
	if author != uid {
		writeErr(w, 403, "forbidden", "forbidden")
		return
	}
	imgID, url, err := s.ai.Image.GenerateImage(ctx, aid, uid, b.ExtraPrompt)
	if err != nil {
		writeErr(w, 500, err.Error(), "internal")
		return
	}
	_, err = s.pool.Exec(ctx, `
		INSERT INTO asset_images (id, asset_id, url, extra_prompt, generation_status, created_at)
		VALUES ($1, $2, $3, $4, 'done', now())
	`, imgID, aid, url, b.ExtraPrompt)
	if err != nil {
		writeErr(w, 500, err.Error(), "internal")
		return
	}
	writeJSON(w, 202, map[string]any{
		"id": imgID.String(), "assetId": aid.String(), "url": url, "extraPrompt": b.ExtraPrompt,
		"createdAt": time.Now().Format(time.RFC3339), "generationStatus": "done",
	})
}

func (s *Server) getForks(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	id, _ := uuid.Parse(chi.URLParam(r, "id"))
	dir := r.URL.Query().Get("direction")
	if dir != "upstream" && dir != "downstream" {
		writeErr(w, 400, "direction required", "bad_request")
		return
	}
	nodes := []any{}
	if dir == "upstream" {
		var forkedFrom sql.NullString
		_ = s.pool.QueryRow(ctx, `SELECT forked_from_id::text FROM assets WHERE id = $1`, id).Scan(&forkedFrom)
		if !forkedFrom.Valid {
			writeJSON(w, 200, map[string]any{"direction": dir, "nodes": nodes})
			return
		}
		pid, err := uuid.Parse(forkedFrom.String)
		if err != nil {
			writeJSON(w, 200, map[string]any{"direction": dir, "nodes": nodes})
			return
		}
		n, err := s.forkNode(ctx, pid)
		if err == nil && n != nil {
			nodes = append(nodes, n)
		}
	} else {
		rows, err := s.pool.Query(ctx, `SELECT id FROM assets WHERE forked_from_id = $1`, id)
		if err == nil {
			defer rows.Close()
			for rows.Next() {
				var cid uuid.UUID
				_ = rows.Scan(&cid)
				n, _ := s.forkNode(ctx, cid)
				if n != nil {
					nodes = append(nodes, n)
				}
			}
		}
	}
	writeJSON(w, 200, map[string]any{"direction": dir, "nodes": nodes})
}

func (s *Server) forkNode(ctx context.Context, id uuid.UUID) (map[string]any, error) {
	row := s.pool.QueryRow(ctx, `SELECT name, visibility, forked_from_id::text, deleted_at FROM assets WHERE id = $1`, id)
	var name, vis string
	var forked sql.NullString
	var del sql.NullTime
	err := row.Scan(&name, &vis, &forked, &del)
	if err != nil {
		return nil, err
	}
	if vis == "deleted" {
		dt := any(nil)
		if del.Valid {
			dt = del.Time.Format(time.RFC3339)
		}
		return map[string]any{
			"id": id.String(), "name": "", "visibility": "deleted", "forkedFromId": nil, "deletedAt": dt,
		}, nil
	}
	fk := any(nil)
	if forked.Valid {
		fk = forked.String
	}
	return map[string]any{
		"id": id.String(), "name": name, "visibility": vis, "forkedFromId": fk, "deletedAt": nil,
	}, nil
}

var _ = (*pgxpool.Pool)(nil)
var _ = ai.Registry{}
