-- User-defined groups for private library organization

CREATE TABLE IF NOT EXISTS asset_groups (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  position   INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS asset_groups_user_pos ON asset_groups (user_id, position);

ALTER TABLE assets ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES asset_groups (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS assets_author_group ON assets (author_id, group_id) WHERE visibility != 'deleted';
