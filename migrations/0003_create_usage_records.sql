-- Model API usage. Previously held in a module-level array, which a Worker
-- drops on every cold start, so the stats panel reset to zero at random.
-- Durable storage lets a logged-in user see their usage across restarts.
CREATE TABLE IF NOT EXISTS usage_records (
  id                TEXT PRIMARY KEY,
  created_at        TEXT NOT NULL,
  provider_id       TEXT NOT NULL,
  model_id          TEXT NOT NULL DEFAULT '',
  prompt_tokens     INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  cost              REAL NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_usage_created_at ON usage_records (created_at DESC);
