-- Add email + password_hash for local accounts; backfill dev seed user.

ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;

-- Seed dev user (id matches dev login in server). Include email+password so re-runs are safe when columns are already NOT NULL.
INSERT INTO users (id, username, display_name, email, password_hash) VALUES
  (
    '00000000-0000-0000-0000-000000000001',
    'indiedev',
    'Indie',
    'indiedev@local.dev',
    '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi'
  )
ON CONFLICT (username) DO NOTHING;

-- Password for seed user: "password" (bcrypt) — for local dev only; change in non-dev as needed
UPDATE users SET
  email = 'indiedev@local.dev',
  password_hash = '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi'
WHERE id = '00000000-0000-0000-0000-000000000001'
  AND (email IS NULL OR email = '');

-- Any other legacy row without auth: not expected; fail loudly if any remain null before NOT NULL
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM users WHERE email IS NULL OR password_hash IS NULL) THEN
    RAISE EXCEPTION '002_user_email_password: all users must have email and password_hash after backfill';
  END IF;
END $$;

ALTER TABLE users ALTER COLUMN email SET NOT NULL;
ALTER TABLE users ALTER COLUMN password_hash SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_idx ON users (lower(email));
