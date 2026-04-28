package api

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
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
	authorUsername   string
	authorDispName   sql.NullString
}

func (s *Server) scanAssetIter(ctx context.Context, rows pgx.Rows) (map[string]any, error) {
	var a assetRowData
	if err := rows.Scan(
		&a.id, &a.authorID, &a.name, &a.desc, &a.ann, &a.vis, &a.forkedFrom, &a.forkCount,
		&a.coverID, &a.groupID, &a.deletedAt, &a.createdAt, &a.upAt,
		&a.authorUsername, &a.authorDispName,
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
		&a.authorUsername, &a.authorDispName,
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
	authDn := any(nil)
	if a.authorDispName.Valid {
		authDn = a.authorDispName.String
	}
	tags, err := s.loadAssetTagNames(ctx, a.id)
	if err != nil {
		return nil, err
	}
	return map[string]any{
		"id": a.id.String(), "name": a.name, "description": a.desc, "annotation": annV,
		"authorId": a.authorID.String(), "createdAt": a.createdAt.Format(time.RFC3339),
		"updatedAt": a.upAt.Format(time.RFC3339), "visibility": a.vis, "forkedFromId": forkV,
		"forkCount": a.forkCount, "images": imgs, "coverImageId": cov, "groupId": gp, "deletedAt": nil,
		"tags": tags,
		"author": map[string]any{
			"id": a.authorID.String(), "username": a.authorUsername, "displayName": authDn,
		},
	}, nil
}

func (s *Server) loadAssetTagNames(ctx context.Context, assetID uuid.UUID) ([]any, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT t.name FROM asset_tags x
		INNER JOIN tags t ON t.id = x.tag_id
		WHERE x.asset_id = $1
		ORDER BY lower(t.name)
	`, assetID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []any
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, err
		}
		out = append(out, name)
	}
	if out == nil {
		out = []any{}
	}
	return out, nil
}

func (s *Server) syncAssetTags(ctx context.Context, uid, assetID uuid.UUID, names []string) error {
	const maxTags = 48
	if len(names) > maxTags {
		return fmt.Errorf("too many tags (max %d)", maxTags)
	}
	if _, err := s.pool.Exec(ctx, `DELETE FROM asset_tags WHERE asset_id = $1`, assetID); err != nil {
		return err
	}
	seen := map[string]struct{}{}
	for _, raw := range names {
		n := strings.TrimSpace(raw)
		if n == "" {
			continue
		}
		runes := []rune(n)
		if len(runes) > 64 {
			n = string(runes[:64])
		}
		key := strings.ToLower(n)
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		var tid uuid.UUID
		err := s.pool.QueryRow(ctx, `SELECT id FROM tags WHERE user_id = $1 AND lower(trim(name)) = $2`, uid, key).Scan(&tid)
		if errors.Is(err, pgx.ErrNoRows) {
			err = s.pool.QueryRow(ctx, `
				INSERT INTO tags (user_id, name) VALUES ($1, $2) RETURNING id
			`, uid, n).Scan(&tid)
		}
		if err != nil {
			return err
		}
		if _, err = s.pool.Exec(ctx, `
			INSERT INTO asset_tags (asset_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING
		`, assetID, tid); err != nil {
			return err
		}
	}
	return nil
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

func assetListSortMode(sort string) string {
	switch strings.TrimSpace(sort) {
	case "updated_desc":
		return "updated_desc"
	case "fork_desc":
		return "fork_desc"
	default:
		return "created_desc"
	}
}

func assetListCursorPred(sortMode string, cursorArg int) string {
	switch sortMode {
	case "updated_desc":
		return fmt.Sprintf(
			`AND ($%[1]d::uuid IS NULL OR (a.updated_at, a.id) < (SELECT i.updated_at, i.id FROM assets i WHERE i.id = $%[1]d::uuid))`,
			cursorArg,
		)
	case "fork_desc":
		return fmt.Sprintf(
			`AND ($%[1]d::uuid IS NULL OR (a.fork_count, a.id) < (SELECT i.fork_count, i.id FROM assets i WHERE i.id = $%[1]d::uuid))`,
			cursorArg,
		)
	default:
		return fmt.Sprintf(
			`AND ($%[1]d::uuid IS NULL OR (a.created_at, a.id) < (SELECT i.created_at, i.id FROM assets i WHERE i.id = $%[1]d::uuid))`,
			cursorArg,
		)
	}
}

func assetListOrderBy(sortMode string) string {
	switch sortMode {
	case "updated_desc":
		return "ORDER BY a.updated_at DESC, a.id DESC"
	case "fork_desc":
		return "ORDER BY a.fork_count DESC, a.id DESC"
	default:
		return "ORDER BY a.created_at DESC, a.id DESC"
	}
}

func assetListSearchClause(patIdx int) string {
	return fmt.Sprintf(
		` AND ($%[1]d::text IS NULL OR trim($%[1]d::text) = '' OR a.name ILIKE ('%%' || $%[1]d || '%%') OR a.description ILIKE ('%%' || $%[1]d || '%%') OR COALESCE(a.annotation, '') ILIKE ('%%' || $%[1]d || '%%'))`,
		patIdx,
	)
}

func assetListTagClause(tagIdx int) string {
	return fmt.Sprintf(
		` AND ($%[1]d::uuid IS NULL OR EXISTS (SELECT 1 FROM asset_tags z WHERE z.asset_id = a.id AND z.tag_id = $%[1]d))`,
		tagIdx,
	)
}

func normalizeSearchPointer(q string) any {
	s := strings.TrimSpace(q)
	if len(s) > 200 {
		s = s[:200]
	}
	if s == "" {
		return nil
	}
	return s
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
	authorUser := strings.TrimSpace(q.Get("authorUsername"))
	if authorUser != "" && scope != "public" {
		writeErr(w, 400, "authorUsername is only valid with scope=public", "bad_request")
		return
	}
	if scope == "private" {
		u, err := s.sessionUserID(r)
		if err != nil || u == uuid.Nil {
			writeErr(w, 401, "not logged in", "unauthorized")
			return
		}
		uid = u
	}
	sortMode := assetListSortMode(q.Get("sort"))
	searchPtr := normalizeSearchPointer(q.Get("q"))
	var tagPtr any = nil
	if scope == "private" {
		if tid := strings.TrimSpace(q.Get("tagId")); tid != "" {
			if parsed, terr := uuid.Parse(tid); terr == nil {
				tagPtr = parsed
			}
		}
	}

	imgExtra := ""
	if q.Get("img") == "no" {
		imgExtra = " AND NOT EXISTS (SELECT 1 FROM asset_images i WHERE i.asset_id = a.id)"
	}
	if q.Get("hasImage") == "true" || q.Get("img") == "yes" {
		imgExtra += " AND EXISTS (SELECT 1 FROM asset_images i WHERE i.asset_id = a.id)"
	}

	sel := `
		SELECT a.id, a.author_id, a.name, a.description, a.annotation, a.visibility, a.forked_from_id::text, a.fork_count,
			a.cover_image_id::text, a.group_id::text, a.deleted_at, a.created_at, a.updated_at,
			u.username, u.display_name
		FROM assets a
		INNER JOIN users u ON u.id = a.author_id
		WHERE `
	var rows pgx.Rows
	var err error
	if scope == "public" {
		authorExtra := ""
		if authorUser != "" {
			authorExtra = ` AND a.author_id = (SELECT id FROM users WHERE username = $3)`
		}
		ob := assetListOrderBy(sortMode)
		cp := assetListCursorPred(sortMode, 1)
		var qSQL string
		if authorUser != "" {
			qSQL = sel + `a.visibility = 'public'` + authorExtra + imgExtra + `
			` + cp + assetListSearchClause(4) + `
			` + ob + ` LIMIT $2`
			rows, err = s.pool.Query(ctx, qSQL, cursor, limit+1, authorUser, searchPtr)
		} else {
			qSQL = sel + `a.visibility = 'public'` + imgExtra + `
			` + cp + assetListSearchClause(3) + `
			` + ob + ` LIMIT $2`
			rows, err = s.pool.Query(ctx, qSQL, cursor, limit+1, searchPtr)
		}
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
		ob := assetListOrderBy(sortMode)
		var qSQL string
		if gf == "ungrouped" {
			cp := assetListCursorPred(sortMode, 2)
			qSQL = sel + `a.author_id = $1::uuid AND a.visibility != 'deleted'` + visExtra + imgExtra +
				assetListSearchClause(3) + assetListTagClause(4) + `
			` + cp + `
			` + ob + ` LIMIT $5`
			rows, err = s.pool.Query(ctx, qSQL, uid, cursor, searchPtr, tagPtr, limit+1)
		} else if gu, perr := uuid.Parse(gf); perr == nil && gf != "" {
			cp := assetListCursorPred(sortMode, 3)
			qSQL = sel + `a.author_id = $1::uuid AND a.visibility != 'deleted'` + visExtra + imgExtra +
				assetListSearchClause(4) + assetListTagClause(5) + `
			` + cp + `
			` + ob + ` LIMIT $6`
			rows, err = s.pool.Query(ctx, qSQL, uid, gu, cursor, searchPtr, tagPtr, limit+1)
		} else {
			cp := assetListCursorPred(sortMode, 2)
			qSQL = sel + `a.author_id = $1::uuid AND a.visibility != 'deleted'` + visExtra + imgExtra +
				assetListSearchClause(3) + assetListTagClause(4) + `
			` + cp + `
			` + ob + ` LIMIT $5`
			rows, err = s.pool.Query(ctx, qSQL, uid, cursor, searchPtr, tagPtr, limit+1)
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
			a.cover_image_id::text, a.group_id::text, a.deleted_at, a.created_at, a.updated_at,
			u.username, u.display_name
		FROM assets a
		INNER JOIN users u ON u.id = a.author_id
		WHERE a.id = $1
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
			a.cover_image_id::text, a.group_id::text, a.deleted_at, a.created_at, a.updated_at,
			u.username, u.display_name
		FROM assets a
		INNER JOIN users u ON u.id = a.author_id
		WHERE a.id = $1
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
	Name         *string   `json:"name"`
	Description  *string   `json:"description"`
	Annotation   *string   `json:"annotation"`
	CoverImageID *string   `json:"coverImageId"`
	GroupID      *string   `json:"groupId"`
	Tags         *[]string `json:"tags"`
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
	// 已公开：内容冻结，仅可通过 fork 到私库再改（与 product / OpenAPI「publish = irreversible freeze」一致）
	if vis == "public" {
		writeErr(w, 400, "public assets are read-only; fork a private copy to edit", "bad_request")
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
	if p.Tags != nil {
		if err := s.syncAssetTags(ctx, uid, id, *p.Tags); err != nil {
			writeErr(w, 400, err.Error(), "bad_request")
			return
		}
	}
	m, err := s.getAssetByID(ctx, id)
	if err != nil {
		writeErr(w, 500, err.Error(), "internal")
		return
	}
	writeJSON(w, 200, m)
}

// deleteAsset soft-deletes a private asset owned by the current user (visibility → deleted).
// Public assets cannot be removed this way.
func (s *Server) deleteAsset(w http.ResponseWriter, r *http.Request) {
	uid, _ := userID(r.Context())
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeErr(w, 400, "bad id", "bad_request")
		return
	}
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
	if vis == "public" {
		writeErr(w, 400, "已公开的素材不能从私库删除（全站探索页仍保留）", "bad_request")
		return
	}
	if vis == "deleted" {
		w.WriteHeader(204)
		return
	}
	if vis != "private" {
		writeErr(w, 400, "cannot delete", "bad_request")
		return
	}
	ct, err := s.pool.Exec(ctx, `
		UPDATE assets SET visibility = 'deleted', deleted_at = now(), updated_at = now() WHERE id = $1 AND author_id = $2 AND visibility = 'private'
	`, id, uid)
	if err != nil {
		writeErr(w, 500, err.Error(), "internal")
		return
	}
	if ct.RowsAffected() == 0 {
		writeErr(w, 404, "not found", "not_found")
		return
	}
	w.WriteHeader(204)
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
	if author != uid {
		if vis == "public" {
			writeErr(w, 403, "fork first", "forbidden")
			return
		}
		writeErr(w, 403, "forbidden", "forbidden")
		return
	}
	if vis == "public" {
		writeErr(w, 400, "public assets are read-only; fork a private copy to generate images", "bad_request")
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

func (s *Server) deleteAssetImage(w http.ResponseWriter, r *http.Request) {
	uid, _ := userID(r.Context())
	aid, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeErr(w, 400, "bad id", "bad_request")
		return
	}
	iid, err := uuid.Parse(chi.URLParam(r, "imageId"))
	if err != nil {
		writeErr(w, 400, "bad image id", "bad_request")
		return
	}
	ctx := r.Context()
	var author uuid.UUID
	var vis string
	err = s.pool.QueryRow(ctx, `SELECT author_id, visibility::text FROM assets WHERE id = $1`, aid).Scan(&author, &vis)
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
	if vis == "public" {
		writeErr(w, 400, "public assets are read-only; fork a private copy to edit", "bad_request")
		return
	}
	cmd, err := s.pool.Exec(ctx, `DELETE FROM asset_images WHERE id = $1 AND asset_id = $2`, iid, aid)
	if err != nil {
		writeErr(w, 500, err.Error(), "internal")
		return
	}
	if cmd.RowsAffected() == 0 {
		writeErr(w, 404, "not found", "not_found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
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
		fk := any(nil)
		if forked.Valid {
			fk = forked.String
		}
		return map[string]any{
			"id": id.String(), "name": "", "visibility": "deleted", "forkedFromId": fk, "deletedAt": dt,
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

func clampInt(s string, def, min, max int) int {
	if s == "" {
		return def
	}
	v, err := strconv.Atoi(s)
	if err != nil {
		return def
	}
	if v < min {
		return min
	}
	if v > max {
		return max
	}
	return v
}

// assetReadableForForkGraph mirrors GET /assets/{id} visibility for non-deleted; deleted ghosts are readable by id.
func (s *Server) assetReadableForForkGraph(ctx context.Context, id uuid.UUID, viewer uuid.UUID) bool {
	var vis string
	var author uuid.UUID
	err := s.pool.QueryRow(ctx, `SELECT visibility::text, author_id FROM assets WHERE id = $1`, id).Scan(&vis, &author)
	if err != nil {
		return false
	}
	switch vis {
	case "deleted":
		return true
	case "public":
		return true
	case "private":
		return viewer != uuid.Nil && viewer == author
	default:
		return false
	}
}

func (s *Server) forkGraphNodeJSON(ctx context.Context, id uuid.UUID, viewer uuid.UUID) (map[string]any, error) {
	var name, vis string
	var forked sql.NullString
	var del sql.NullTime
	var fc int
	var author uuid.UUID
	var cover sql.NullString
	err := s.pool.QueryRow(ctx, `
		SELECT a.name, a.visibility::text, a.forked_from_id::text, a.deleted_at, a.fork_count, a.author_id,
			COALESCE(
				(SELECT url FROM asset_images WHERE id = a.cover_image_id LIMIT 1),
				(SELECT url FROM asset_images WHERE asset_id = a.id ORDER BY created_at ASC LIMIT 1)
			)
		FROM assets a WHERE a.id = $1
	`, id).Scan(&name, &vis, &forked, &del, &fc, &author, &cover)
	if err != nil {
		return nil, err
	}
	fk := any(nil)
	if forked.Valid {
		fk = forked.String
	}
	if vis == "deleted" {
		dt := any(nil)
		if del.Valid {
			dt = del.Time.Format(time.RFC3339)
		}
		return map[string]any{
			"id": id.String(), "name": "", "visibility": "deleted",
			"forkedFromId": fk, "deletedAt": dt,
			"forkCount": 0, "coverImageUrl": nil,
		}, nil
	}
	readable := vis == "public" || (viewer != uuid.Nil && viewer == author)
	if !readable {
		return map[string]any{
			"id": id.String(), "name": "", "visibility": "private",
			"forkedFromId": fk, "deletedAt": nil,
			"forkCount": 0, "coverImageUrl": nil,
		}, nil
	}
	cov := any(nil)
	if cover.Valid {
		cov = cover.String
	}
	return map[string]any{
		"id": id.String(), "name": name, "visibility": vis,
		"forkedFromId": fk, "deletedAt": nil,
		"forkCount": fc, "coverImageUrl": cov,
	}, nil
}

func (s *Server) getForkGraph(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	focusID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeErr(w, 400, "bad id", "bad_request")
		return
	}
	viewer, _ := s.sessionUserID(r)
	if !s.assetReadableForForkGraph(ctx, focusID, viewer) {
		writeErr(w, 404, "not found", "not_found")
		return
	}
	q := r.URL.Query()
	maxUp := clampInt(q.Get("maxUpstream"), 64, 1, 128)
	downDepthLimit := clampInt(q.Get("downstreamDepth"), 2, 0, 12)
	maxNodes := clampInt(q.Get("maxNodes"), 200, 1, 500)
	childLimit := clampInt(q.Get("childLimit"), 48, 1, 96)
	expandFromStr := strings.TrimSpace(q.Get("expandFrom"))

	if expandFromStr != "" {
		s.forkGraphExpandFrom(w, r, focusID, expandFromStr, viewer, childLimit)
		return
	}

	truncated := false
	ordered := make([]uuid.UUID, 0, maxNodes)
	seen := make(map[uuid.UUID]struct{})

	cur := focusID
	upChain := make([]uuid.UUID, 0, maxUp)
	stepGuard := make(map[uuid.UUID]struct{})
	for len(upChain) < maxUp {
		if _, dup := stepGuard[cur]; dup {
			break
		}
		stepGuard[cur] = struct{}{}
		upChain = append(upChain, cur)
		var parent sql.NullString
		err := s.pool.QueryRow(ctx, `SELECT forked_from_id::text FROM assets WHERE id = $1`, cur).Scan(&parent)
		if err != nil || !parent.Valid {
			break
		}
		pid, perr := uuid.Parse(parent.String)
		if perr != nil {
			break
		}
		cur = pid
	}
	if len(upChain) == maxUp {
		leaf := upChain[len(upChain)-1]
		var moreParent sql.NullString
		_ = s.pool.QueryRow(ctx, `SELECT forked_from_id::text FROM assets WHERE id = $1`, leaf).Scan(&moreParent)
		if moreParent.Valid {
			truncated = true
		}
	}
	for i := len(upChain) - 1; i >= 0; i-- {
		id := upChain[i]
		if _, ok := seen[id]; ok {
			continue
		}
		if len(ordered) >= maxNodes {
			truncated = true
			break
		}
		seen[id] = struct{}{}
		ordered = append(ordered, id)
	}

	type qn struct {
		id    uuid.UUID
		depth int
	}
	queue := []qn{{focusID, 0}}
	for qi := 0; qi < len(queue); qi++ {
		if len(ordered) >= maxNodes {
			truncated = true
			break
		}
		item := queue[qi]
		if item.depth >= downDepthLimit {
			continue
		}
		rows, err := s.pool.Query(ctx, `
			SELECT id FROM assets WHERE forked_from_id = $1 ORDER BY created_at ASC, id ASC
		`, item.id)
		if err != nil {
			writeErr(w, 500, err.Error(), "internal")
			return
		}
		for rows.Next() {
			if len(ordered) >= maxNodes {
				truncated = true
				break
			}
			var cid uuid.UUID
			if err := rows.Scan(&cid); err != nil {
				rows.Close()
				writeErr(w, 500, err.Error(), "internal")
				return
			}
			if _, ok := seen[cid]; ok {
				continue
			}
			seen[cid] = struct{}{}
			ordered = append(ordered, cid)
			queue = append(queue, qn{cid, item.depth + 1})
		}
		rows.Close()
		if truncated {
			break
		}
	}

	nodes := make([]any, 0, len(ordered))
	for _, id := range ordered {
		m, err := s.forkGraphNodeJSON(ctx, id, viewer)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				continue
			}
			writeErr(w, 500, err.Error(), "internal")
			return
		}
		nodes = append(nodes, m)
	}
	writeJSON(w, 200, map[string]any{
		"focusAssetId": focusID.String(),
		"nodes":        nodes,
		"truncated":    truncated,
	})
}

func (s *Server) forkGraphExpandFrom(w http.ResponseWriter, r *http.Request, focusID uuid.UUID, expandFromStr string, viewer uuid.UUID, childLimit int) {
	ctx := r.Context()
	parentID, err := uuid.Parse(expandFromStr)
	if err != nil {
		writeErr(w, 400, "bad expandFrom", "bad_request")
		return
	}
	if !s.assetReadableForForkGraph(ctx, parentID, viewer) {
		writeErr(w, 404, "not found", "not_found")
		return
	}
	var total int
	err = s.pool.QueryRow(ctx, `SELECT count(*)::int FROM assets WHERE forked_from_id = $1`, parentID).Scan(&total)
	if err != nil {
		writeErr(w, 500, err.Error(), "internal")
		return
	}
	rows, err := s.pool.Query(ctx, `
		SELECT id FROM assets WHERE forked_from_id = $1 ORDER BY created_at ASC, id ASC LIMIT $2
	`, parentID, childLimit)
	if err != nil {
		writeErr(w, 500, err.Error(), "internal")
		return
	}
	defer rows.Close()
	var ids []uuid.UUID
	for rows.Next() {
		var cid uuid.UUID
		if err := rows.Scan(&cid); err != nil {
			writeErr(w, 500, err.Error(), "internal")
			return
		}
		ids = append(ids, cid)
	}
	truncated := total > len(ids)
	nodes := make([]any, 0, len(ids))
	for _, id := range ids {
		m, err := s.forkGraphNodeJSON(ctx, id, viewer)
		if err != nil {
			continue
		}
		nodes = append(nodes, m)
	}
	writeJSON(w, 200, map[string]any{
		"focusAssetId": focusID.String(),
		"nodes":        nodes,
		"truncated":    truncated,
	})
}

var _ = (*pgxpool.Pool)(nil)
var _ = ai.Registry{}
