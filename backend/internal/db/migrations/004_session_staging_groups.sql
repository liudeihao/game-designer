-- Session staging groups: multiple chat sessions can share a group; draft staging is either
-- per-session (independent) or one pool per group (shared).

CREATE TABLE IF NOT EXISTS session_staging_groups (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  position      INT NOT NULL DEFAULT 0,
  draft_staging TEXT NOT NULL DEFAULT 'independent' CHECK (draft_staging IN ('independent', 'shared')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS session_staging_groups_user_pos
  ON session_staging_groups (user_id, position ASC, created_at ASC);

ALTER TABLE chat_sessions
  ADD COLUMN IF NOT EXISTS staging_group_id UUID REFERENCES session_staging_groups (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS chat_sessions_staging_group ON chat_sessions (staging_group_id);

-- Drafts: exactly one of (session_id, group_id) is set. Session-scoped = independent mode; group-scoped = shared mode.
ALTER TABLE draft_assets ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES session_staging_groups (id) ON DELETE CASCADE;

ALTER TABLE draft_assets ALTER COLUMN session_id DROP NOT NULL;

ALTER TABLE draft_assets DROP CONSTRAINT IF EXISTS draft_assets_session_id_temp_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS draft_assets_session_temp_uniq
  ON draft_assets (session_id, temp_id) WHERE session_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS draft_assets_group_temp_uniq
  ON draft_assets (group_id, temp_id) WHERE group_id IS NOT NULL;

ALTER TABLE draft_assets DROP CONSTRAINT IF EXISTS draft_assets_scope_chk;
ALTER TABLE draft_assets ADD CONSTRAINT draft_assets_scope_chk CHECK (
  (session_id IS NOT NULL AND group_id IS NULL) OR (session_id IS NULL AND group_id IS NOT NULL)
);
