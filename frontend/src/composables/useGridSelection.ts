import { ref } from 'vue'
import type { GridField, GridRow, GridSelection } from '@/types/grid'

/**
 * Rectangular selection addressed by stable row id + field key, never by row
 * index: inserting or deleting rows must not silently move the selection.
 */
export function useGridSelection() {
  const selection = ref<GridSelection | null>(null)

  function indexOfRow(rows: GridRow[], rowId: string): number {
    return rows.findIndex((row) => row.id === rowId)
  }

  function indexOfField(fields: GridField[], field: string): number {
    return fields.findIndex((f) => f.key === field)
  }

  function select(rowId: string, field: string): void {
    selection.value = {
      anchorRowId: rowId,
      anchorField: field,
      focusRowId: rowId,
      focusField: field,
    }
  }

  function extend(rowId: string, field: string): void {
    if (!selection.value) {
      select(rowId, field)
      return
    }
    selection.value = { ...selection.value, focusRowId: rowId, focusField: field }
  }

  function clear(): void {
    selection.value = null
  }

  /** Resolved bounds in [rowStart..rowEnd] × [colStart..colEnd] index space. */
  function bounds(
    rows: GridRow[],
    fields: GridField[],
  ): { rowStart: number; rowEnd: number; colStart: number; colEnd: number } | null {
    const sel = selection.value
    if (!sel) return null

    const a = indexOfRow(rows, sel.anchorRowId)
    const b = indexOfRow(rows, sel.focusRowId)
    const c = indexOfField(fields, sel.anchorField)
    const d = indexOfField(fields, sel.focusField)
    if (a < 0 || b < 0 || c < 0 || d < 0) return null

    return {
      rowStart: Math.min(a, b),
      rowEnd: Math.max(a, b),
      colStart: Math.min(c, d),
      colEnd: Math.max(c, d),
    }
  }

  function contains(rowId: string, field: string, rows: GridRow[], fields: GridField[]): boolean {
    const box = bounds(rows, fields)
    if (!box) return false
    const r = indexOfRow(rows, rowId)
    const c = indexOfField(fields, field)
    if (r < 0 || c < 0) return false
    return r >= box.rowStart && r <= box.rowEnd && c >= box.colStart && c <= box.colEnd
  }

  /** Selected cells as a matrix, in visual (top-left to bottom-right) order. */
  function matrix(rows: GridRow[], fields: GridField[]): string[][] {
    const box = bounds(rows, fields)
    if (!box) return []
    const out: string[][] = []
    for (let r = box.rowStart; r <= box.rowEnd; r++) {
      const row: string[] = []
      for (let c = box.colStart; c <= box.colEnd; c++) {
        row.push(rows[r]?.fields?.[fields[c]?.key] ?? '')
      }
      out.push(row)
    }
    return out
  }

  /** Moves the focus cell; `extend` keeps the anchor (Shift+arrow). */
  function move(
    deltaRow: number,
    deltaCol: number,
    rows: GridRow[],
    fields: GridField[],
    extendSelection: boolean,
  ): void {
    const box = bounds(rows, fields)
    if (!box) {
      if (rows.length > 0 && fields.length > 0) select(rows[0].id, fields[0].key)
      return
    }
    const anchor = selection.value!
    const currentRow = extendSelection
      ? indexOfRow(rows, anchor.focusRowId)
      : indexOfRow(rows, anchor.anchorRowId)
    const currentCol = extendSelection
      ? indexOfField(fields, anchor.focusField)
      : indexOfField(fields, anchor.anchorField)

    const nextRow = clamp(currentRow + deltaRow, 0, rows.length - 1)
    const nextCol = clamp(currentCol + deltaCol, 0, fields.length - 1)
    const rowId = rows[nextRow]?.id
    const fieldKey = fields[nextCol]?.key
    if (!rowId || !fieldKey) return

    if (extendSelection) extend(rowId, fieldKey)
    else select(rowId, fieldKey)
  }

  return {
    selection,
    select,
    extend,
    clear,
    bounds,
    contains,
    matrix,
    move,
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}
