-- Game Designer — PostgreSQL schema (v1), idempotent where possible

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username   TEXT NOT NULL UNIQUE,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token      TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS auth_sessions_token_idx ON auth_sessions (token);

CREATE TABLE IF NOT EXISTS assets (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id     UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT NOT NULL,
  annotation    TEXT,
  visibility    TEXT NOT NULL,
  forked_from_id UUID REFERENCES assets (id) ON DELETE SET NULL,
  fork_count    INT NOT NULL DEFAULT 0,
  cover_image_id UUID,
  deleted_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT assets_vis_chk CHECK (visibility IN ('private', 'public', 'deleted'))
);

CREATE INDEX IF NOT EXISTS assets_author_created ON assets (author_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS assets_public_created ON assets (visibility, created_at DESC, id DESC) WHERE visibility = 'public';

CREATE TABLE IF NOT EXISTS asset_images (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id   UUID NOT NULL REFERENCES assets (id) ON DELETE CASCADE,
  url        TEXT NOT NULL,
  extra_prompt TEXT,
  generation_status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT asset_images_gen_chk CHECK (generation_status IN ('pending', 'done', 'failed'))
);

CREATE INDEX IF NOT EXISTS asset_images_asset ON asset_images (asset_id);

DO $$ BEGIN
  ALTER TABLE assets ADD CONSTRAINT assets_cover_fk
    FOREIGN KEY (cover_image_id) REFERENCES asset_images (id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS chat_sessions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES chat_sessions (id) ON DELETE CASCADE,
  role       TEXT NOT NULL,
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chat_messages_role_chk CHECK (role IN ('user', 'assistant', 'system'))
);

CREATE INDEX IF NOT EXISTS chat_messages_session ON chat_messages (session_id, created_at);

CREATE TABLE IF NOT EXISTS draft_assets (
  id          BIGSERIAL PRIMARY KEY,
  session_id  UUID NOT NULL REFERENCES chat_sessions (id) ON DELETE CASCADE,
  temp_id     TEXT NOT NULL,
  name        TEXT NOT NULL,
  description TEXT NOT NULL,
  done        BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (session_id, temp_id)
);

CREATE TABLE IF NOT EXISTS projects (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  canvas_document JSONB,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS projects_user ON projects (user_id, updated_at DESC);

INSERT INTO users (id, username, display_name) VALUES
  ('00000000-0000-0000-0000-000000000001', 'indiedev', 'Indie')
ON CONFLICT (username) DO NOTHING;
