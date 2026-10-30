import { computed, onBeforeUnmount, ref } from 'vue'
import type {
  GridField,
  GridImportIssue,
  GridLayout,
  GridRow,
  GridSaveItem,
  GridSelection,
} from '@/types/grid'
import { saveProductBatch } from '@/api/products'
import {
  buildFields,
  cloneRow,
  createBlankRow,
  defaultLayout,
  isBlankRow,
  normaliseLayout,
  rowSignature,
  trailingDraftStart,
} from '@/utils/gridFields'
import { normaliseCell } from '@/utils/tsv'
import { loadLayout, saveLayout, type LayoutKind } from '@/utils/layoutStorage'
import { useGridQuery } from './useGridQuery'

/**
 * The grid's editing state machine.
 *
 * Three data sets, and nothing else may hold editing state:
 *
 *   server rows (immutable snapshot from a page load)
 *     -> rows       (the only editing source, includes trailing draft rows)
 *   baseline        (id -> signature + original row, for dirty/save/discard)
 *
 * Invariants this file is responsible for:
 *  - blank trailing rows are UI, never data: not dirty, not saved, not saved back
 *  - every write path checks `canEdit` (cell, paste, import, save)
 *  - one batch request per save; deletes are derived as baseline minus current
 *  - every await re-checks identity and request number before applying results
 *  - `dirty` and `summary` are only ever assigned by `refreshSummary()`
 */

export type GridNotice = { message: string; type: 'success' | 'warning' | 'error' | 'info' }

export interface UseProductGridOptions {
  gridName: string
  /** Stable per-user key for private layout isolation. */
  identity: () => string
  /** Owner or admin, and the grid is not mid-save. */
  canEdit: (row: GridRow) => boolean
  pageSize?: number
  onNotice?: (notice: GridNotice) => void
}

interface BaselineEntry {
  signature: string
  row: GridRow
}

interface WriteOutcome {
  ok: boolean
  saved: number
  rejected: number
}

const SUMMARY_DEBOUNCE_MS = 120
const PULSE_MS = 6_000
const DELETE_RETRY_LIMIT = 3
const MAX_FIELD_LENGTH = 4_000

export function useProductGrid(options: UseProductGridOptions) {
  const gridName = options.gridName
  const pageSize = options.pageSize ?? 100

  // ── State ─────────────────────────────────────────────────────────
  const rows = ref<GridRow[]>([])
  const fields = ref<GridField[]>(buildFields([]))
  const layout = ref<GridLayout>(defaultLayout(fields.value))

  const initializing = ref(true)
  const loading = ref(false)
  const mutating = ref(false)
  const saving = ref(false)
  const savingIds = ref<string[]>([])
  const pulseIds = ref<string[]>([])
  const dirty = ref(false)
  const summary = ref({ added: 0, modified: 0, deleted: 0 })
  const cellErrors = ref<Record<string, string>>({})

  const page = ref(1)
  const totalItems = ref(0)
  const totalPages = ref(0)
  const tableMissing = ref(false)
  const ephemeral = ref(false)
  const search = ref('')

  const query = useGridQuery()
  const baseline = new Map<string, BaselineEntry>()

  let summaryTimer: ReturnType<typeof setTimeout> | null = null
  const pulseTimers = new Map<string, ReturnType<typeof setTimeout>>()

  let ownerResolver: () => { id: string; name: string } = () => ({ id: '', name: '' })

  const visibleFields = computed(() =>
    layout.value.order
      .filter((key) => !layout.value.hidden.includes(key))
      .map((key) => fields.value.find((f) => f.key === key))
      .filter((f): f is GridField => Boolean(f)),
  )

  const draftStart = computed(() => trailingDraftStart(rows.value, fields.value))
  const hasDraftRows = computed(() => draftStart.value < rows.value.length)

  function notify(notice: GridNotice): void {
    options.onNotice?.(notice)
  }

  const identity = () => options.identity()
  const currentOwner = () => ownerResolver()
  function setOwnerResolver(fn: () => { id: string; name: string }): void {
    ownerResolver = fn
  }

  // ── Loading ───────────────────────────────────────────────────────

  /** Rebuilds fields + layout from a fresh page. Stored layout is repaired, not trusted. */
  function adoptLayout(): void {
    fields.value = buildFields(rows.value)
    const stored =
      loadLayout('current', gridName, identity()) ?? loadLayout('default', gridName, identity())
    layout.value = normaliseLayout(stored ?? defaultLayout(fields.value), fields.value)
  }

  function applyServerRows(items: GridRow[]): void {
    rows.value = items.map(cloneRow)
    adoptLayout()
    baseline.clear()
    for (const row of rows.value) {
      baseline.set(row.id, { signature: rowSignature(row, fields.value), row: cloneRow(row) })
    }
    cellErrors.value = {}
    refreshSummary()
    // A page of real rows must still end with one editable blank row.
    ensureDraftRows()
  }

  async function loadPage(targetPage: number, opts: { silent?: boolean } = {}): Promise<void> {
    const stamp = identity()
    const nextPage = Math.max(1, targetPage)
    if (!opts.silent) loading.value = true

    try {
      const result = await query.fetchPage({
        page: nextPage,
        pageSize,
        q: search.value.trim() || undefined,
      })
      // Superseded by a newer request: drop it rather than flicker the grid.
      if (!result) return
      // Identity switched mid-flight: never paint another user's rows.
      if (identity() !== stamp) return

      page.value = result.currentPage
      totalItems.value = result.totalItems
      totalPages.value = result.totalPages
      tableMissing.value = Boolean(result.tableMissing)
      ephemeral.value = Boolean(result.ephemeral)
      applyServerRows(result.items ?? [])
    } finally {
      if (!opts.silent) loading.value = false
    }
  }

  async function reload(): Promise<void> {
    query.clear()
    await loadPage(page.value, { silent: true })
  }

  /**
   * First frame: header plus one draft row before any request resolves, so the
   * user never sees "blank page -> spinner -> table".
   */
  function initEmpty(): void {
    if (rows.value.length === 0) {
      const owner = currentOwner()
      rows.value = [createBlankRow(owner.id, owner.name)]
    }
    adoptLayout()
  }

  // ── Summary: the only writer of dirty/summary ─────────────────────

  function collectChanges(): {
    items: GridSaveItem[]
    deletedIds: string[]
    added: number
    modified: number
    deleted: number
  } {
    const items: GridSaveItem[] = []
    let added = 0
    let modified = 0

    for (const row of rows.value) {
      // C2/C16: a blank row is UI, not data.
      if (isBlankRow(row, fields.value)) continue
      const entry = baseline.get(row.id)
      if (!entry) {
        items.push({ id: row.id, fields: { ...row.fields } })
        added += 1
        continue
      }
      if (rowSignature(row, fields.value) !== entry.signature) {
        items.push({ id: row.id, fields: { ...row.fields } })
        modified += 1
      }
    }

    // Present rows win: a row the user cleared back to blank is a delete.
    const present = new Set(
      rows.value.filter((row) => !isBlankRow(row, fields.value)).map((row) => row.id),
    )
    const deletedIds: string[] = []
    for (const id of baseline.keys()) {
      if (!present.has(id)) deletedIds.push(id)
    }

    return { items, deletedIds, added, modified, deleted: deletedIds.length }
  }

  function refreshSummary(): void {
    if (mutating.value || saving.value) return
    const changes = collectChanges()
    summary.value = {
      added: changes.added,
      modified: changes.modified,
      deleted: changes.deleted,
    }
    dirty.value = changes.added > 0 || changes.modified > 0 || changes.deleted > 0
  }

  /** 120ms coalescing: typing must not scan the whole grid on every keystroke. */
  function scheduleSummary(): void {
    if (summaryTimer) clearTimeout(summaryTimer)
    summaryTimer = setTimeout(() => {
      summaryTimer = null
      ensureDraftRows()
      refreshSummary()
    }, SUMMARY_DEBOUNCE_MS)
  }

  function ensureDraftRows(): void {
    // `initializing` must NOT block this: the draft row has to be there while
    // the first page is still loading, otherwise the table looks read-only.
    if (saving.value) return
    const start = trailingDraftStart(rows.value, fields.value)
    if (rows.value.length - start < 1) {
      const owner = currentOwner()
      rows.value.push(createBlankRow(owner.id, owner.name))
    }
  }

  // ── Cell edits ────────────────────────────────────────────────────

  function findRow(rowId: string): GridRow | undefined {
    return rows.value.find((row) => row.id === rowId)
  }

  function setCell(rowId: string, field: string, value: string): boolean {
    if (saving.value || mutating.value) return false
    const row = findRow(rowId)
    if (!row) return false
    if (!options.canEdit(row)) return false

    const meta = fields.value.find((f) => f.key === field)
    if (!meta || meta.readOnly) return false
    if ((row.fields[field] ?? '') === value) return false

    row.fields[field] = value
    // A draft row becomes real on first edit; it belongs to whoever typed.
    if (!row.ownerId) {
      const owner = currentOwner()
      row.ownerId = owner.id
      row.ownerName = owner.name
    }

    const errorKey = `${rowId}|${field}`
    if (cellErrors.value[errorKey]) {
      const next = { ...cellErrors.value }
      delete next[errorKey]
      cellErrors.value = next
    }

    scheduleSummary()
    return true
  }

  function addRow(atIndex?: number): string {
    // New rows go before the trailing draft block, so the user never has to
    // scroll past blank rows to find what they just created.
    const insertAt = atIndex ?? trailingDraftStart(rows.value, fields.value)
    const owner = currentOwner()
    const row = createBlankRow(owner.id, owner.name)
    rows.value.splice(Math.min(insertAt, rows.value.length), 0, row)
    scheduleSummary()
    return row.id
  }

  function deleteRows(ids: string[]): { deleted: number; skipped: number } {
    const doomed = new Set<string>()
    let skipped = 0

    for (const id of ids) {
      const row = findRow(id)
      if (!row) continue
      // Blank rows are not data; other people's rows are not ours to delete.
      if (isBlankRow(row, fields.value) || !options.canEdit(row)) {
        skipped += 1
        continue
      }
      doomed.add(id)
    }

    if (doomed.size === 0) return { deleted: 0, skipped }

    rows.value = rows.value.filter((row) => !doomed.has(row.id))
    ensureDraftRows()
    refreshSummary()
    return { deleted: doomed.size, skipped }
  }

  function discardChanges(): void {
    rows.value = [...baseline.values()].map((entry) => cloneRow(entry.row))
    cellErrors.value = {}
    ensureDraftRows()
    refreshSummary()
  }

  // ── Validation ────────────────────────────────────────────────────

  function validateRow(row: GridRow): GridImportIssue[] {
    const issues: GridImportIssue[] = []
    const title = (row.fields.title ?? '').trim()
    if (!title) {
      issues.push({ row: 0, field: 'title', message: '标题不能为空' })
    }
    for (const meta of fields.value) {
      const value = row.fields[meta.key] ?? ''
      if (value.length > MAX_FIELD_LENGTH) {
        issues.push({ row: 0, field: meta.key, message: `超过 ${MAX_FIELD_LENGTH} 字符` })
        continue
      }
      if (meta.type === 'number' && value.trim() !== '') {
        if (normaliseCell(value, 'number') === null) {
          issues.push({ row: 0, field: meta.key, message: '必须是数字' })
        }
      }
    }
    return issues
  }

  function applyRowErrors(rowId: string, issues: GridImportIssue[]): void {
    const next = { ...cellErrors.value }
    for (const issue of issues) {
      next[`${rowId}|${issue.field}`] = issue.message
    }
    cellErrors.value = next
  }

  // ── Paste ─────────────────────────────────────────────────────────

  /**
   * Writes a pasted matrix starting at the selection anchor.
   *
   * All-or-nothing: every cell is normalised first, and nothing is written if
   * any cell fails. Read-only rows are skipped (and counted) rather than
   * aborting the whole paste, which is what Excel users expect when a sheet
   * mixes locked and unlocked rows.
   */
  function applyPaste(
    anchor: GridSelection | null,
    matrix: string[][],
    opts: { fillSelection?: GridSelection | null } = {},
  ): { written: number; skipped: number; issues: GridImportIssue[] } {
    const cols = visibleFields.value
    const issues: GridImportIssue[] = []

    if (matrix.length === 0) return { written: 0, skipped: 0, issues }
    if (cols.length === 0) {
      return { written: 0, skipped: 0, issues: [{ row: 0, field: '', message: '没有可写入的列' }] }
    }

    // Resolve the anchor to an index pair; no selection means "from the top".
    let startRow = 0
    let startCol = 0
    if (anchor) {
      const rowIndex = rows.value.findIndex((row) => row.id === anchor.anchorRowId)
      const colIndex = cols.findIndex((field) => field.key === anchor.anchorField)
      if (rowIndex >= 0 && colIndex >= 0) {
        startRow = rowIndex
        startCol = colIndex
      }
    }

    // Single value into a range fills the range (Excel behaviour).
    const fill = opts.fillSelection
    if (matrix.length === 1 && matrix[0].length === 1 && fill) {
      const from = rows.value.findIndex((row) => row.id === fill.anchorRowId)
      const to = rows.value.findIndex((row) => row.id === fill.focusRowId)
      const c1 = cols.findIndex((field) => field.key === fill.anchorField)
      const c2 = cols.findIndex((field) => field.key === fill.focusField)
      if (from >= 0 && to >= 0 && c1 >= 0 && c2 >= 0) {
        const r1 = Math.min(from, to)
        const r2 = Math.max(from, to)
        const k1 = Math.min(c1, c2)
        const k2 = Math.max(c1, c2)
        const width = k2 - k1 + 1
        matrix = Array.from({ length: r2 - r1 + 1 }, () =>
          Array.from({ length: width }, () => matrix[0][0]),
        )
        startRow = r1
        startCol = k1
      }
    }

    if (startCol + matrix[0].length > cols.length) {
      return {
        written: 0,
        skipped: 0,
        issues: [{ row: 0, field: '', message: '粘贴内容超出最右侧列' }],
      }
    }

    // Grow the row set first: one splice, not one per missing row.
    const needed = startRow + matrix.length
    while (rows.value.length < needed) {
      const owner = currentOwner()
      rows.value.push(createBlankRow(owner.id, owner.name))
    }

    interface PlannedWrite {
      rowIndex: number
      key: string
      value: string
    }
    const planned: PlannedWrite[] = []
    let skipped = 0

    for (let r = 0; r < matrix.length; r++) {
      const row = rows.value[startRow + r]
      if (!row) break
      if (!options.canEdit(row)) {
        skipped += 1
        continue
      }
      for (let c = 0; c < matrix[r].length; c++) {
        const field = cols[startCol + c]
        if (!field || field.readOnly) continue
        const normalised = normaliseCell(matrix[r][c] ?? '', field.type)
        if (normalised === null) {
          issues.push({
            row: startRow + r + 1,
            field: field.key,
            message: `"${matrix[r][c]}" 不是合法的${field.type === 'number' ? '数字' : '文本'}`,
          })
          continue
        }
        planned.push({ rowIndex: startRow + r, key: field.key, value: normalised })
      }
    }

    if (issues.length > 0) {
      // Nothing written: the caller shows the issues so the user can fix the block.
      ensureDraftRows()
      scheduleSummary()
      return { written: 0, skipped, issues }
    }

    const touched: string[] = []
    for (const write of planned) {
      const row = rows.value[write.rowIndex]
      if (!row) continue
      row.fields[write.key] = write.value
      if (!row.ownerId) {
        const owner = currentOwner()
        row.ownerId = owner.id
        row.ownerName = owner.name
      }
      if (!touched.includes(row.id)) touched.push(row.id)
    }

    // 6s pulse shows which rows a bulk write landed on.
    if (touched.length > 1) startBatchPulse(touched)
    ensureDraftRows()
    scheduleSummary()

    return { written: planned.length, skipped, issues: [] }
  }

  // ── Import ────────────────────────────────────────────────────────

  /**
   * Appends parsed rows (from an .xlsx/.csv upload) before the draft block, so
   * imported data never lands underneath the empty rows at the bottom.
   * Bad rows are skipped individually and reported per row, unlike paste.
   */
  function importRecords(
    records: Array<Record<string, string>>,
    firstLine = 2,
  ): { added: number; skipped: number; issues: GridImportIssue[] } {
    const issues: GridImportIssue[] = []
    const insertAt = trailingDraftStart(rows.value, fields.value)
    const owner = currentOwner()
    const accepted: GridRow[] = []

    records.forEach((record, index) => {
      const line = firstLine + index
      const row = createBlankRow(owner.id, owner.name)
      row.fields = { ...record }
      const rowIssues = validateRow(row)
      if (rowIssues.length > 0) {
        for (const issue of rowIssues) issues.push({ ...issue, row: line })
        return
      }
      accepted.push(row)
    })

    if (accepted.length > 0) {
      rows.value.splice(insertAt, 0, ...accepted)
      adoptLayout()
    }
    ensureDraftRows()
    scheduleSummary()

    return { added: accepted.length, skipped: records.length - accepted.length, issues }
  }

  // ── Writing ───────────────────────────────────────────────────────

  /** Stable per-row writability re-check: the last line of defence before a request. */
  function writableRows(items: GridSaveItem[]): GridSaveItem[] {
    return items.filter((item) => {
      const row = findRow(item.id)
      return Boolean(row && options.canEdit(row))
    })
  }

  /**
   * Contract check on the batch response. A server that silently drops rows
   * would otherwise leave the baseline claiming data that does not exist.
   */
  function verifySaved(items: GridSaveItem[], saved: GridRow[]): string[] {
    const requested = new Set(items.map((item) => item.id))
    const returned = new Set(saved.map((row) => row.id))
    const problems: string[] = []

    for (const id of requested) {
      if (!returned.has(id)) problems.push(`缺少回写行 ${id}`)
    }
    for (const row of saved) {
      if (!requested.has(row.id)) problems.push(`回写了未请求的行 ${row.id}`)
    }
    return problems
  }

  function applySavedRows(saved: GridRow[]): void {
    for (const persisted of saved) {
      const row = findRow(persisted.id)
      if (!row) continue
      row.fields = { ...persisted.fields }
      row.ownerId = persisted.ownerId || row.ownerId
      row.ownerName = persisted.ownerName || row.ownerName
      row.createdAt = persisted.createdAt || row.createdAt
      row.updatedAt = persisted.updatedAt
      baseline.set(persisted.id, {
        signature: rowSignature(row, fields.value),
        row: cloneRow(row),
      })
    }
  }

  /** Deletes can be partially applied server-side; retry until the list is clean. */
  async function compensateDeletions(ids: string[]): Promise<string[]> {
    let remaining = [...ids]
    for (let attempt = 0; attempt < DELETE_RETRY_LIMIT && remaining.length > 0; attempt++) {
      await loadPage(page.value, { silent: true })
      const present = new Set(rows.value.map((row) => row.id))
      remaining = remaining.filter((id) => present.has(id))
      if (remaining.length === 0) break
      await saveProductBatch({ items: [], deletedIds: remaining })
    }
    return remaining
  }

  async function writeBatch(
    items: GridSaveItem[],
    deletedIds: string[],
  ): Promise<WriteOutcome> {
    if (items.length === 0 && deletedIds.length === 0) {
      return { ok: true, saved: 0, rejected: 0 }
    }

    // C7: a save that started for user A must not land after a switch to user B.
    const stamp = identity()

    const response = await saveProductBatch({ items, deletedIds })
    if (identity() !== stamp) {
      return { ok: false, saved: 0, rejected: 0 }
    }

    const saved = Array.isArray(response.saved) ? response.saved : []
    applySavedRows(saved)

    const problems = verifySaved(items, saved)
    if (problems.length > 0) {
      console.warn('[Grid] batch contract mismatch:', problems)
    }

    const rejected = Array.isArray(response.rejected) ? response.rejected : []
    for (const item of rejected) {
      applyRowErrors(item.id, [
        { row: 0, field: '*', message: item.reason || '服务端拒绝写入' },
      ])
    }

    return { ok: rejected.length === 0 && problems.length === 0, saved: saved.length, rejected: rejected.length }
  }

  /** Silent single-row save: no page mask, row-level spinner, no reload. */
  async function saveOne(rowId: string): Promise<boolean> {
    if (saving.value || mutating.value) return false
    const row = findRow(rowId)
    if (!row) return false
    if (!options.canEdit(row)) {
      notify({ message: '没有权限修改该行', type: 'warning' })
      return false
    }

    const issues = validateRow(row)
    if (issues.length > 0) {
      applyRowErrors(rowId, issues)
      notify({ message: issues[0].message, type: 'error' })
      return false
    }

    const stamp = identity()
    saving.value = true
    savingIds.value = [...savingIds.value, rowId]

    try {
      const outcome = await writeBatch([{ id: row.id, fields: { ...row.fields } }], [])
      if (identity() !== stamp) return false
      if (!outcome.ok) {
        notify({ message: '该行保存失败', type: 'error' })
        return false
      }
      notify({ message: '已保存', type: 'success' })
      return true
    } catch (err) {
      console.error('[Grid] row save failed:', err)
      notify({ message: '保存失败，请重试', type: 'error' })
      return false
    } finally {
      savingIds.value = savingIds.value.filter((id) => id !== rowId)
      saving.value = false
      // Must run after the lock is released: refreshSummary() returns early
      // while `saving` is true, which would leave dirty stuck on after a
      // successful single-row save.
      refreshSummary()
    }
  }

  /** Page save: one batch request, page-level mask, refresh only when needed. */
  async function savePage(): Promise<boolean> {
    if (saving.value || mutating.value) return false
    if (!dirty.value) {
      notify({ message: '没有需要保存的修改', type: 'info' })
      return false
    }

    const changes = collectChanges()
    const items = writableRows(changes.items)

    if (items.length !== changes.items.length) {
      notify({ message: '部分行没有权限，已跳过', type: 'warning' })
    }

    // Validate before the request: one round trip, no partial writes.
    for (const item of items) {
      const row = findRow(item.id)
      if (!row) continue
      const issues = validateRow(row)
      if (issues.length > 0) {
        applyRowErrors(item.id, issues)
        notify({ message: `「${row.fields.title || row.id}」校验未通过`, type: 'error' })
        return false
      }
    }

    const stamp = identity()
    mutating.value = true
    saving.value = true

    try {
      const outcome = await writeBatch(items, changes.deletedIds)
      if (identity() !== stamp) return false

      if (!outcome.ok) {
        notify({ message: '部分数据保存失败，请检查红色单元格', type: 'error' })
      }

      // Compensation only matters when rows were deleted.
      let stranded: string[] = []
      if (changes.deletedIds.length > 0 && outcome.ok) {
        stranded = await compensateDeletions(changes.deletedIds)
        if (stranded.length > 0) {
          notify({ message: `有 ${stranded.length} 行未能删除`, type: 'warning' })
        }
      }

      // C13: a pure edit needs no refresh — the response was written back above.
      const needsReload =
        changes.added > 0 || changes.deleted > 0 || stranded.length > 0

      mutating.value = false
      saving.value = false

      if (needsReload) {
        await reload()
      } else {
        refreshSummary()
      }

      if (outcome.ok) {
        notify({ message: '保存成功', type: 'success' })
      }
      return outcome.ok
    } catch (err) {
      console.error('[Grid] page save failed:', err)
      notify({ message: '保存失败，请重试', type: 'error' })
      return false
    } finally {
      mutating.value = false
      saving.value = false
      refreshSummary()
    }
  }

  // ── Layout ────────────────────────────────────────────────────────

  function applyLayout(next: GridLayout, persist: LayoutKind | null = 'current'): void {
    layout.value = normaliseLayout(next, fields.value)
    if (persist) saveLayout(persist, gridName, identity(), layout.value)
  }

  function resetLayout(): void {
    layout.value = normaliseLayout(defaultLayout(fields.value), fields.value)
    saveLayout('current', gridName, identity(), layout.value)
  }

  function saveLayoutAsDefault(): void {
    saveLayout('default', gridName, identity(), layout.value)
  }

  // ── Pulse ─────────────────────────────────────────────────────────

  function startBatchPulse(ids: string[]): void {
    for (const id of ids) {
      const existing = pulseTimers.get(id)
      if (existing) clearTimeout(existing)
      pulseTimers.set(
        id,
        setTimeout(() => {
          pulseTimers.delete(id)
          pulseIds.value = pulseIds.value.filter((value) => value !== id)
        }, PULSE_MS),
      )
    }
    pulseIds.value = [...new Set([...pulseIds.value, ...ids])]
  }

  // ── Teardown ──────────────────────────────────────────────────────

  onBeforeUnmount(() => {
    if (summaryTimer) clearTimeout(summaryTimer)
    for (const timer of pulseTimers.values()) clearTimeout(timer)
    pulseTimers.clear()
    query.invalidateInFlight()
    query.clear()
  })

  return {
    // state
    rows,
    fields,
    visibleFields,
    layout,
    initializing,
    loading,
    mutating,
    saving,
    savingIds,
    pulseIds,
    dirty,
    summary,
    cellErrors,
    page,
    pageSize,
    totalItems,
    totalPages,
    tableMissing,
    ephemeral,
    search,
    draftStart,
    hasDraftRows,
    // lifecycle
    loadPage,
    reload,
    initEmpty,
    refreshSummary,
    scheduleSummary,
    adoptLayout,
    setOwnerResolver,
    // edits
    setCell,
    addRow,
    deleteRows,
    discardChanges,
    findRow,
    applyPaste,
    importRecords,
    validateRow,
    // writes
    saveOne,
    savePage,
    // layout
    applyLayout,
    resetLayout,
    saveLayoutAsDefault,
    // helpers
    canEditFor: options.canEdit,
    collectChanges,
    ensureDraftRows,
    startBatchPulse,
  }
}
