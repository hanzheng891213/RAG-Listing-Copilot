import type { GridField, GridLayout, GridRow } from '@/types/grid'

/**
 * Field catalogue and row helpers.
 *
 * The column set is not fixed: an upload can carry arbitrary headers, so extra
 * keys are appended after the known columns and keep their raw header as label.
 * Everything here is pure so it can be unit-tested and reused by import/paste.
 */

/**
 * 商品上架表 columns, in reading order: the supplier's product name and SKU
 * identify the row, the generated listing content sits at the right of the
 * source fields it was derived from.
 */
export const CORE_FIELDS: GridField[] = [
  {
    key: 'productName',
    label: '商品名称',
    labelKey: 'grid.columns.productName',
    width: 220,
    type: 'text',
    core: true,
  },
  {
    key: 'sku',
    // Canonical label stays "SKU" so an exported CSV can be re-imported; the
    // zh/en i18n label also mentions 商品编号 for supplier sheets.
    label: 'SKU',
    labelKey: 'grid.columns.sku',
    width: 150,
    type: 'text',
    core: true,
  },
  {
    key: 'title',
    label: '产品标题',
    labelKey: 'grid.columns.title',
    width: 240,
    type: 'text',
    core: true,
  },
  {
    key: 'category',
    label: '类目',
    labelKey: 'grid.columns.category',
    width: 130,
    type: 'text',
    core: true,
  },
  {
    key: 'price',
    label: '价格',
    labelKey: 'grid.columns.price',
    width: 96,
    type: 'number',
    align: 'right',
    core: true,
  },
  {
    key: 'currency',
    label: '币种',
    labelKey: 'grid.columns.currency',
    width: 76,
    type: 'text',
    core: true,
  },
  // Cost columns feed the finance dashboard. They stay in the same dynamic
  // `fields` JSON as everything else, so imported sheets that already carry
  // these headers map onto them and no schema migration is needed.
  {
    key: 'costPrice',
    label: '采购成本',
    labelKey: 'grid.columns.costPrice',
    width: 110,
    type: 'number',
    align: 'right',
    core: true,
  },
  {
    key: 'shippingCost',
    label: '头程运费',
    labelKey: 'grid.columns.shippingCost',
    width: 110,
    type: 'number',
    align: 'right',
    core: true,
  },
  {
    key: 'commissionRate',
    label: '佣金率(%)',
    labelKey: 'grid.columns.commissionRate',
    width: 110,
    type: 'number',
    align: 'right',
    core: true,
  },
  {
    key: 'adCost',
    label: '广告费',
    labelKey: 'grid.columns.adCost',
    width: 100,
    type: 'number',
    align: 'right',
    core: true,
  },
  {
    key: 'otherCost',
    label: '其他成本',
    labelKey: 'grid.columns.otherCost',
    width: 110,
    type: 'number',
    align: 'right',
    core: true,
  },
  {
    key: 'moq',
    label: '起订量',
    labelKey: 'grid.columns.moq',
    width: 90,
    type: 'number',
    align: 'right',
    core: true,
  },
  {
    key: 'supplier',
    label: '供应商',
    labelKey: 'grid.columns.supplier',
    width: 150,
    type: 'text',
    core: true,
  },
  {
    key: 'description',
    label: '详情描述',
    labelKey: 'grid.columns.description',
    width: 320,
    type: 'text',
    core: true,
  },
  {
    key: 'bulletPoints',
    label: '五点描述',
    labelKey: 'grid.columns.bulletPoints',
    width: 320,
    type: 'text',
    core: true,
  },
  {
    key: 'keywords',
    label: '关键词',
    labelKey: 'grid.columns.keywords',
    width: 200,
    type: 'text',
    core: true,
  },
]

/**
 * Columns that must be present before an imported row counts as real data.
 * Title/category/price are optional: the listing generator derives them, and a
 * supplier sheet that only carries a name + SKU is still valid.
 */
export const REQUIRED_FIELDS = ['sku', 'productName'] as const

/** Fields the listing generator produces; regenerating ignores them as input. */
export const GENERATED_FIELDS = ['title', 'description', 'bulletPoints', 'keywords'] as const

/**
 * Internal cost columns. They must never be sent to the AI provider: they are
 * commercially sensitive and irrelevant to the listing copy, and every token
 * sent is billed.
 */
export const COST_FIELDS = [
  'costPrice',
  'shippingCost',
  'commissionRate',
  'adCost',
  'otherCost',
] as const

/**
 * True once a row carries generated listing details. A supplier sheet may
 * already carry a source title, so title alone is not proof: description or
 * bullet points are what the generator writes and what the row colours use.
 */
export function hasGeneratedListing(fields: Record<string, string> | undefined): boolean {
  if (!fields) return false
  return Boolean((fields.description ?? '').trim() || (fields.bulletPoints ?? '').trim())
}

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

  return withExtras(extras)
}

/**
 * Field descriptors for a loose value record (a listing-picker product, a modal
 * draft). Same core columns and extra-column cap as a grid row, so labels match
 * what the 上架表 shows.
 */
export function buildFieldsFromValues(values: Record<string, string>): GridField[] {
  const known = new Set(CORE_FIELDS.map((f) => f.key))
  const extras: string[] = []

  for (const key of Object.keys(values ?? {})) {
    if (known.has(key) || extras.includes(key)) continue
    if (extras.length >= MAX_EXTRA_COLUMNS) break
    extras.push(key)
  }

  return withExtras(extras)
}

function withExtras(extras: string[]): GridField[] {
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
 * a save, and including them would make every saved row look modified. It also
 * iterates the row's own keys rather than the column list, so merely gaining a
 * column (an import that introduces one) does not mark every row dirty.
 */
export function rowSignature(row: GridRow): string {
  const keys = Object.keys(row.fields ?? {}).sort()
  return keys.map((key) => `${key}\u0001${row.fields[key] ?? ''}`).join('\u0002')
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
  const fixedRight = clampInt(raw.fixedRight, 0, Math.max(0, maxLeft - fixedLeft))

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

// ── Import mapping ────────────────────────────────────────────────────

/**
 * Uploaded sheets use whatever headers the supplier typed. This table maps the
 * common Chinese/English spellings onto the canonical field keys; anything not
 * listed survives as its own extra column, so no data is silently dropped.
 */
const HEADER_ALIASES: Record<string, string> = {
  商品名称: 'productName',
  产品名称: 'productName',
  品名: 'productName',
  名称: 'productName',
  productname: 'productName',
  'product name': 'productName',
  name: 'productName',

  sku: 'sku',
  货号: 'sku',
  产品sku: 'sku',
  商品sku: 'sku',
  // A "商品编号" sheet is the same identity column as SKU. Mapping it here keeps
  // imports from treating the number as an unknown extra column and rejecting
  // every row for a missing SKU.
  商品编号: 'sku',
  商品编码: 'sku',
  产品编号: 'sku',
  产品编码: 'sku',
  商品货号: 'sku',
  产品货号: 'sku',
  货品编号: 'sku',
  商品料号: 'sku',
  产品料号: 'sku',
  料号: 'sku',
  sku编号: 'sku',
  sku编码: 'sku',
  'sku number': 'sku',
  skunumber: 'sku',
  'sku no': 'sku',
  'item number': 'sku',
  'item no': 'sku',
  itemno: 'sku',
  'product number': 'sku',
  'product no': 'sku',
  productnumber: 'sku',
  'product id': 'sku',
  productid: 'sku',
  'part number': 'sku',
  'part no': 'sku',
  partno: 'sku',

  产品标题: 'title',
  标题: 'title',
  title: 'title',

  类目: 'category',
  分类: 'category',
  category: 'category',

  价格: 'price',
  单价: 'price',
  price: 'price',

  币种: 'currency',
  货币: 'currency',
  currency: 'currency',

  采购成本: 'costPrice',
  成本价: 'costPrice',
  成本: 'costPrice',
  costprice: 'costPrice',
  'cost price': 'costPrice',
  cost: 'costPrice',

  头程运费: 'shippingCost',
  运费: 'shippingCost',
  物流费: 'shippingCost',
  shippingcost: 'shippingCost',
  'shipping cost': 'shippingCost',
  shipping: 'shippingCost',
  freight: 'shippingCost',

  佣金率: 'commissionRate',
  佣金比例: 'commissionRate',
  佣金: 'commissionRate',
  commissionrate: 'commissionRate',
  'commission rate': 'commissionRate',
  commission: 'commissionRate',

  广告费: 'adCost',
  广告成本: 'adCost',
  adcost: 'adCost',
  'ad cost': 'adCost',
  'ad spend': 'adCost',

  其他成本: 'otherCost',
  其它成本: 'otherCost',
  杂费: 'otherCost',
  othercost: 'otherCost',
  'other cost': 'otherCost',

  起订量: 'moq',
  最小起订量: 'moq',
  moq: 'moq',

  供应商: 'supplier',
  supplier: 'supplier',

  详情描述: 'description',
  描述: 'description',
  产品描述: 'description',
  description: 'description',

  五点描述: 'bulletPoints',
  五点: 'bulletPoints',
  卖点: 'bulletPoints',
  bulletpoints: 'bulletPoints',
  'bullet points': 'bulletPoints',
  bullets: 'bulletPoints',

  关键词: 'keywords',
  关键字: 'keywords',
  keywords: 'keywords',
}

function aliasOf(header: string): string {
  const key = header.trim()
  if (!key) return ''
  return HEADER_ALIASES[key] ?? HEADER_ALIASES[key.toLowerCase()] ?? ''
}

/**
 * Maps one parsed spreadsheet record onto grid fields.
 *
 * Aliased headers become core columns; unmapped headers keep their raw label so
 * they still render as extra columns. When both an alias and the canonical key
 * are present the alias wins only if the canonical value is empty.
 */
export function normaliseImportRecord(record: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  const extras: Array<[string, string]> = []

  for (const [header, rawValue] of Object.entries(record ?? {})) {
    const value = typeof rawValue === 'string' ? rawValue.trim() : String(rawValue ?? '').trim()
    const mapped = aliasOf(header)
    if (!mapped) {
      if (value) extras.push([header.trim() || header, value])
      continue
    }
    // First non-empty spelling wins: a sheet that carries both 商品名称 and
    // product_name must not let the empty one blank the filled one.
    if (value && !out[mapped]) out[mapped] = value
  }

  for (const [header, value] of extras) {
    if (!(header in out)) out[header] = value
  }

  return out
}

/** Fields sent to the generator: source columns only, never past output or costs. */
export function sourceFields(fields: Record<string, string>): Record<string, string> {
  const excluded = new Set<string>([...GENERATED_FIELDS, ...COST_FIELDS])
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(fields ?? {})) {
    if (excluded.has(key)) continue
    if (!value) continue
    out[key] = value
  }
  return out
}

/** Five bullet points are stored as one newline-separated cell. */
export function bulletPointsToCell(points: string[]): string {
  return (points ?? []).map((point) => point.trim()).filter(Boolean).join('\n')
}

export function cellToBulletPoints(cell: string): string[] {
  return (cell ?? '')
    .split(/\r?\n|\s*\|\s*/)
    .map((point) => point.trim())
    .filter(Boolean)
}
