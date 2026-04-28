package api

import (
	"net/http"

	"github.com/google/uuid"
)

func (s *Server) listAssetTags(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	uid, err := s.sessionUserID(r)
	if err != nil || uid == uuid.Nil {
		writeErr(w, 401, "not logged in", "unauthorized")
		return
	}
	rows, err := s.pool.Query(ctx, `
		SELECT t.id::text, t.name,
			COALESCE((
				SELECT count(*)::int FROM asset_tags x
				INNER JOIN assets a ON a.id = x.asset_id
				WHERE x.tag_id = t.id AND a.author_id = $1 AND a.visibility != 'deleted'
			), 0)
		FROM tags t
		WHERE t.user_id = $1
		ORDER BY 3 DESC, lower(t.name) ASC
		LIMIT 200
	`, uid)
	if err != nil {
		writeErr(w, 500, err.Error(), "internal")
		return
	}
	defer rows.Close()
	items := []any{}
	for rows.Next() {
		var id, name string
		var cnt int
		if err := rows.Scan(&id, &name, &cnt); err != nil {
			writeErr(w, 500, err.Error(), "internal")
			return
		}
		items = append(items, map[string]any{"id": id, "name": name, "assetCount": cnt})
	}
	writeJSON(w, 200, map[string]any{"items": items})
}
