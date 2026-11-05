<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
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
const OVERSCAN = 6
const MIN_THUMB = 28

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
}>()

const emit = defineEmits<{
  (e: 'cell-change', payload: { rowId: string; field: string; value: string }): void
  (e: 'select', payload: { rowId: string; field: string; extend: boolean }): void
  (e: 'select-row', payload: { rowId: string; extend: boolean }): void
  (e: 'request-save-row', id: string): void
  (e: 'activate', payload: { rowId: string; field: string }): void
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

  let right = 0
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
    props.fields.reduce((sum, field) => sum + field.width, 0),
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

function onRowPointerDown(rowId: string, event: PointerEvent): void {
  if (isMouseLike(event)) {
    if (event.button !== 0) return
    event.preventDefault()
  }
  if (editing.value) commitEditing()
  emit('select-row', { rowId, extend: event.shiftKey })
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

function valueOf(row: GridRow, field: GridField): string {
  return row.fields[field.key] ?? ''
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
          >
            #
          </div>
          <div
            v-for="col in columns"
            :key="col.field.key"
            class="xhead"
            :class="{ 'xhead--frozen': col.stickyLeft !== null || col.stickyRight !== null }"
            :style="{
              width: `${col.field.width}px`,
              left: col.stickyLeft !== null ? `${col.stickyLeft}px` : undefined,
              right: col.stickyRight !== null ? `${col.stickyRight}px` : undefined,
            }"
            :title="col.field.label"
          >
            {{ col.field.label }}
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
            @pointerdown="onRowPointerDown(entry.row.id, $event)"
          >
            <span v-if="entry.index < draftStart">{{ entry.index + 1 }}</span>
            <span v-else class="xcell__draft-mark">+</span>
            <button
              v-if="entry.index < draftStart && canEdit(entry.row) && !saving"
              class="xcell__row-save"
              type="button"
              title="保存该行"
              @pointerdown.stop
              @click.stop="emit('request-save-row', entry.row.id)"
            >
              ✓
            </button>
          </div>

          <div
            v-for="col in columns"
            :key="col.field.key"
            class="xcell"
            :class="{
              'xcell--frozen': col.stickyLeft !== null || col.stickyRight !== null,
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
            :title="cellError(entry.row.id, col.field.key) || valueOf(entry.row, col.field)"
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

<style scoped>
.xgrid {
  position: relative;
  width: 100%;
  border: 1px solid var(--el-border-color);
  border-radius: 6px;
  overflow: hidden;
  background: var(--el-bg-color);
  user-select: none;
}

.xgrid__viewport {
  position: absolute;
  inset: 0 10px 10px 0;
  overflow: auto;
  /* The external tracks are the visible scrollbars; the native ones must not
     compete with them or two drivers end up fighting over scrollTop. */
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.xgrid__viewport::-webkit-scrollbar {
  display: none;
}

.xgrid__canvas {
  position: relative;
  min-width: 100%;
}

.xgrid__head {
  position: sticky;
  top: 0;
  z-index: 4;
  display: flex;
  background: var(--el-fill-color-light);
  border-bottom: 1px solid var(--el-border-color);
  box-sizing: border-box;
}

.xhead {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  padding: 0 8px;
  height: 100%;
  box-sizing: border-box;
  border-right: 1px solid var(--el-border-color-lighter);
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-regular);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  background: var(--el-fill-color-light);
}

.xhead--rownum,
.xcell--rownum {
  justify-content: center;
  padding: 0;
  color: var(--el-text-color-secondary);
  font-variant-numeric: tabular-nums;
}

/* The row-number column is the first frozen slot. Without sticky here it
   scrolls away and the frozen data columns keep a 56px gap in front of them. */
.xhead--rownum {
  position: sticky;
  left: 0;
  z-index: 6;
}

.xcell--rownum {
  position: sticky;
  left: 0;
  z-index: 2;
}

/* Both axes on one element: vertical for the header, horizontal for freeze. */
.xhead--frozen {
  position: sticky;
  z-index: 5;
}

.xgrid__row {
  display: flex;
  box-sizing: border-box;
  border-bottom: 1px solid var(--el-border-color-lighter);
  background: var(--el-bg-color);
}

.xgrid__row--alt {
  background: var(--el-fill-color-blank);
}

.xgrid__row--readonly {
  color: var(--el-text-color-secondary);
}

.xgrid__row--draft {
  font-style: italic;
}

.xgrid__row--draft .xcell__text {
  color: var(--el-text-color-placeholder);
}

.xcell {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 8px;
  box-sizing: border-box;
  border-right: 1px solid var(--el-border-color-lighter);
  font-size: 12px;
  line-height: 28px;
  white-space: nowrap;
  overflow: hidden;
  position: relative;
  /* Inherit the row background so frozen cells stay opaque while scrolling and
     still follow zebra/hover states. */
  background: inherit;
}

.xcell--frozen {
  position: sticky;
  z-index: 2;
  box-shadow: 1px 0 0 var(--el-border-color-lighter);
}

.xcell--numeric {
  justify-content: flex-end;
}

.xcell--selected {
  box-shadow: inset 0 0 0 2px var(--el-color-primary);
  background: var(--el-color-primary-light-9);
  z-index: 3;
}

.xcell--error {
  background: var(--el-color-danger-light-9);
  box-shadow: inset 0 0 0 1px var(--el-color-danger);
}

.xcell__text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.xcell__editor {
  width: 100%;
  height: 24px;
  border: 1px solid var(--el-color-primary);
  border-radius: 2px;
  padding: 0 6px;
  font-size: 12px;
  outline: none;
  background: var(--el-bg-color);
  color: var(--el-text-color-primary);
}

.xcell__draft-mark {
  color: var(--el-color-primary);
}

.xcell__spinner {
  position: absolute;
  right: 4px;
  width: 10px;
  height: 10px;
  border: 2px solid var(--el-color-primary-light-5);
  border-top-color: var(--el-color-primary);
  border-radius: 50%;
  animation: xgrid-spin 0.7s linear infinite;
}

.xcell__row-save {
  position: absolute;
  right: 2px;
  top: 50%;
  transform: translateY(-50%);
  width: 18px;
  height: 18px;
  padding: 0;
  border: 1px solid var(--el-color-primary);
  border-radius: 3px;
  background: var(--el-bg-color);
  color: var(--el-color-primary);
  font-size: 11px;
  line-height: 1;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.12s ease;
}

.xgrid__row:hover .xcell__row-save {
  opacity: 1;
}

@keyframes xgrid-spin {
  to {
    transform: rotate(360deg);
  }
}

/* 6s bulk-write heartbeat: opacity only, on a pseudo element, so it stays on
   the compositor and never triggers a repaint of the row. */
.xgrid__row--pulse {
  position: relative;
}

.xgrid__row--pulse::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: var(--el-color-primary-light-7);
  opacity: 0;
  will-change: opacity;
  animation: xgrid-pulse 6s ease-out forwards;
}

@keyframes xgrid-pulse {
  0% {
    opacity: 0.55;
  }
  100% {
    opacity: 0;
  }
}

.xgrid__row--saving .xcell {
  opacity: 0.7;
}

.xgrid__sb {
  position: absolute;
  z-index: 10;
  background: var(--el-fill-color-lighter);
  border-radius: 5px;
}

.xgrid__sb--v {
  top: 0;
  right: 0;
  width: 9px;
  bottom: 10px;
}

.xgrid__sb--h {
  left: 0;
  right: 10px;
  bottom: 0;
  height: 9px;
}

.xgrid__sb.is-idle {
  opacity: 0.35;
}

.xgrid__sb.is-idle .xgrid__thumb {
  cursor: default;
}

.xgrid__thumb {
  position: absolute;
  background: var(--el-text-color-disabled);
  border-radius: 5px;
  cursor: grab;
  touch-action: none;
}

.xgrid__sb--v .xgrid__thumb {
  left: 1px;
  right: 1px;
  top: 0;
}

.xgrid__sb--h .xgrid__thumb {
  top: 1px;
  bottom: 1px;
  left: 0;
}

.xgrid__thumb:active {
  cursor: grabbing;
}
</style>

<style scoped>
/* ── White-green zebra theme ─────────────────────────────────────────
   The grid stays a light "sheet" in both app themes, like a spreadsheet
   pasted into the page. Every green is derived from the project's existing
   --accent, so the table cannot drift away from the rest of the UI.
   The plain hex values before each color-mix() are fallbacks for engines
   without color-mix(); the second declaration wins where it is supported. */
.xgrid {
  --xg-green: var(--accent);
  --xg-white: #ffffff;
  --xg-stripe: #f1f8f5;
  --xg-stripe: color-mix(in srgb, var(--xg-green) 9%, #ffffff);
  --xg-head: #e8f4ef;
  --xg-head: color-mix(in srgb, var(--xg-green) 15%, #ffffff);
  --xg-head-alt: #dff0e9;
  --xg-head-alt: color-mix(in srgb, var(--xg-green) 22%, #ffffff);
  --xg-line: #d9eae3;
  --xg-line: color-mix(in srgb, var(--xg-green) 20%, #ffffff);
  --xg-hover: #eef8f4;
  --xg-hover: color-mix(in srgb, var(--xg-green) 7%, #ffffff);
  --xg-selected: #d9f2e9;
  --xg-selected: color-mix(in srgb, var(--xg-green) 18%, #ffffff);
  --xg-muted: #71857c;
  --xg-text: #1f2d28;
  border-color: var(--xg-line);
  background: var(--xg-white);
  color: var(--xg-text);
}

/* Header: green-tinted, opaque so the virtual rows scroll underneath it. */
.xgrid__head {
  background: var(--xg-head);
  border-bottom: 1px solid var(--xg-green);
}

.xhead {
  background: var(--xg-head);
  border-right-color: var(--xg-line);
  color: #2b5a4d;
}

.xhead--rownum {
  background: var(--xg-head-alt);
  color: #5d7a70;
}

/* Rows: white / pale green stripes, then hover, then selection. */
.xgrid__row {
  background: var(--xg-white);
  border-bottom-color: var(--xg-line);
  color: var(--xg-text);
}

.xgrid__row--alt {
  background: var(--xg-stripe);
}

.xgrid__row:hover {
  background: var(--xg-hover);
}

.xgrid__row--readonly {
  color: var(--xg-muted);
}

.xgrid__row--draft {
  background: #fbfefc;
}

.xgrid__row--alt.xgrid__row--draft {
  background: var(--xg-stripe);
}

.xgrid__row--draft .xcell__text {
  color: #93a89f;
}

.xcell {
  border-right-color: var(--xg-line);
  color: inherit;
  cursor: cell;
}

.xgrid__row .xcell--rownum {
  background: var(--xg-head);
  border-right-color: var(--xg-line);
  color: #5d7a70;
  cursor: pointer;
}

.xgrid__row--alt .xcell--rownum {
  background: var(--xg-head-alt);
}

.xgrid__row .xcell--rownum-selected {
  background: var(--xg-selected);
  color: var(--xg-green);
  font-weight: 600;
}

/* The range is drawn by .xgrid__selection, so cells only carry the fill. */
.xgrid__row .xcell--selected {
  background: var(--xg-selected);
  box-shadow: none;
}

.xcell--error {
  background: #fdecea;
  box-shadow: inset 0 0 0 1px #e05a52;
}

/* Errors must stay visible inside the selection fill. */
.xgrid__row .xcell--error {
  background: #fdecea;
  box-shadow: inset 0 0 0 1px #e05a52;
}

.xgrid__selection {
  position: absolute;
  /* Below frozen cells (z-index 2) so a rectangle scrolled under a frozen
     column is clipped by it instead of drawing on top of its text. */
  z-index: 1;
  box-sizing: border-box;
  border: 2px solid var(--xg-green);
  pointer-events: none;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.65);
}

.xcell__editor {
  background: var(--xg-white);
  border-color: var(--xg-green);
  color: var(--xg-text);
}

.xcell__draft-mark {
  color: var(--xg-green);
}

.xcell__row-save {
  background: var(--xg-white);
  border-color: var(--xg-green);
  color: var(--xg-green);
}

.xcell__spinner {
  border-color: var(--xg-line);
  border-top-color: var(--xg-green);
}

.xgrid__row--pulse::after {
  background: color-mix(in srgb, var(--xg-green) 35%, transparent);
}

.xgrid__sb {
  background: #edf6f2;
}

.xgrid__thumb {
  background: #a9c7bc;
  background: color-mix(in srgb, var(--xg-green) 38%, #ffffff);
}
</style>
