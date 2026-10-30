import type { ComputedRef, Ref } from 'vue'
import type { GridField, GridImportIssue, GridRow, GridSelection } from '@/types/grid'
import { parseTsv, toTsv, TsvError } from '@/utils/tsv'

/**
 * Excel clipboard semantics for the grid.
 *
 * Bound with `.capture` on the grid container, so a single handler covers
 * Ctrl+C/X/V, the browser's own context-menu items, and the keyboard. The one
 * exception is a live cell editor: while an input has focus the browser must
 * own paste, otherwise typing a URL into a cell would be hijacked.
 */

export interface GridClipboardNotice {
  message: string
  type: 'success' | 'warning' | 'error' | 'info'
}

export interface GridClipboardOptions {
  rows: Ref<GridRow[]>
  fields: ComputedRef<GridField[]>
  selection: Ref<GridSelection | null>
  canEdit: (row: GridRow) => boolean
  setCell: (rowId: string, field: string, value: string) => boolean
  applyPaste: (
    anchor: GridSelection | null,
    matrix: string[][],
    opts?: { fillSelection?: GridSelection | null },
  ) => { written: number; skipped: number; issues: GridImportIssue[] }
  move: (deltaRow: number, deltaCol: number, extend: boolean) => void
  clearSelection: () => void
  edit: (rowId: string, field: string) => void
  notify: (notice: GridClipboardNotice) => void
}

export function useGridClipboard(options: GridClipboardOptions) {
  function isEditableTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false
    return Boolean(target.closest('input, textarea, [contenteditable="true"]'))
  }

  function bounds(): {
    rowStart: number
    rowEnd: number
    colStart: number
    colEnd: number
  } | null {
    const sel = options.selection.value
    if (!sel) return null
    const rows = options.rows.value
    const fields = options.fields.value
    const r1 = rows.findIndex((row) => row.id === sel.anchorRowId)
    const r2 = rows.findIndex((row) => row.id === sel.focusRowId)
    const c1 = fields.findIndex((f) => f.key === sel.anchorField)
    const c2 = fields.findIndex((f) => f.key === sel.focusField)
    if (r1 < 0 || r2 < 0 || c1 < 0 || c2 < 0) return null
    return {
      rowStart: Math.min(r1, r2),
      rowEnd: Math.max(r1, r2),
      colStart: Math.min(c1, c2),
      colEnd: Math.max(c1, c2),
    }
  }

  function selectionMatrix(): string[][] {
    const box = bounds()
    if (!box) return []
    const rows = options.rows.value
    const fields = options.fields.value
    const matrix: string[][] = []
    for (let r = box.rowStart; r <= box.rowEnd; r++) {
      const line: string[] = []
      for (let c = box.colStart; c <= box.colEnd; c++) {
        line.push(rows[r]?.fields?.[fields[c]?.key] ?? '')
      }
      matrix.push(line)
    }
    return matrix
  }

  function onCopy(event: ClipboardEvent): void {
    if (isEditableTarget(event.target)) return
    const matrix = selectionMatrix()
    if (matrix.length === 0) return
    event.preventDefault()
    event.clipboardData?.setData('text/plain', toTsv(matrix))
  }

  function onCut(event: ClipboardEvent): void {
    if (isEditableTarget(event.target)) return
    const box = bounds()
    if (!box) return
    const matrix = selectionMatrix()
    event.preventDefault()
    event.clipboardData?.setData('text/plain', toTsv(matrix))

    let cleared = 0
    const rows = options.rows.value
    const fields = options.fields.value
    for (let r = box.rowStart; r <= box.rowEnd; r++) {
      const row = rows[r]
      if (!row || !options.canEdit(row)) continue
      for (let c = box.colStart; c <= box.colEnd; c++) {
        const field = fields[c]
        if (!field || field.readOnly) continue
        if (options.setCell(row.id, field.key, '')) cleared += 1
      }
    }
    if (cleared > 0) {
      options.notify({ message: `已剪切 ${cleared} 个单元格`, type: 'success' })
    }
  }

  function onPaste(event: ClipboardEvent): void {
    if (isEditableTarget(event.target)) return
    const text = event.clipboardData?.getData('text/plain') ?? ''
    if (!text.trim()) return
    event.preventDefault()

    let matrix: string[][]
    try {
      matrix = parseTsv(text)
    } catch (err) {
      const message = err instanceof TsvError ? err.message : '粘贴内容无法解析'
      options.notify({ message, type: 'error' })
      return
    }
    if (matrix.length === 0) return

    const selection = options.selection.value
    const result = options.applyPaste(selection, matrix, { fillSelection: selection })

    if (result.issues.length > 0) {
      const first = result.issues[0]
      options.notify({
        message: `未写入：第 ${first.row} 行 ${first.field} ${first.message}（共 ${result.issues.length} 处问题）`,
        type: 'error',
      })
      return
    }

    const parts = [`已粘贴 ${result.written} 个单元格`]
    if (result.skipped > 0) parts.push(`跳过 ${result.skipped} 个只读行`)
    options.notify({ message: parts.join('，'), type: 'success' })
  }

  function onKeydown(event: KeyboardEvent): void {
    if (isEditableTarget(event.target)) return
    if (event.isComposing) return

    const meta = event.ctrlKey || event.metaKey

    if (!meta && (event.key === 'Delete' || event.key === 'Backspace')) {
      const box = bounds()
      if (!box) return
      event.preventDefault()
      const rows = options.rows.value
      const fields = options.fields.value
      let cleared = 0
      for (let r = box.rowStart; r <= box.rowEnd; r++) {
        const row = rows[r]
        if (!row || !options.canEdit(row)) continue
        for (let c = box.colStart; c <= box.colEnd; c++) {
          const field = fields[c]
          if (!field || field.readOnly) continue
          if (options.setCell(row.id, field.key, '')) cleared += 1
        }
      }
      if (cleared > 0) {
        options.notify({ message: `已清空 ${cleared} 个单元格`, type: 'info' })
      }
      return
    }

    if (event.key === 'Escape') {
      options.clearSelection()
      return
    }

    if (!meta && (event.key === 'Enter' || event.key === 'F2')) {
      const sel = options.selection.value
      if (!sel) return
      event.preventDefault()
      options.edit(sel.focusRowId, sel.focusField)
      return
    }

    if (!meta && event.key.startsWith('Arrow')) {
      const delta: Record<string, [number, number]> = {
        ArrowUp: [-1, 0],
        ArrowDown: [1, 0],
        ArrowLeft: [0, -1],
        ArrowRight: [0, 1],
      }
      const step = delta[event.key]
      if (!step) return
      event.preventDefault()
      options.move(step[0], step[1], event.shiftKey)
    }
  }

  return { onCopy, onCut, onPaste, onKeydown }
}
