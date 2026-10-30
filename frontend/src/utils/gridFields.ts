import type { GridField, GridLayout, GridRow } from '@/types/grid'

/**
 * Field catalogue and row helpers.
 *
 * The column set is not fixed: an upload can carry arbitrary headers, so extra
 * keys are appended after the known columns and keep their raw header as label.
 * Everything here is pure so it can be unit-tested and reused by import/paste.
 */

export const CORE_FIELDS: GridField[] = [
  { key: 'title', label: '产品标题', width: 260, type: 'text', core: true },
  { key: 'sku', label: 'SKU', width: 130, type: 'text', core: true },
  { key: 'category', label: '类目', width: 140, type: 'text', core: true },
  { key: 'price', label: '价格', width: 100, type: 'number', align: 'right', core: true },
  { key: 'currency', label: '币种', width: 80, type: 'text', core: true },
  { key: 'moq', label: '起订量', width: 90, type: 'number', align: 'right', core: true },
  { key: 'supplier', label: '供应商', width: 160, type: 'text', core: true },
  { key: 'description', label: '描述', width: 320, type: 'text', core: true },
]

/** Columns that must be present before a row counts as real data. */
export const REQUIRED_FIELDS = ['title'] as const

const EXTRA_WIDTH = 160
const MAX_EXTRA_COLUMNS = 20

/**
 * Core columns plus any unknown keys found in the data, in first-seen order,
 * capped so a malformed upload cannot produce 400 columns.
 */
export function buildFields(rows: GridRow[]): GridField[] {
  const known = new Set(CORE_FIELDS.map((f) => f.key))
  const extras: string[] = []

  for (const row of rows) {
    for (const key of Object.keys(row.fields ?? {})) {
      if (known.has(key) || extras.includes(key)) continue
      if (extras.length >= MAX_EXTRA_COLUMNS) break
      extras.push(key)
    }
  }

  return [
    ...CORE_FIELDS,
    ...extras.map<GridField>((key) => ({
      key,
      label: key,
      width: EXTRA_WIDTH,
      type: 'text',
      core: false,
    })),
  ]
}

/** Present-but-empty core columns are fine; a row with no values is a draft. */
export function isBlankRow(row: GridRow, fields: GridField[]): boolean {
  return fields.every((field) => !(row.fields?.[field.key] ?? '').trim())
}

/**
 * Business signature used for dirty detection.
 *
 * Deliberately excludes id/owner/timestamps: the server writes those back after
 * a save, and including them would make every saved row look modified.
 */
export function rowSignature(row: GridRow, fields: GridField[]): string {
  return fields
    .map((field) => `${field.key}\u0001${row.fields?.[field.key] ?? ''}`)
    .join('\u0002')
}

export function cloneRow(row: GridRow): GridRow {
  return {
    id: row.id,
    ownerId: row.ownerId,
    ownerName: row.ownerName,
    fields: { ...row.fields },
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

/** Client-side row id: stable, non-temporary, safe to replay on retry. */
export function createRowId(): string {
  const random = Math.random().toString(36).slice(2, 10)
  return `p_${Date.now().toString(36)}_${random}`
}

export function createBlankRow(ownerId: string, ownerName: string): GridRow {
  return {
    id: createRowId(),
    ownerId,
    ownerName,
    fields: {},
    createdAt: '',
    updatedAt: '',
  }
}

/** Index of the first row of the trailing blank block, or rows.length. */
export function trailingDraftStart(rows: GridRow[], fields: GridField[]): number {
  let index = rows.length
  while (index > 0 && isBlankRow(rows[index - 1], fields)) index -= 1
  return index
}

export function defaultLayout(fields: GridField[]): GridLayout {
  return {
    version: 1,
    order: fields.map((f) => f.key),
    hidden: [],
    fixedLeft: 0,
    fixedRight: 0,
    showRowNumber: true,
  }
}

/**
 * Repairs a stored layout against the current field set: unknown keys dropped,
 * new fields appended, hidden filtered, freeze counts clamped so left and right
 * can never overlap. A stale layout must never break the grid.
 */
export function normaliseLayout(input: unknown, fields: GridField[]): GridLayout {
  const base = defaultLayout(fields)
  if (!input || typeof input !== 'object') return base

  const raw = input as Partial<GridLayout>
  const keys = fields.map((f) => f.key)
  const known = new Set(keys)

  const seen = new Set<string>()
  const order: string[] = []
  for (const key of Array.isArray(raw.order) ? raw.order : []) {
    if (typeof key === 'string' && known.has(key) && !seen.has(key)) {
      seen.add(key)
      order.push(key)
    }
  }
  for (const key of keys) {
    if (!seen.has(key)) order.push(key)
  }

  const hidden = (Array.isArray(raw.hidden) ? raw.hidden : []).filter(
    (key): key is string => typeof key === 'string' && known.has(key),
  )

  const visible = order.filter((key) => !hidden.includes(key))
  const maxLeft = Math.max(0, visible.length - 1)
  let fixedLeft = clampInt(raw.fixedLeft, 0, maxLeft)
  let fixedRight = clampInt(raw.fixedRight, 0, Math.max(0, maxLeft - fixedLeft))

  // Row-number column occupies the first sticky slot, leaving one less for the
  // left freeze; otherwise the last data column would be pinned under it.
  if (raw.showRowNumber !== false && fixedLeft + fixedRight >= visible.length) {
    fixedLeft = Math.max(0, visible.length - 1 - fixedRight)
  }

  return {
    version: 1,
    order,
    hidden,
    fixedLeft,
    fixedRight,
    showRowNumber: raw.showRowNumber !== false,
  }
}

function clampInt(value: unknown, min: number, max: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : min
  return Math.min(Math.max(n, min), max)
}
