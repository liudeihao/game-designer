-- Per-user tags for library assets (cross-index).

CREATE TABLE IF NOT EXISTS tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tags_user_name_len CHECK (char_length(trim(name)) > 0 AND char_length(name) <= 64)
);

CREATE UNIQUE INDEX IF NOT EXISTS tags_user_lower_name ON tags (user_id, lower(trim(name)));

CREATE TABLE IF NOT EXISTS asset_tags (
  asset_id UUID NOT NULL REFERENCES assets (id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES tags (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (asset_id, tag_id)
);

CREATE INDEX IF NOT EXISTS asset_tags_tag ON asset_tags (tag_id);
