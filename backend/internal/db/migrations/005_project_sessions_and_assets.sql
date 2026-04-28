-- Project-scoped design chat sessions and linked library assets (game design context).

ALTER TABLE chat_sessions
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects (id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS chat_sessions_project_updated
  ON chat_sessions (project_id, updated_at DESC)
  WHERE project_id IS NOT NULL;

ALTER TABLE chat_sessions DROP CONSTRAINT IF EXISTS chat_sessions_project_group_chk;
ALTER TABLE chat_sessions ADD CONSTRAINT chat_sessions_project_group_chk CHECK (
  project_id IS NULL OR staging_group_id IS NULL
);

CREATE TABLE IF NOT EXISTS project_assets (
  project_id UUID NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  asset_id   UUID NOT NULL REFERENCES assets (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, asset_id)
);

CREATE INDEX IF NOT EXISTS project_assets_project ON project_assets (project_id);

-- One default design thread per existing project (no project-bound sessions yet).
INSERT INTO chat_sessions (user_id, title, project_id)
SELECT p.user_id, '设计 1', p.id
FROM projects p
WHERE NOT EXISTS (
  SELECT 1 FROM chat_sessions c WHERE c.project_id = p.id
);
