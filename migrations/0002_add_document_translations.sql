-- Chinese display text. `title` / `content` stay the canonical English body,
-- which is what gets embedded and retrieved; the embedding model is English
-- only, so indexing the Chinese text would degrade retrieval. These columns
-- carry the translation the UI shows when the locale is Chinese.
ALTER TABLE documents ADD COLUMN title_zh TEXT NOT NULL DEFAULT '';
ALTER TABLE documents ADD COLUMN content_zh TEXT NOT NULL DEFAULT '';
