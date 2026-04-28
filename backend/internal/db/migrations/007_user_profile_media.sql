-- Public profile: optional avatar & cover image URLs (https only enforced in API).

ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS cover_url TEXT;
