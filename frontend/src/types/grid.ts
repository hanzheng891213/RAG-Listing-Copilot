/** Shared shapes for the Excel-like product grid. */

/** A persisted row. `fields` mirrors the column model 1:1. */
export interface GridRow {
  id: string
  ownerId: string
  ownerName: string
  fields: Record<string, string>
  createdAt: string
  updatedAt: string
}

export type GridFieldType = 'text' | 'number'

export interface GridField {
  key: string
  /** Display label. Extra (uploaded) columns keep their raw header. */
  label: string
  width: number
  type: GridFieldType
  align?: 'left' | 'right'
  /** Columns the user may never edit, e.g. the computed id column. */
  readOnly?: boolean
  /** False for columns discovered from an upload, which can be hidden. */
  core?: boolean
}

/**
 * Layout is display-only. It never enters the save payload: a hidden column is
 * still written, and copying still maps by field key.
 */
export interface GridLayout {
  version: 1
  order: string[]
  hidden: string[]
  /** Number of leading *visible* columns frozen to the left. */
  fixedLeft: number
  /** Number of trailing *visible* columns frozen to the right. */
  fixedRight: number
  showRowNumber: boolean
}

export interface GridPage<T> {
  items: T[]
  totalItems: number
  currentPage: number
  itemsPerPage: number
  totalPages: number
  /** Set when the server has not got the table yet (migration pending). */
  tableMissing?: boolean
  /** Set when the dev server is serving from process memory. */
  ephemeral?: boolean
}

export interface GridSaveItem {
  id: string
  fields: Record<string, string>
}

export interface GridSavePayload {
  items: GridSaveItem[]
  deletedIds: string[]
}

export interface GridSaveResult {
  saved: GridRow[]
  deleted: string[]
  rejected: Array<{ id: string; reason: string }>
}

/** A rectangular selection, addressed by stable row id + field key. */
export interface GridSelection {
  anchorRowId: string
  anchorField: string
  focusRowId: string
  focusField: string
}

/** One import problem, grouped by row for display. */
export interface GridImportIssue {
  row: number
  field: string
  message: string
}

export interface GridImportSummary {
  added: number
  skipped: number
  issues: GridImportIssue[]
}
