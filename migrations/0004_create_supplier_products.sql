-- Supplier products edited in the Excel-like grid.
--
-- Previously the parsed supplier rows lived only in the browser (Pinia +
-- localStorage), which meant a reload on another machine lost them and two
-- tabs could disagree. This table is the durable source of truth; the grid
-- keeps a baseline of what it loaded and only writes the diff.
--
-- `fields` is a JSON object of column key -> string value. The column set is
-- not fixed: uploads can carry arbitrary headers, so extra keys are stored
-- as-is and the grid appends them after the known columns.
CREATE TABLE IF NOT EXISTS supplier_products (
  id          TEXT PRIMARY KEY,
  owner_id    TEXT NOT NULL,
  owner_name  TEXT NOT NULL DEFAULT '',
  fields      TEXT NOT NULL DEFAULT '{}',
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

-- The grid always lists newest-first within one owner scope.
CREATE INDEX IF NOT EXISTS idx_supplier_products_created
  ON supplier_products (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_supplier_products_owner
  ON supplier_products (owner_id, created_at DESC);
