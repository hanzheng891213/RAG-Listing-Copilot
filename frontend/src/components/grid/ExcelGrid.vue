<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Delete, MagicStick, Select } from '@element-plus/icons-vue'
import type { GridField, GridRow, GridLayout, GridSelection } from '@/types/grid'
import { normaliseCell } from '@/utils/tsv'

/**
 * Excel-like editable grid.
 *
 * Deliberately self-built rather than Handsontable: the constraint spec allows
 * it ("换到 VxeTable 或自研表格，第 2–6 节的分层和约束仍然成立") and every
 * requirement here is a layout/CSS problem this component can solve without a
 * commercial licence.
 *
 * What it owns: rendering, virtualisation, sticky header/frozen columns,
 * external scrollbars, cell editing.
 * What it does not own: data, dirty tracking, save, clipboard, layout state.
 * Those live in useProductGrid / useGridClipboard / useGridLayout.
 */

const ROW_HEIGHT = 30
const HEADER_HEIGHT = 32
const ROW_NUMBER_WIDTH = 56
/** Three colour-coded icon buttons plus their gaps and the rail padding. */
const ACTION_BUTTON_SIZE = 24
const ACTION_GAP = 6
const ACTION_PADDING = 12
const ACTION_WIDTH = ACTION_BUTTON_SIZE * 3 + ACTION_GAP * 2 + ACTION_PADDING
const OVERSCAN = 6
const MIN_THUMB = 28

const { t } = useI18n()

const props = defineProps<{
  rows: GridRow[]
  /** Visible fields, already ordered and filtered by the caller. */
  fields: GridField[]
  layout: GridLayout
  selection: GridSelection | null
  height: number
  canEdit: (row: GridRow) => boolean
  savingIds: string[]
  pulseIds: string[]
  cellErrors: Record<string, string>
  saving: boolean
  draftStart: number
  /** Always-frozen 操作 column pinned at the far right. */
  actions?: boolean
  /** Labels for the action column; the page passes translated text. */
  actionLabels?: { header: string; save: string; generate: string; delete: string }
  /** Rows whose listing is being generated; the action cell shows a spinner. */
  generatingIds?: string[]
}>()

const emit = defineEmits<{
  (e: 'cell-change', payload: { rowId: string; field: string; value: string }): void
  (e: 'select', payload: { rowId: string; field: string; extend: boolean }): void
  (e: 'select-row', payload: { rowId: string; extend: boolean }): void
  (e: 'request-save-row', id: string): void
  (e: 'activate', payload: { rowId: string; field: string }): void
  (e: 'row-generate', payload: { rowId: string; x: number; y: number }): void
  (e: 'row-delete', payload: { rowId: string }): void
  /** Double-click on the row-number gutter: open the whole row for inspection. */
  (e: 'row-open', payload: { rowId: string }): void
}>()

interface ColumnLayout {
  field: GridField
  stickyLeft: number | null
  stickyRight: number | null
}

const scroller = ref<HTMLElement | null>(null)
const trackV = ref<HTMLElement | null>(null)
const trackH = ref<HTMLElement | null>(null)

const scrollTop = ref(0)
const scrollLeft = ref(0)
const viewportH = ref(0)
const viewportW = ref(0)
const contentH = ref(0)
const contentW = ref(0)

const editing = ref<{ rowId: string; field: string; value: string } | null>(null)
// A function ref, not `ref="editorInput"`: inside a v-for Vue would collect the
// refs into an array, and only one editor exists at a time.
let editorEl: HTMLInputElement | null = null
function setEditorRef(el: unknown): void {
  editorEl = (el as HTMLInputElement | null) ?? null
}

// ── Column geometry ──────────────────────────────────────────────────
// Row-number column takes the first sticky slot; data columns are frozen from
// the counted visible fields, so hidden columns never shift the freeze point.
// The action column owns the rightmost slot for the same reason.
const actionLabels = computed(
  () =>
    props.actionLabels ?? {
      header: t('grid.actionsHeader'),
      save: t('grid.saveAction'),
      generate: t('grid.generateAction'),
      delete: t('grid.deleteAction'),
    },
)

// The rail is icon-only (save / generate / delete), so its width is fixed and
// the translated labels live in the themed tooltips instead of the button text.
const ACTION_SLOT = computed(() => (props.actions ? ACTION_WIDTH : 0))

const columns = computed<ColumnLayout[]>(() => {
  const out: ColumnLayout[] = []
  let offset = props.layout.showRowNumber ? ROW_NUMBER_WIDTH : 0

  props.fields.forEach((field, index) => {
    const frozenLeft = index < props.layout.fixedLeft
    out.push({
      field,
      stickyLeft: frozenLeft ? offset : null,
      stickyRight: null,
    })
    offset += field.width
  })

  let right = ACTION_SLOT.value
  const from = props.fields.length - props.layout.fixedRight
  for (let index = props.fields.length - 1; index >= from && index >= 0; index--) {
    out[index].stickyRight = right
    right += out[index].field.width
  }

  return out
})

const totalWidth = computed(
  () =>
    (props.layout.showRowNumber ? ROW_NUMBER_WIDTH : 0) +
    props.fields.reduce((sum, field) => sum + field.width, 0) +
    ACTION_SLOT.value,
)

// ── Virtual window ───────────────────────────────────────────────────
const visibleStart = computed(() =>
  Math.max(0, Math.floor(scrollTop.value / ROW_HEIGHT) - OVERSCAN),
)

const visibleEnd = computed(() =>
  Math.min(
    props.rows.length,
    Math.ceil((scrollTop.value + viewportH.value) / ROW_HEIGHT) + OVERSCAN,
  ),
)

const visibleRows = computed(() =>
  props.rows.slice(visibleStart.value, visibleEnd.value).map((row, i) => ({
    row,
    index: visibleStart.value + i,
  })),
)

const topPad = computed(() => visibleStart.value * ROW_HEIGHT)
const bottomPad = computed(() =>
  Math.max(0, (props.rows.length - visibleEnd.value) * ROW_HEIGHT),
)

const bodyHeight = computed(() => HEADER_HEIGHT + props.rows.length * ROW_HEIGHT)

// ── Scrollbars (single direction: they only ever read the scroller) ───
const maxScrollTop = computed(() => Math.max(0, contentH.value - viewportH.value))
const maxScrollLeft = computed(() => Math.max(0, contentW.value - viewportW.value))

const vThumb = computed(() => {
  // The track element spans the full viewport height (top:0, bottom:10px).
  const track = Math.max(0, viewportH.value)
  if (contentH.value <= viewportH.value || track <= 0) {
    return { size: Math.max(track, MIN_THUMB), offset: 0, idle: true }
  }
  const size = Math.min(track, Math.max(MIN_THUMB, Math.round((track * viewportH.value) / contentH.value)))
  const travel = track - size
  const ratio = maxScrollTop.value === 0 ? 0 : scrollTop.value / maxScrollTop.value
  return { size, offset: travel * ratio, idle: false }
})

const hThumb = computed(() => {
  const track = viewportW.value
  if (contentW.value <= viewportW.value || track <= 0) {
    return { size: Math.max(track, MIN_THUMB), offset: 0, idle: true }
  }
  const size = Math.min(track, Math.max(MIN_THUMB, Math.round((track * viewportW.value) / contentW.value)))
  const travel = track - size
  const ratio = maxScrollLeft.value === 0 ? 0 : scrollLeft.value / maxScrollLeft.value
  return { size, offset: travel * ratio, idle: false }
})

function measure(): void {
  const el = scroller.value
  if (!el) return
  viewportH.value = el.clientHeight
  viewportW.value = el.clientWidth
  contentH.value = el.scrollHeight
  contentW.value = el.scrollWidth
}

function onScroll(): void {
  const el = scroller.value
  if (!el) return
  // Read-only: nothing writes back into the scroller from here.
  scrollTop.value = el.scrollTop
  scrollLeft.value = el.scrollLeft
  measure()
}

function scrollBy(delta: { top?: number; left?: number }): void {
  const el = scroller.value
  if (!el) return
  if (typeof delta.top === 'number') el.scrollTop = delta.top
  if (typeof delta.left === 'number') el.scrollLeft = delta.left
}

let dragCleanup: (() => void) | null = null

function startDrag(axis: 'v' | 'h', event: PointerEvent): void {
  const isV = axis === 'v'
  const thumb = isV ? vThumb.value : hThumb.value
  if (thumb.idle) return
  event.preventDefault()
  event.stopPropagation()

  const startPointer = isV ? event.clientY : event.clientX
  const startScroll = isV ? scrollTop.value : scrollLeft.value
  const travel = (isV ? viewportH.value : viewportW.value) - thumb.size
  const maxScroll = isV ? maxScrollTop.value : maxScrollLeft.value

  const onMove = (moveEvent: PointerEvent) => {
    if (travel <= 0) return
    const delta = (isV ? moveEvent.clientY : moveEvent.clientX) - startPointer
    const next = startScroll + (delta * maxScroll) / travel
    scrollBy(isV ? { top: clamp(next, 0, maxScroll) } : { left: clamp(next, 0, maxScroll) })
  }

  const stop = () => {
    window.removeEventListener('pointermove', onMove, true)
    window.removeEventListener('pointerup', stop, true)
    window.removeEventListener('blur', stop, true)
    dragCleanup = null
  }

  window.addEventListener('pointermove', onMove, true)
  window.addEventListener('pointerup', stop, true)
  window.addEventListener('blur', stop, true)
  dragCleanup = stop
}

function onTrackClick(axis: 'v' | 'h', event: MouseEvent): void {
  const isV = axis === 'v'
  const thumb = isV ? vThumb.value : hThumb.value
  if (thumb.idle) return

  const track = isV ? trackV.value : trackH.value
  if (!track) return
  const rect = track.getBoundingClientRect()
  const pointer = isV ? event.clientY - rect.top : event.clientX - rect.left
  const travel = (isV ? rect.height : rect.width) - thumb.size
  const maxScroll = isV ? maxScrollTop.value : maxScrollLeft.value
  const ratio = travel <= 0 ? 0 : clamp((pointer - thumb.size / 2) / travel, 0, 1)
  scrollBy(isV ? { top: ratio * maxScroll } : { left: ratio * maxScroll })
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

// ── Selection / editing ──────────────────────────────────────────────
// Index maps are rebuilt only when the row set or column order changes. Doing
// indexOf per cell would be O(rows x cols x rows) on every scroll frame.
const rowIndexById = computed(() => {
  const map = new Map<string, number>()
  props.rows.forEach((row, index) => map.set(row.id, index))
  return map
})

const fieldIndexByKey = computed(() => {
  const map = new Map<string, number>()
  props.fields.forEach((field, index) => map.set(field.key, index))
  return map
})

const selectionBox = computed(() => {
  const sel = props.selection
  if (!sel) return null
  const r1 = rowIndexById.value.get(sel.anchorRowId)
  const r2 = rowIndexById.value.get(sel.focusRowId)
  const c1 = fieldIndexByKey.value.get(sel.anchorField)
  const c2 = fieldIndexByKey.value.get(sel.focusField)
  if (r1 === undefined || r2 === undefined || c1 === undefined || c2 === undefined) {
    return null
  }
  return {
    rowStart: Math.min(r1, r2),
    rowEnd: Math.max(r1, r2),
    colStart: Math.min(c1, c2),
    colEnd: Math.max(c1, c2),
  }
})

function isSelected(rowId: string, field: string): boolean {
  const box = selectionBox.value
  if (!box) return false
  const index = rowIndexById.value.get(rowId)
  const col = fieldIndexByKey.value.get(field)
  if (index === undefined || col === undefined) return false
  return (
    index >= box.rowStart &&
    index <= box.rowEnd &&
    col >= box.colStart &&
    col <= box.colEnd
  )
}

function isRowSelected(index: number): boolean {
  const box = selectionBox.value
  if (!box || props.fields.length === 0) return false
  return (
    box.colStart === 0 &&
    box.colEnd === props.fields.length - 1 &&
    index >= box.rowStart &&
    index <= box.rowEnd
  )
}

/**
 * The selection is drawn as one rectangle on the canvas, not as a border on
 * every cell: a 6×4 selection should read as one block, the way Excel draws it.
 */
const selectionRect = computed(() => {
  const box = selectionBox.value
  if (!box) return null

  const offset = props.layout.showRowNumber ? ROW_NUMBER_WIDTH : 0
  let left = offset
  for (let index = 0; index < box.colStart; index++) {
    left += props.fields[index]?.width ?? 0
  }
  let width = 0
  for (let index = box.colStart; index <= box.colEnd; index++) {
    width += props.fields[index]?.width ?? 0
  }

  return {
    left: `${left}px`,
    top: `${HEADER_HEIGHT + box.rowStart * ROW_HEIGHT}px`,
    width: `${width}px`,
    height: `${(box.rowEnd - box.rowStart + 1) * ROW_HEIGHT}px`,
  }
})

// ── Drag selection ───────────────────────────────────────────────────
// Click selects one cell; press-and-drag paints a rectangle. The focus cell is
// resolved through `elementFromPoint` so the same code works for virtualised
// rows, frozen columns and the row-number gutter.
type SelectionDragMode = 'cell' | 'row'

let selectionDrag: { mode: SelectionDragMode } | null = null
let selectionDragPointer = { x: 0, y: 0 }
let selectionDragTarget = ''
let selectionDragFrame = 0

function isMouseLike(event: PointerEvent): boolean {
  return event.pointerType !== 'touch'
}

function onCellPointerDown(rowId: string, field: string, event: PointerEvent): void {
  // A cell click between two gutter clicks means the user is not double-clicking
  // the row number; reset the double-click tracker.
  lastRowPointer = null
  // Clicking inside the open editor must place the caret, not start a range.
  if ((event.target as HTMLElement | null)?.closest('.xcell__editor')) return
  if (isMouseLike(event)) {
    if (event.button !== 0) return
    // Prevent text selection and focus loss; the editor is committed by hand.
    event.preventDefault()
  }
  // Without this, moving to another cell leaves the editor focused, blur never
  // fires and the old value would come back.
  const current = editing.value
  if (current && (current.rowId !== rowId || current.field !== field)) {
    commitEditing()
  }
  emit('select', { rowId, field, extend: event.shiftKey })
  if (isMouseLike(event)) beginSelectionDrag('cell', event)
}

let lastRowPointer: { rowId: string; at: number } | null = null

function onRowPointerDown(rowId: string, index: number, event: PointerEvent): void {
  if (isMouseLike(event)) {
    if (event.button !== 0) return
    event.preventDefault()
  }
  if (editing.value) commitEditing()
  emit('select-row', { rowId, extend: event.shiftKey })

  // The gutter owns the row, so a double click there opens the whole record.
  // This is detected from pointerdown rather than `dblclick`: the pointerdown
  // handler calls preventDefault() for text-selection reasons, which suppresses
  // the compatibility mouse events dblclick would otherwise arrive with.
  const now = Date.now()
  const isDouble =
    !event.shiftKey &&
    index < props.draftStart &&
    lastRowPointer?.rowId === rowId &&
    now - lastRowPointer.at < 350
  if (isDouble) {
    lastRowPointer = null
    emit('row-open', { rowId })
    return
  }
  lastRowPointer = { rowId, at: now }

  if (isMouseLike(event)) beginSelectionDrag('row', event)
}

function beginSelectionDrag(mode: SelectionDragMode, event: PointerEvent): void {
  endSelectionDrag()
  selectionDrag = { mode }
  selectionDragPointer = { x: event.clientX, y: event.clientY }
  selectionDragTarget = ''
  window.addEventListener('pointermove', onSelectionDragMove, true)
  window.addEventListener('pointerup', endSelectionDrag, true)
  window.addEventListener('pointercancel', endSelectionDrag, true)
  window.addEventListener('blur', endSelectionDrag, true)
  selectionDragFrame = requestAnimationFrame(selectionAutoScroll)
}

function onSelectionDragMove(event: PointerEvent): void {
  if (!selectionDrag) return
  selectionDragPointer = { x: event.clientX, y: event.clientY }
  applySelectionDragTarget(event.clientX, event.clientY)
}

function applySelectionDragTarget(clientX: number, clientY: number): void {
  const drag = selectionDrag
  if (!drag) return
  const under = document.elementFromPoint(clientX, clientY)
  if (!(under instanceof HTMLElement)) return

  if (drag.mode === 'cell') {
    const cell = under.closest<HTMLElement>('[data-grid-cell]')
    const rowId = cell?.dataset.rowId
    const field = cell?.dataset.field
    if (!rowId || !field) return
    const key = `${rowId}\u0000${field}`
    if (key === selectionDragTarget) return
    selectionDragTarget = key
    emit('select', { rowId, field, extend: true })
    return
  }

  const head = under.closest<HTMLElement>('[data-row-head]')
  const rowId = head?.dataset.rowId
  if (!rowId || rowId === selectionDragTarget) return
  selectionDragTarget = rowId
  emit('select-row', { rowId, extend: true })
}

/** Holding the pointer near an edge keeps painting while the viewport scrolls. */
function selectionAutoScroll(): void {
  if (!selectionDrag) return
  const el = scroller.value
  if (el) {
    const rect = el.getBoundingClientRect()
    const margin = 28
    let dy = 0
    let dx = 0
    if (selectionDragPointer.y < rect.top + HEADER_HEIGHT + margin) dy = -16
    else if (selectionDragPointer.y > rect.bottom - margin) dy = 16
    if (selectionDragPointer.x < rect.left + margin) dx = -16
    else if (selectionDragPointer.x > rect.right - margin) dx = 16

    if (dx !== 0 || dy !== 0) {
      el.scrollTop += dy
      el.scrollLeft += dx
      measure()
      applySelectionDragTarget(selectionDragPointer.x, selectionDragPointer.y)
    }
  }
  selectionDragFrame = requestAnimationFrame(selectionAutoScroll)
}

function endSelectionDrag(): void {
  if (!selectionDrag) return
  selectionDrag = null
  selectionDragTarget = ''
  window.removeEventListener('pointermove', onSelectionDragMove, true)
  window.removeEventListener('pointerup', endSelectionDrag, true)
  window.removeEventListener('pointercancel', endSelectionDrag, true)
  window.removeEventListener('blur', endSelectionDrag, true)
  if (selectionDragFrame) cancelAnimationFrame(selectionDragFrame)
  selectionDragFrame = 0
}

function onCellDblClick(row: GridRow, field: GridField): void {
  if (!props.canEdit(row) || props.saving || field.readOnly) return
  editing.value = { rowId: row.id, field: field.key, value: row.fields[field.key] ?? '' }
  nextTick(() => editorEl?.focus())
}

function commitEditing(): boolean {
  const current = editing.value
  if (!current) return true
  editing.value = null
  const normalised = normaliseCell(current.value, 'text')
  emit('cell-change', {
    rowId: current.rowId,
    field: current.field,
    value: normalised ?? current.value,
  })
  return true
}

function cancelEditing(): void {
  editing.value = null
}

/** Opens the editor for a cell from outside (Enter / F2 / paste focus). */
function beginEdit(rowId: string, field: string): void {
  const row = props.rows.find((r) => r.id === rowId)
  const meta = props.fields.find((f) => f.key === field)
  if (!row || !meta) return
  if (!props.canEdit(row) || props.saving || meta.readOnly) return
  editing.value = { rowId, field, value: row.fields[field] ?? '' }
  nextTick(() => editorEl?.focus())
}

function onEditorKeydown(event: KeyboardEvent): void {
  // IME: Enter while composing confirms the candidate, it must not commit.
  if (event.isComposing) return
  const current = editing.value
  if (!current) return

  if (event.key === 'Enter') {
    event.preventDefault()
    event.stopPropagation()
    commitEditing()
    moveSelection(1, 0)
    return
  }
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    cancelEditing()
    return
  }
  if (event.key === 'Tab') {
    event.preventDefault()
    event.stopPropagation()
    commitEditing()
    moveSelection(0, event.shiftKey ? -1 : 1)
  }
}

function moveSelection(deltaRow: number, deltaCol: number): void {
  const sel = props.selection
  const rowIds = props.rows.map((row) => row.id)
  if (!sel || rowIds.length === 0) return
  const currentRow = Math.max(0, rowIds.indexOf(sel.focusRowId))
  const currentCol = Math.max(0, props.fields.findIndex((f) => f.key === sel.focusField))
  const nextRow = clamp(currentRow + deltaRow, 0, rowIds.length - 1)
  const nextCol = clamp(currentCol + deltaCol, 0, props.fields.length - 1)
  const rowId = rowIds[nextRow]
  const field = props.fields[nextCol]?.key
  if (!rowId || !field) return
  emit('select', { rowId, field, extend: false })
  scrollRowIntoView(nextRow)
}

function scrollRowIntoView(index: number): void {
  const el = scroller.value
  if (!el) return
  const top = index * ROW_HEIGHT
  const bottom = top + ROW_HEIGHT
  if (top < el.scrollTop) el.scrollTop = top
  else if (bottom > el.scrollTop + el.clientHeight - HEADER_HEIGHT) {
    el.scrollTop = bottom - (el.clientHeight - HEADER_HEIGHT)
  }
}

function cellError(rowId: string, field: string): string {
  return props.cellErrors[`${rowId}|${field}`] ?? ''
}

function isPulsing(rowId: string): boolean {
  return props.pulseIds.includes(rowId)
}

function isRowSaving(rowId: string): boolean {
  return props.savingIds.includes(rowId)
}

function isGenerating(rowId: string): boolean {
  return (props.generatingIds ?? []).includes(rowId)
}

/** Anchors the language fan at the clicked button, opening to the left. */
function onActionGenerate(rowId: string, event: MouseEvent): void {
  const target = event.currentTarget as HTMLElement | null
  const rect = target?.getBoundingClientRect()
  emit('row-generate', {
    rowId,
    x: rect ? rect.right - 4 : window.innerWidth / 2,
    y: rect ? rect.top + rect.height / 2 : window.innerHeight / 2,
  })
}

function onActionDelete(rowId: string, event: MouseEvent): void {
  event.stopPropagation()
  emit('row-delete', { rowId })
}

function valueOf(row: GridRow, field: GridField): string {
  return row.fields[field.key] ?? ''
}

/** Core columns carry an i18n key; uploaded columns keep their raw header. */
function fieldLabel(field: GridField): string {
  return field.labelKey ? t(field.labelKey) : field.label
}

/** Exposed so the page can flush an open editor before saving or paging. */
defineExpose({ commitEditing, cancelEditing, beginEdit, scrollRowIntoView, scrollBy })

// ── Lifecycle ────────────────────────────────────────────────────────
let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  measure()
  resizeObserver = new ResizeObserver(() => measure())
  if (scroller.value) resizeObserver.observe(scroller.value)
})

watch(
  () => props.rows.length,
  () => nextTick(measure),
)

watch(
  () => props.height,
  () => nextTick(measure),
)

// Column widths change scrollWidth; without this the scrollbar thumb keeps a
// stale size after the layout panel hides or reorders a column.
watch(totalWidth, () => nextTick(measure))

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
  // Listeners are attached per drag; a drag spanning unmount must not leak.
  dragCleanup?.()
  endSelectionDrag()
})
</script>

<template>
  <div class="xgrid" :style="{ height: `${height}px` }">
    <div ref="scroller" class="xgrid__viewport" @scroll.passive="onScroll">
      <div class="xgrid__canvas" :style="{ width: `${totalWidth}px`, height: `${bodyHeight}px` }">
        <div class="xgrid__head" :style="{ height: `${HEADER_HEIGHT}px` }">
          <div
            v-if="layout.showRowNumber"
            class="xhead xhead--rownum"
            :style="{ width: `${ROW_NUMBER_WIDTH}px`, left: '0px' }"
            v-tooltip="t('grid.rowNumber')"
          >
            {{ t('grid.serialNumber') }}
          </div>
          <div
            v-for="col in columns"
            :key="col.field.key"
            class="xhead"
            :class="{
              'xhead--frozen': col.stickyLeft !== null || col.stickyRight !== null,
              'xhead--frozen-right': col.stickyRight !== null,
            }"
            :style="{
              width: `${col.field.width}px`,
              left: col.stickyLeft !== null ? `${col.stickyLeft}px` : undefined,
              right: col.stickyRight !== null ? `${col.stickyRight}px` : undefined,
            }"
            v-tooltip="fieldLabel(col.field)"
          >
            {{ fieldLabel(col.field) }}
          </div>

          <div
            v-if="actions"
            class="xhead xhead--actions"
            :style="{ width: `${ACTION_WIDTH}px`, right: '0px' }"
          >
            {{ actionLabels.header }}
          </div>
        </div>

        <div :style="{ height: `${topPad}px` }" />

        <div
          v-for="entry in visibleRows"
          :key="entry.row.id"
          class="xgrid__row"
          :class="{
            'xgrid__row--alt': entry.index % 2 === 1,
            'xgrid__row--pulse': isPulsing(entry.row.id),
            'xgrid__row--saving': isRowSaving(entry.row.id),
            'xgrid__row--readonly': !canEdit(entry.row),
            'xgrid__row--draft': entry.index >= draftStart,
          }"
          :style="{ height: `${ROW_HEIGHT}px` }"
        >
          <div
            v-if="layout.showRowNumber"
            class="xcell xcell--rownum"
            :class="{ 'xcell--rownum-selected': isRowSelected(entry.index) }"
            data-row-head
            :data-row-id="entry.row.id"
            :style="{ width: `${ROW_NUMBER_WIDTH}px`, left: '0px' }"
            v-tooltip="t('grid.rowNumberHint')"
            @pointerdown="onRowPointerDown(entry.row.id, entry.index, $event)"
          >
            <span v-if="entry.index < draftStart">{{ entry.index + 1 }}</span>
            <span v-else class="xcell__draft-mark">+</span>
          </div>

          <div
            v-for="col in columns"
            :key="col.field.key"
            class="xcell"
            :class="{
              'xcell--frozen': col.stickyLeft !== null || col.stickyRight !== null,
              'xcell--frozen-right': col.stickyRight !== null,
              'xcell--selected': isSelected(entry.row.id, col.field.key),
              'xcell--error': cellError(entry.row.id, col.field.key),
              'xcell--numeric': col.field.align === 'right',
            }"
            data-grid-cell
            :data-row-id="entry.row.id"
            :data-field="col.field.key"
            :style="{
              width: `${col.field.width}px`,
              left: col.stickyLeft !== null ? `${col.stickyLeft}px` : undefined,
              right: col.stickyRight !== null ? `${col.stickyRight}px` : undefined,
            }"
            v-tooltip="cellError(entry.row.id, col.field.key) || valueOf(entry.row, col.field)"
            @pointerdown="onCellPointerDown(entry.row.id, col.field.key, $event)"
            @dblclick="onCellDblClick(entry.row, col.field)"
          >
            <input
              v-if="editing && editing.rowId === entry.row.id && editing.field === col.field.key"
              :ref="setEditorRef"
              v-model="editing.value"
              class="xcell__editor"
              type="text"
              @keydown="onEditorKeydown"
              @blur="commitEditing"
            />
            <span v-else class="xcell__text">{{ valueOf(entry.row, col.field) }}</span>
            <span v-if="isRowSaving(entry.row.id)" class="xcell__spinner" />
          </div>

          <div
            v-if="actions"
            class="xcell xcell--actions"
            :style="{ width: `${ACTION_WIDTH}px`, right: '0px' }"
            @pointerdown.stop
            @dblclick.stop
          >
            <button
              type="button"
              class="xact xact--save"
              :disabled="saving || !canEdit(entry.row) || isRowSaving(entry.row.id) || entry.index >= draftStart"
              :aria-label="actionLabels.save"
              v-tooltip="actionLabels.save"
              @click.stop="emit('request-save-row', entry.row.id)"
            >
              <span v-if="isRowSaving(entry.row.id)" class="xact__spinner" />
              <el-icon v-else><Select /></el-icon>
            </button>
            <button
              type="button"
              class="xact xact--generate"
              :disabled="saving || !canEdit(entry.row) || isGenerating(entry.row.id) || entry.index >= draftStart"
              :aria-label="actionLabels.generate"
              v-tooltip="actionLabels.generate"
              @click.stop="onActionGenerate(entry.row.id, $event)"
            >
              <span v-if="isGenerating(entry.row.id)" class="xact__spinner" />
              <el-icon v-else><MagicStick /></el-icon>
            </button>
            <button
              type="button"
              class="xact xact--delete"
              :disabled="saving || !canEdit(entry.row) || entry.index >= draftStart"
              :aria-label="actionLabels.delete"
              v-tooltip="actionLabels.delete"
              @click.stop="onActionDelete(entry.row.id, $event)"
            >
              <el-icon><Delete /></el-icon>
            </button>
          </div>
        </div>

        <div :style="{ height: `${bottomPad}px` }" />

        <div
          v-if="selectionRect"
          class="xgrid__selection"
          :style="selectionRect"
          aria-hidden="true"
        />
      </div>
    </div>

    <div
      ref="trackV"
      class="xgrid__sb xgrid__sb--v"
      :class="{ 'is-idle': vThumb.idle }"
      @mousedown.self="onTrackClick('v', $event)"
    >
      <div
        class="xgrid__thumb"
        :style="{ height: `${vThumb.size}px`, transform: `translateY(${vThumb.offset}px)` }"
        @pointerdown="startDrag('v', $event)"
      />
    </div>

    <div
      ref="trackH"
      class="xgrid__sb xgrid__sb--h"
      :class="{ 'is-idle': hThumb.idle }"
      @mousedown.self="onTrackClick('h', $event)"
    >
      <div
        class="xgrid__thumb"
        :style="{ width: `${hThumb.size}px`, transform: `translateX(${hThumb.offset}px)` }"
        @pointerdown="startDrag('h', $event)"
      />
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '../../styles/components/grid/excel-grid.scss' as *;
</style>
