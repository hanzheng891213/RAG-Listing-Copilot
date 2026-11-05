import type { GridLayout } from '@/types/grid'

/**
 * Private layout persistence.
 *
 * Layouts are per "grid + user": two accounts on one browser must not inherit
 * each other's column order or frozen panes. Precedence is
 *
 *   current (last applied) > private default > server default > built-in default
 *
 * Only the first two live here; the server template is not implemented in this
 * project yet, so callers fall back to `defaultLayout()`.
 */

const PREFIX = 'product-grid:layout'
export type LayoutKind = 'current' | 'default'

function keyFor(kind: LayoutKind, gridName: string, userKey: string): string {
  return `${PREFIX}:${kind}:${gridName}:${userKey}`
}

function read(key: string): GridLayout | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || parsed.version !== 1) return null
    return parsed as GridLayout
  } catch {
    return null
  }
}

function write(key: string, layout: GridLayout): void {
  try {
    localStorage.setItem(key, JSON.stringify(layout))
  } catch {
    // Quota or private mode: layout is a convenience, never block the grid.
  }
}

export function loadLayout(
  kind: LayoutKind,
  gridName: string,
  userKey: string,
): GridLayout | null {
  return read(keyFor(kind, gridName, userKey))
}

export function saveLayout(
  kind: LayoutKind,
  gridName: string,
  userKey: string,
  layout: GridLayout,
): void {
  write(keyFor(kind, gridName, userKey), layout)
}

export function clearLayouts(gridName: string, userKey: string): void {
  for (const kind of ['current', 'default'] as const) {
    try {
      localStorage.removeItem(keyFor(kind, gridName, userKey))
    } catch {
      // ignore
    }
  }
}
