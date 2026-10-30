/**
 * Supplier product persistence for the Excel-like grid.
 *
 * The grid keeps a baseline of what it loaded and sends only the diff, so this
 * service is shaped around one batch call rather than per-row REST:
 *
 *   POST /api/products/batch  { items: [...], deletedIds: [...] }
 *
 * Two contracts matter for correctness on the client:
 *
 * 1. Deletes are idempotent. Deleting an id that is already gone is a success,
 *    not an error — the client retries deletions after a refresh to clean up
 *    rows the server only partially removed.
 * 2. Every saved row comes back with its persisted shape, keyed by the same id
 *    the client sent. The client writes those back into its data source and
 *    rebuilds the baseline from them; it never re-fetches for a pure edit.
 *
 * Dual backend, like the knowledge service: D1 on Cloudflare, an in-memory map
 * for the Express dev server (which has no database).
 */

export interface ProductRow {
  id: string
  ownerId: string
  ownerName: string
  fields: Record<string, string>
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface ProductRowInput {
  id: string
  fields: Record<string, string>
}

export interface SaveBatchInput {
  actor: { userId: string; userName: string; isAdmin: boolean }
  items: ProductRowInput[]
  deletedIds: string[]
}

export interface SaveBatchResult {
  saved: ProductRow[]
  deleted: string[]
  rejected: Array<{ id: string; reason: string }>
}

export interface ListResult {
  items: ProductRow[]
  totalItems: number
  currentPage: number
  itemsPerPage: number
  totalPages: number
  /** True when the migration has not been applied yet — the UI shows a hint. */
  tableMissing: boolean
  /** True when rows live in process memory and vanish on restart. */
  ephemeral: boolean
}

/** Ids are client-generated so a replayed batch stays idempotent. */
const ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/

export const MAX_BATCH_ITEMS = 500
export const MAX_FIELDS_PER_ROW = 40
export const MAX_FIELD_VALUE_LENGTH = 4000

function isTableMissing(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err)
  return /no such table/i.test(message)
}

function parseFields(raw: unknown): Record<string, string> {
  if (typeof raw !== 'string' || !raw) return {}
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    const out: Record<string, string> = {}
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === 'string') out[key] = value
      else if (value !== null && value !== undefined) out[key] = String(value)
    }
    return out
  } catch {
    return {}
  }
}

/** Reject whole rows, never individual cells: a partially written row is worse
 *  than a rejected one, because the client cannot tell what landed. */
function validateItem(item: ProductRowInput): string | null {
  if (!item || typeof item !== 'object') return 'invalid item'
  if (typeof item.id !== 'string' || !ID_PATTERN.test(item.id)) {
    return 'invalid id (must be 8-64 chars of A-Za-z0-9_-)'
  }
  if (!item.fields || typeof item.fields !== 'object' || Array.isArray(item.fields)) {
    return 'fields must be an object'
  }
  const entries = Object.entries(item.fields)
  if (entries.length > MAX_FIELDS_PER_ROW) {
    return `too many fields (max ${MAX_FIELDS_PER_ROW})`
  }
  for (const [key, value] of entries) {
    if (typeof key !== 'string' || !key || key.length > 64) return 'invalid field key'
    if (typeof value !== 'string') return `field "${key}" must be a string`
    if (value.length > MAX_FIELD_VALUE_LENGTH) {
      return `field "${key}" exceeds ${MAX_FIELD_VALUE_LENGTH} characters`
    }
  }
  return null
}

export class ProductService {
  private memory = new Map<string, ProductRow>()

  constructor(private db: any) {}

  /**
   * Bindings are per-request in a Worker, so the handle is refreshed on every
   * call. Keeping the service a singleton (rather than one per request) is what
   * lets the in-memory dev backend survive across requests.
   */
  bindDatabase(db: any): void {
    this.db = db
  }

  private get ephemeral(): boolean {
    return !this.db
  }

  async list(options: {
    page?: number
    pageSize?: number
    query?: string
  }): Promise<ListResult> {
    const pageSize = Math.min(Math.max(options.pageSize ?? 100, 1), 500)
    const page = Math.max(options.page ?? 1, 1)
    const query = (options.query ?? '').trim().toLowerCase()

    if (this.ephemeral) {
      let rows = [...this.memory.values()]
      if (query) {
        rows = rows.filter((r) =>
          Object.values(r.fields).some((v) => v.toLowerCase().includes(query)),
        )
      }
      rows.sort(
        (a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt),
      )
      const totalItems = rows.length
      return {
        items: rows.slice((page - 1) * pageSize, page * pageSize),
        totalItems,
        currentPage: page,
        itemsPerPage: pageSize,
        totalPages: Math.ceil(totalItems / pageSize),
        tableMissing: false,
        ephemeral: true,
      }
    }

    const empty: ListResult = {
      items: [],
      totalItems: 0,
      currentPage: page,
      itemsPerPage: pageSize,
      totalPages: 0,
      tableMissing: false,
      ephemeral: false,
    }

    try {
      const where: string[] = []
      const params: unknown[] = []
      if (query) {
        where.push('fields LIKE ?')
        params.push(`%${query}%`)
      }
      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

      const countRow = await this.db
        .prepare(`SELECT COUNT(*) AS total FROM supplier_products ${whereSql}`)
        .bind(...params)
        .first()
      const totalItems = Number(countRow?.total ?? 0)

      const offset = (page - 1) * pageSize
      const rows = await this.db
        .prepare(
          `SELECT * FROM supplier_products ${whereSql}
           ORDER BY sort_order ASC, created_at ASC
           LIMIT ? OFFSET ?`,
        )
        .bind(...params, pageSize, offset)
        .all()

      const items = (rows?.results ?? []).map((r: any) => this.rowFromDb(r))
      return {
        items,
        totalItems,
        currentPage: page,
        itemsPerPage: pageSize,
        totalPages: Math.ceil(totalItems / pageSize),
        tableMissing: false,
        ephemeral: false,
      }
    } catch (err) {
      if (isTableMissing(err)) return { ...empty, tableMissing: true }
      throw err
    }
  }

  /**
   * Upsert + delete in one call. Deletes run last: a row that is both edited
   * and deleted in the same batch (client bug, or a paste into a row that was
   * then removed) ends up deleted, which matches what the user last saw.
   */
  async saveBatch(input: SaveBatchInput): Promise<SaveBatchResult> {
    const { actor, items, deletedIds } = input

    if (items.length > MAX_BATCH_ITEMS) {
      throw new Error(`too many items in one batch (max ${MAX_BATCH_ITEMS})`)
    }

    const rejected: SaveBatchResult['rejected'] = []
    const accepted: ProductRowInput[] = []

    for (const item of items) {
      const reason = validateItem(item)
      if (reason) rejected.push({ id: String(item?.id ?? ''), reason })
      else accepted.push(item)
    }

    // Ownership: a non-admin may only write rows they own. Reading the owners
    // first is cheaper than a per-row UPDATE ... WHERE owner_id = ? retry loop,
    // and it lets us reject explicitly instead of silently dropping writes.
    const owners = await this.readOwners(accepted.map((i) => i.id))
    for (let i = accepted.length - 1; i >= 0; i--) {
      const owner = owners.get(accepted[i].id)
      if (!actor.isAdmin && owner && owner !== actor.userId) {
        rejected.push({ id: accepted[i].id, reason: 'not the owner of this row' })
        accepted.splice(i, 1)
      }
    }

    const now = new Date().toISOString()

    if (this.ephemeral) {
      accepted.forEach((item, index) => {
        const existing = this.memory.get(item.id)
        this.memory.set(item.id, {
          id: item.id,
          ownerId: existing?.ownerId || actor.userId,
          ownerName: actor.userName,
          fields: item.fields,
          sortOrder: index,
          createdAt: existing?.createdAt || now,
          updatedAt: now,
        })
      })
      for (const id of deletedIds) {
        if (!ID_PATTERN.test(id)) continue
        const existing = this.memory.get(id)
        if (!existing) continue
        if (actor.isAdmin || existing.ownerId === actor.userId) this.memory.delete(id)
      }
      return {
        saved: accepted.map((i) => this.memory.get(i.id)).filter((r): r is ProductRow => Boolean(r)),
        deleted: deletedIds.filter((id) => ID_PATTERN.test(id)),
        rejected,
      }
    }

    const statements: any[] = []

    accepted.forEach((item, index) => {
      statements.push(
        this.db
          .prepare(
            `INSERT INTO supplier_products
               (id, owner_id, owner_name, fields, sort_order, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               fields = excluded.fields,
               owner_name = excluded.owner_name,
               updated_at = excluded.updated_at`,
          )
          .bind(
            item.id,
            actor.userId,
            actor.userName,
            JSON.stringify(item.fields),
            index,
            now,
            now,
          ),
      )
    })

    // Deletes are scoped by owner for non-admins, and are a no-op when the row
    // is already gone — that is what makes the client's retry loop safe.
    for (const id of deletedIds) {
      if (!ID_PATTERN.test(id)) continue
      if (actor.isAdmin) {
        statements.push(this.db.prepare('DELETE FROM supplier_products WHERE id = ?').bind(id))
      } else {
        statements.push(
          this.db
            .prepare('DELETE FROM supplier_products WHERE id = ? AND owner_id = ?')
            .bind(id, actor.userId),
        )
      }
    }

    if (statements.length > 0) {
      await this.db.batch(statements)
    }

    const saved = accepted.length > 0 ? await this.readByIds(accepted.map((i) => i.id)) : []

    return {
      saved,
      // Report every requested delete as applied; the client verifies by
      // refreshing and re-sending anything that survived.
      deleted: deletedIds.filter((id) => ID_PATTERN.test(id)),
      rejected,
    }
  }

  private async readOwners(ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map()
    if (this.ephemeral) {
      const out = new Map<string, string>()
      for (const id of ids) {
        const row = this.memory.get(id)
        if (row) out.set(id, row.ownerId)
      }
      return out
    }
    const placeholders = ids.map(() => '?').join(',')
    const existing = await this.db
      .prepare(`SELECT id, owner_id FROM supplier_products WHERE id IN (${placeholders})`)
      .bind(...ids)
      .all()
    return new Map<string, string>(
      (existing?.results ?? []).map((r: any) => [String(r.id), String(r.owner_id)]),
    )
  }

  private async readByIds(ids: string[]): Promise<ProductRow[]> {
    const placeholders = ids.map(() => '?').join(',')
    const rows = await this.db
      .prepare(`SELECT * FROM supplier_products WHERE id IN (${placeholders})`)
      .bind(...ids)
      .all()
    const byId = new Map<string, ProductRow>(
      (rows?.results ?? []).map((r: any) => {
        const row = this.rowFromDb(r)
        return [row.id, row] as const
      }),
    )
    // Preserve request order so the client can zip results back positionally.
    return ids.map((id) => byId.get(id)).filter((r): r is ProductRow => Boolean(r))
  }

  private rowFromDb(row: any): ProductRow {
    return {
      id: String(row.id),
      ownerId: String(row.owner_id ?? ''),
      ownerName: String(row.owner_name ?? ''),
      fields: parseFields(row.fields),
      sortOrder: Number(row.sort_order ?? 0),
      createdAt: String(row.created_at ?? ''),
      updatedAt: String(row.updated_at ?? ''),
    }
  }
}

let instance: ProductService | null = null

/** The db handle is per-request in a Worker, so it is passed in each time. */
export function getProductService(db: any): ProductService {
  if (!instance) {
    instance = new ProductService(db)
  } else {
    instance.bindDatabase(db)
  }
  return instance
}

export function resetProductService(): void {
  instance = null
}
