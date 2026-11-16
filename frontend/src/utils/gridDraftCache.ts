/**
 * Crash-recovery cache for an import that has not reached the server yet.
 *
 * The listing table itself is durable in D1; this cache only covers the gap
 * between "file parsed" and "batch saved". sessionStorage is deliberate: the
 * draft is per tab, dies when the tab closes, and never becomes a second,
 * stale copy of the table. localStorage is not used because a full supplier
 * sheet can approach the ~5 MB quota and would block the main thread on every
 * write.
 *
 * Caps: 2,000 rows / 3 MB / 2 hours, whichever is hit first.
 */

const KEY_PREFIX = 'rag-grid-draft:v1:'
const TTL_MS = 2 * 60 * 60_000
const MAX_ROWS = 2_000
const MAX_BYTES = 3 * 1024 * 1024

export interface GridDraft {
  savedAt: number
  fileName: string
  records: Array<Record<string, string>>
}

function keyFor(scope: string): string {
  return `${KEY_PREFIX}${scope || 'anon'}`
}

export function saveGridDraft(
  scope: string,
  fileName: string,
  records: Array<Record<string, string>>,
): boolean {
  try {
    const capped = records.slice(0, MAX_ROWS)
    const payload: GridDraft = {
      savedAt: Date.now(),
      fileName: fileName.slice(0, 200),
      records: capped,
    }
    const serialised = JSON.stringify(payload)
    if (serialised.length > MAX_BYTES) {
      // Too large to keep: drop the oldest half rather than fail the import.
      payload.records = capped.slice(0, Math.floor(MAX_ROWS / 2))
    }
    sessionStorage.setItem(keyFor(scope), JSON.stringify(payload))
    return true
  } catch {
    return false
  }
}

export function loadGridDraft(scope: string): GridDraft | null {
  try {
    const raw = sessionStorage.getItem(keyFor(scope))
    if (!raw) return null
    const parsed = JSON.parse(raw) as GridDraft
    if (!parsed || !Array.isArray(parsed.records)) return null
    if (Date.now() - Number(parsed.savedAt) > TTL_MS) {
      sessionStorage.removeItem(keyFor(scope))
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export function clearGridDraft(scope: string): void {
  try {
    sessionStorage.removeItem(keyFor(scope))
  } catch { /* storage unavailable */ }
}

export const GRID_DRAFT_LIMITS = {
  maxRows: MAX_ROWS,
  maxBytes: MAX_BYTES,
  ttlMs: TTL_MS,
}
