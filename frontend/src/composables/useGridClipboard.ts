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
  selectAll: () => void
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

  /**
   * Leaves the pasted rectangle selected, so a second Ctrl+V overwrites the
   * same block instead of silently painting somewhere else (Excel behaviour).
   */
  function selectPastedBlock(anchor: GridSelection | null, matrix: string[][]): void {
    const rows = options.rows.value
    const fields = options.fields.value
    if (rows.length === 0 || fields.length === 0 || matrix.length === 0) return

    let startRow = 0
    let startCol = 0
    let height = matrix.length
    let width = matrix.reduce((max, row) => Math.max(max, row.length), 0)

    if (anchor) {
      const rowIndex = rows.findIndex((row) => row.id === anchor.anchorRowId)
      const colIndex = fields.findIndex((field) => field.key === anchor.anchorField)
      if (rowIndex >= 0 && colIndex >= 0) {
        startRow = rowIndex
        startCol = colIndex
      }
      if (matrix.length === 1 && matrix[0].length === 1) {
        const box = bounds()
        if (box) {
          startRow = box.rowStart
          startCol = box.colStart
          height = box.rowEnd - box.rowStart + 1
          width = box.colEnd - box.colStart + 1
        }
      }
    }

    const endRow = Math.min(rows.length - 1, startRow + height - 1)
    const endCol = Math.min(fields.length - 1, startCol + width - 1)
    if (endRow < startRow || endCol < startCol) return

    options.selection.value = {
      anchorRowId: rows[startRow].id,
      anchorField: fields[startCol].key,
      focusRowId: rows[endRow].id,
      focusField: fields[endCol].key,
    }
  }

  function onCopy(event: ClipboardEvent): void {
    if (isEditableTarget(event.target)) return
    const matrix = selectionMatrix()
    if (matrix.length === 0) return
    event.preventDefault()
    event.stopPropagation()
    event.clipboardData?.setData('text/plain', toTsv(matrix))
  }

  function onCut(event: ClipboardEvent): void {
    if (isEditableTarget(event.target)) return
    const box = bounds()
    if (!box) return
    const matrix = selectionMatrix()
    event.preventDefault()
    event.stopPropagation()
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
    const text = event.clipboardData?.getData('text/plain') ?? ''
    if (!text) return

    // While a cell editor owns the focus, plain text must stay a plain text
    // paste (a URL, a note). A tab or a newline means the user is pasting a
    // block, which Excel takes to the sheet even from inside the editor.
    if (isEditableTarget(event.target) && !/[\t\r\n]/.test(text)) return

    event.preventDefault()
    event.stopPropagation()

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
      const label =
        options.fields.value.find((field) => field.key === first.field)?.label ?? first.field
      options.notify({
        message: `未写入：第 ${first.row} 行「${label}」${first.message}（共 ${result.issues.length} 处问题）`,
        type: 'error',
      })
      return
    }

    selectPastedBlock(selection, matrix)

    const parts = [`已粘贴 ${result.written} 个单元格`]
    if (result.skipped > 0) parts.push(`跳过 ${result.skipped} 个只读行`)
    options.notify({
      message: parts.join('，'),
      type: result.written > 0 ? 'success' : 'warning',
    })
  }

  function onKeydown(event: KeyboardEvent): void {
    if (isEditableTarget(event.target)) return
    if (event.isComposing) return

    const meta = event.ctrlKey || event.metaKey

    // Ctrl/Cmd+A selects the page, like Excel. Without it the browser would
    // select the whole document, including the toolbar outside the grid.
    if (meta && event.key.toLowerCase() === 'a') {
      event.preventDefault()
      options.selectAll()
      return
    }

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
