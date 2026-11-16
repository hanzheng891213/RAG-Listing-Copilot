-- Real accounts + per-user model configuration.
--
-- Replaces the hardcoded, in-memory account list and the API keys that used to
-- live in localStorage. Passwords are PBKDF2-SHA256 records (60k iterations);
-- `username_lower` carries the case-insensitive uniqueness rule so "Tom" and
-- "tom" cannot both register.
--
-- The seed rows keep the existing owner account (same username and password,
-- new hash) and the demo visitor. INSERT OR IGNORE means re-running this
-- migration never overwrites a password the owner changed later.

CREATE TABLE IF NOT EXISTS users (
  id                  TEXT PRIMARY KEY,
  username            TEXT NOT NULL,
  username_lower      TEXT NOT NULL,
  password_hash       TEXT NOT NULL,
  role                TEXT NOT NULL DEFAULT 'user',
  permissions         TEXT NOT NULL DEFAULT '[]',
  disabled            INTEGER NOT NULL DEFAULT 0,
  active_provider_id  TEXT NOT NULL DEFAULT '',
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_lower
  ON users (username_lower);

CREATE INDEX IF NOT EXISTS idx_users_created
  ON users (created_at);

CREATE TABLE IF NOT EXISTS user_model_configs (
  user_id          TEXT NOT NULL,
  provider_id      TEXT NOT NULL,
  provider_name    TEXT NOT NULL DEFAULT '',
  base_url         TEXT NOT NULL DEFAULT '',
  model            TEXT NOT NULL DEFAULT '',
  api_key_cipher   TEXT NOT NULL DEFAULT '',
  api_key_iv       TEXT NOT NULL DEFAULT '',
  key_last4        TEXT NOT NULL DEFAULT '',
  temperature      REAL NOT NULL DEFAULT 0.7,
  max_tokens       INTEGER NOT NULL DEFAULT 4096,
  updated_at       TEXT NOT NULL,
  PRIMARY KEY (user_id, provider_id)
);

CREATE INDEX IF NOT EXISTS idx_user_model_configs_user
  ON user_model_configs (user_id);

-- Owner account: password unchanged, permissions unchanged. The hash below is
-- PBKDF2, not the old bcrypt value (bcryptjs exceeded the Workers free CPU
-- budget). Regenerate with: node scripts/hash-password.mjs <password>
INSERT OR IGNORE INTO users
  (id, username, username_lower, password_hash, role, permissions, disabled, created_at, updated_at)
VALUES
  (
    'admin-001',
    'hanzheng891213@gmail.com',
    'hanzheng891213@gmail.com',
    'pbkdf2$sha256$60000$jU5id4y6eP/sooT9hkn5qg==$ypLzRxN3hO7wxc/aO0MaUc3SQMetSVWMZx1CbXB3wbE=',
    'admin',
    '["productGrid","listingGenerator","knowledgeBase","modelManager","finance"]',
    0,
    '2026-05-31T00:00:00.000Z',
    '2026-05-31T00:00:00.000Z'
  );

-- Demo visitor: kept deliberately, but now has only the table page. Grant more
-- from the permission page if this account is still used for demos.
INSERT OR IGNORE INTO users
  (id, username, username_lower, password_hash, role, permissions, disabled, created_at, updated_at)
VALUES
  (
    'visitor-001',
    'O_O@visitor.com',
    'o_o@visitor.com',
    'pbkdf2$sha256$60000$RQXshVYijb1uoFKjK/s/sA==$UzIuSj7wfBKZ6Az9AeEIZMCYCwY0d8WOvza0rdnK0Jc=',
    'user',
    '["productGrid","listingGenerator","knowledgeBase"]',
    0,
    '2026-05-31T00:00:00.000Z',
    '2026-05-31T00:00:00.000Z'
  );
