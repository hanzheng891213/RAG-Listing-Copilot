-- Knowledge base document metadata.
-- Column names must match rowToDocRecord() in backend/src/services/knowledge/knowledgeService.ts
CREATE TABLE IF NOT EXISTS documents (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  category    TEXT NOT NULL,
  platform    TEXT NOT NULL DEFAULT '',
  tags        TEXT NOT NULL DEFAULT '[]',
  content     TEXT NOT NULL DEFAULT '',
  file_type   TEXT NOT NULL DEFAULT 'txt',
  file_size   INTEGER NOT NULL DEFAULT 0,
  chunk_count INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_documents_category ON documents (category);
CREATE INDEX IF NOT EXISTS idx_documents_platform ON documents (platform);
CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents (created_at DESC);
