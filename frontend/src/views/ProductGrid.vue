<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import ExcelGrid from '@/components/grid/ExcelGrid.vue'
import GridToolbar from '@/components/grid/GridToolbar.vue'
import GridLayoutPanel from '@/components/grid/GridLayoutPanel.vue'
import ImportReportDialog from '@/components/grid/ImportReportDialog.vue'
import ProductInfoDialog from '@/components/common/ProductInfoDialog.vue'
import LanguageRadialMenu from '@/components/listing/LanguageRadialMenu.vue'
import { useProductGrid } from '@/composables/useProductGrid'
import { useGridSelection } from '@/composables/useGridSelection'
import { useGridClipboard } from '@/composables/useGridClipboard'
import { useListingGeneration, listingToFields } from '@/composables/useListingGeneration'
import { useAuthStore } from '@/stores/authStore'
import { useModelStore } from '@/stores/modelStore'
import { useSupplierStore } from '@/stores/supplierStore'
import { uploadSupplier } from '@/api/supplier'
import { FILE_ACCEPT_EXTENSIONS, GRID_DEFAULT_PAGE_SIZE, PLATFORMS } from '@/utils/constants'
import type { GridImportIssue, GridLayout, GridRow } from '@/types/grid'

/**
 * 商品上架表 — the single page for supplier data.
 *
 * It replaces the old two-step flow (上传页 → 表格页): importing is a toolbar
 * button or a drop on the table, imported rows are persisted immediately, and a
 * row can be generated in place — the listing is written back into the same row
 * and saved, so the table is always the source of truth.
 */

const { t } = useI18n()
const auth = useAuthStore()
const modelStore = useModelStore()
const supplierStore = useSupplierStore()
const router = useRouter()

const regionRef = ref<HTMLElement | null>(null)
const gridRef = ref<InstanceType<typeof ExcelGrid> | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const gridHeight = ref(480)
const layoutOpen = ref(false)
const reportOpen = ref(false)
const importReport = ref<{
  version: number
  fileName: string
  added: number
  skipped: number
  issues: GridImportIssue[]
} | null>(null)
let reportVersion = 0

const importing = ref(false)
const generatingIds = ref<string[]>([])
const dragging = ref(false)
let dragDepth = 0

const ring = ref({ open: false, rowId: '', x: 0, y: 0 })

const ownerId = () => auth.user?.id ?? ''
const ownerName = () => auth.user?.username ?? ''

const grid = useProductGrid({
  gridName: 'product-grid',
  identity: () => ownerId() || 'anon',
  canEdit: (row: GridRow) => {
    if (!auth.isLoggedIn) return false
    if (auth.isAdmin) return true
    // A draft row with no owner is editable by whoever is looking at it; once
    // it is typed into it belongs to that user.
    return !row.ownerId || row.ownerId === ownerId()
  },
  pageSize: GRID_DEFAULT_PAGE_SIZE,
  onNotice: (notice) => {
    ElMessage({ message: notice.message, type: notice.type, duration: 2200 })
  },
})

const {
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
} = grid

const selectionApi = useGridSelection()
const selection = selectionApi.selection

const { platform, generate } = useListingGeneration()

const selectedRowIds = computed(() => {
  const box = selectionApi.bounds(rows.value, visibleFields.value)
  if (!box) return []
  return rows.value.slice(box.rowStart, box.rowEnd + 1).map((row) => row.id)
})

const selectionSize = computed(() => {
  const box = selectionApi.bounds(rows.value, visibleFields.value)
  if (!box) return null
  return {
    rows: box.rowEnd - box.rowStart + 1,
    cols: box.colEnd - box.colStart + 1,
  }
})

const canWrite = computed(() => auth.isLoggedIn)

// ── Row detail modal (double-click the row-number gutter) ───────────
const detailOpen = ref(false)
const detailRowId = ref('')

const detailRow = computed(() =>
  detailRowId.value ? grid.findRow(detailRowId.value) ?? null : null,
)
const detailCanEdit = computed(() => (detailRow.value ? grid.canEditFor(detailRow.value) : false))
const detailTitle = computed(() => {
  const row = detailRow.value
  if (!row) return ''
  return row.fields.productName || row.fields.sku || row.id
})
const detailSubtitle = computed(() => {
  const row = detailRow.value
  if (!row) return ''
  return [row.fields.sku, row.fields.category, row.ownerName]
    .filter((value) => Boolean(value && value.trim()))
    .join(' · ')
})

function onRowOpen(payload: { rowId: string }): void {
  const row = grid.findRow(payload.rowId)
  if (!row) return
  gridRef.value?.commitEditing()
  detailRowId.value = payload.rowId
  detailOpen.value = true
}

/**
 * The modal is an explicit edit surface: apply every field, then persist the
 * row immediately so closing the modal never leaves a silent draft behind.
 */
async function onDetailSave(values: Record<string, string>): Promise<void> {
  const row = detailRow.value
  if (!row) return
  if (!grid.canEditFor(row)) {
    ElMessage.warning(t('grid.rowNoPermission'))
    return
  }

  const changed = grid.applyFields(row.id, values)
  detailOpen.value = false
  if (!changed) {
    ElMessage.info(t('grid.infoUnchanged'))
    return
  }

  const saved = await grid.saveOne(row.id)
  if (saved) ElMessage.success(t('grid.infoSaved'))
}

const clipboard = useGridClipboard({
  rows,
  fields: visibleFields,
  selection,
  canEdit: (row) => grid.canEditFor(row),
  setCell: (rowId, field, value) => grid.setCell(rowId, field, value),
  applyPaste: (anchor, matrix, opts) => {
    // Pasting a block from inside an editor must close it first, otherwise the
    // editor would commit its stale value on top of the pasted one.
    gridRef.value?.commitEditing()
    return grid.applyPaste(anchor, matrix, opts)
  },
  move: (deltaRow, deltaCol, extend) =>
    selectionApi.move(deltaRow, deltaCol, rows.value, visibleFields.value, extend),
  clearSelection: () => selectionApi.clear(),
  selectAll: () => selectionApi.selectAll(rows.value, visibleFields.value),
  edit: (rowId, field) => gridRef.value?.beginEdit(rowId, field),
  notify: (notice) => ElMessage({ message: notice.message, type: notice.type, duration: 2200 }),
})

// ── First frame: measure, build the empty table, then load ──────────
function measureHeight(): void {
  const el = regionRef.value
  if (!el) return
  // Read the container directly: no initial guess that has to be corrected
  // with a second layout pass.
  gridHeight.value = Math.max(240, el.clientHeight - 8)
}

let resizeObserver: ResizeObserver | null = null

onMounted(async () => {
  grid.setOwnerResolver(() => ({ id: ownerId(), name: ownerName() }))
  measureHeight()
  // Table (header + draft row) appears before any request resolves.
  grid.initEmpty()

  resizeObserver = new ResizeObserver(() => measureHeight())
  if (regionRef.value) resizeObserver.observe(regionRef.value)

  try {
    await grid.loadPage(1)
  } catch (err) {
    console.error('[ProductGrid] initial load failed:', err)
    ElMessage.error(t('grid.loadFailed'))
  } finally {
    initializing.value = false
  }

  // A file dropped outside this page is stashed by the layout and picked up
  // here once the grid is ready.
  const pending = supplierStore.pendingFile as File | null
  if (pending) {
    supplierStore.setPendingFile(null)
    void importFile(pending)
  }
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
})

// ── Grid events ─────────────────────────────────────────────────────
function focusRegion(): void {
  regionRef.value?.focus({ preventScroll: true })
}

function onSelect(payload: { rowId: string; field: string; extend: boolean }): void {
  focusRegion()
  if (payload.extend) selectionApi.extend(payload.rowId, payload.field)
  else selectionApi.select(payload.rowId, payload.field)
}

/**
 * Clicking the row-number gutter owns the whole row; dragging down the gutter
 * extends that to a block of rows. The anchor stays on the first column and the
 * focus moves to the last one, which is exactly what makes copy emit all fields.
 */
function onSelectRow(payload: { rowId: string; extend: boolean }): void {
  focusRegion()
  if (payload.extend) selectionApi.extendRow(payload.rowId, visibleFields.value)
  else selectionApi.selectRow(payload.rowId, visibleFields.value)
}

function onCellChange(payload: { rowId: string; field: string; value: string }): void {
  grid.setCell(payload.rowId, payload.field, payload.value)
}

async function onRowSave(rowId: string): Promise<void> {
  gridRef.value?.commitEditing()
  await grid.saveOne(rowId)
}

// ── Toolbar actions ─────────────────────────────────────────────────
async function onAdd(): Promise<void> {
  const id = grid.addRow()
  const index = rows.value.findIndex((row) => row.id === id)
  await nextTick()
  gridRef.value?.scrollRowIntoView(Math.max(0, index))
  const firstField = visibleFields.value[0]?.key
  if (firstField) {
    selectionApi.select(id, firstField)
    gridRef.value?.beginEdit(id, firstField)
  }
}

function onDelete(): void {
  const ids = selectedRowIds.value
  if (ids.length === 0) {
    ElMessage.info(t('grid.selectFirst'))
    return
  }
  const result = grid.deleteRows(ids)
  if (result.deleted === 0 && result.skipped > 0) {
    ElMessage.warning(t('grid.cannotDelete'))
    return
  }
  if (result.skipped > 0) {
    ElMessage.warning(t('grid.partialDelete', { deleted: result.deleted, skipped: result.skipped }))
  }
  // Deletion is a draft change: the row disappears now, but the batch endpoint
  // only receives it when the user presses Save (or discards it).
  if (result.deleted > 0) {
    ElMessage.info(t('grid.deleteDraftedCount', { count: result.deleted }))
  }
}

async function onSave(): Promise<boolean> {
  gridRef.value?.commitEditing()
  return await grid.savePage()
}

async function onDiscard(): Promise<void> {
  try {
    await ElMessageBox.confirm(t('grid.discardConfirm'), t('grid.discardTitle'), {
      type: 'warning',
      confirmButtonText: t('grid.discardOk'),
      cancelButtonText: t('grid.cancel'),
    })
    grid.discardChanges()
    ElMessage.info(t('grid.discarded'))
  } catch {
    // cancelled
  }
}

function onExport(): void {
  const visible = visibleFields.value
  const data = rows.value.filter((row, index) => index < draftStart.value)
  if (data.length === 0) {
    ElMessage.info(t('grid.nothingToExport'))
    return
  }

  // CSV rather than xlsx: the frontend no longer depends on SheetJS (the local
  // parser was removed), and Excel/WPS open a UTF-8 BOM CSV without prompting.
  const escape = (value: string): string =>
    /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
  const header = visible.map((field) => field.label)
  const body = data.map((row) => visible.map((field) => row.fields[field.key] ?? ''))
  const csv = [header, ...body].map((row) => row.map(escape).join(',')).join('\r\n')

  const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `products-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
  ElMessage.success(t('grid.exported', { count: data.length }))
}

function onLayoutApply(next: GridLayout): void {
  grid.applyLayout(next)
}

function onLayoutReset(): void {
  grid.resetLayout()
  ElMessage.info(t('grid.layoutReset'))
}

function onLayoutSaveDefault(next: GridLayout): void {
  grid.applyLayout(next)
  grid.saveLayoutAsDefault()
  ElMessage.success(t('grid.layoutSaved'))
}

// ── Import (toolbar button + drop on the table) ─────────────────────
function onImportClick(): void {
  if (!canWrite.value) {
    ElMessage.warning(t('grid.loginToImport'))
    return
  }
  fileInput.value?.click()
}

function onFilePicked(event: Event): void {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (file) void importFile(file)
}

function onDragEnter(event: DragEvent): void {
  if (!event.dataTransfer?.types.includes('Files')) return
  dragDepth += 1
  dragging.value = true
}

function onDragLeave(): void {
  dragDepth = Math.max(0, dragDepth - 1)
  if (dragDepth === 0) dragging.value = false
}

function onDropFile(event: DragEvent): void {
  dragDepth = 0
  dragging.value = false
  const file = event.dataTransfer?.files?.[0]
  if (file) void importFile(file)
}

function isAcceptedFile(file: File): boolean {
  const ext = '.' + (file.name.split('.').pop()?.toLowerCase() ?? '')
  return FILE_ACCEPT_EXTENSIONS.includes(ext)
}

/**
 * Parse → map headers → append before the draft block → persist.
 *
 * Import is a write into the 上架表, not a preview: the rows survive a reload,
 * which is what makes "generate straight from the table" work.
 */
async function importFile(file: File): Promise<void> {
  if (!canWrite.value) {
    ElMessage.warning(t('grid.loginToImport'))
    return
  }
  if (!isAcceptedFile(file)) {
    ElMessage.warning(t('grid.unsupportedFile'))
    return
  }
  if (importing.value) return

  importing.value = true
  try {
    const response = await uploadSupplier(file)
    const products = response.products ?? []
    if (products.length === 0) {
      ElMessage.error(t('grid.importEmpty'))
      return
    }

    const result = grid.importRecords(
      products.map((product) => product.rawData),
      2,
    )
    importReport.value = {
      version: ++reportVersion,
      fileName: file.name,
      added: result.added,
      skipped: result.skipped,
      issues: result.issues,
    }

    if (result.added === 0) {
      reportOpen.value = true
      ElMessage.warning(t('grid.importNothing'))
      return
    }

    const saved = await grid.saveAll()
    if (!saved) {
      ElMessage.warning(t('grid.importPartial', { count: result.added }))
    } else {
      ElMessage.success(t('grid.importedSaved', { count: result.added }))
    }
    if (result.skipped > 0) reportOpen.value = true
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[ProductGrid] import failed:', error)
    ElMessage.error(`${t('grid.importFailed')}: ${message}`)
  } finally {
    importing.value = false
  }
}

function onRowDelete(payload: { rowId: string }): void {
  const result = grid.deleteRows([payload.rowId])
  if (result.deleted === 0) {
    ElMessage.warning(t('grid.cannotDelete'))
    return
  }
  focusRegion()
  ElMessage.info(t('grid.deleteDrafted'))
}

// ── Per-row generation ─────────────────────────────────────────────
function onRowGenerate(payload: { rowId: string; x: number; y: number }): void {
  if (!auth.isLoggedIn) {
    ElMessage.warning(t('grid.loginToGenerate'))
    return
  }
  if (!modelStore.hasAnyConfigured) {
    ElMessage.warning(t('grid.noModel'))
    router.push('/model-manager')
    return
  }
  ring.value = { open: true, rowId: payload.rowId, x: payload.x, y: payload.y }
}

async function onRingSelect(language: string): Promise<void> {
  const rowId = ring.value.rowId
  ring.value.open = false
  if (!rowId) return
  await generateRow(rowId, language)
}

/**
 * Generates one row and writes the listing straight back into it.
 *
 * Persisting here is intentional: the table is the deliverable, so a generated
 * row that only lives in memory would be lost on the next page change.
 */
async function generateRow(rowId: string, language: string): Promise<void> {
  const row = rows.value.find((candidate) => candidate.id === rowId)
  if (!row || generatingIds.value.includes(rowId)) return

  generatingIds.value = [...generatingIds.value, rowId]
  try {
    const listing = await generate({ id: row.id, fields: { ...row.fields } }, language)
    const patch = listingToFields(listing)
    if (!patch.title && !patch.description) {
      ElMessage.warning(t('grid.generateEmpty'))
      return
    }

    const changed = grid.applyFields(rowId, patch)
    if (!changed) {
      ElMessage.info(t('grid.generateUnchanged'))
      return
    }

    const saved = await grid.saveOne(rowId, { silent: true })
    grid.startBatchPulse([rowId])
    if (saved) {
      ElMessage.success(t('grid.generatedSaved', { name: row.fields.productName || row.fields.sku || rowId }))
    } else {
      ElMessage.warning(t('grid.generateNotSaved'))
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message === 'NO_MODEL') {
      ElMessage.warning(t('grid.noModel'))
      router.push('/model-manager')
      return
    }
    console.error('[ProductGrid] generation failed:', error)
    ElMessage.error(`${t('grid.generateFailed')}: ${message}`)
  } finally {
    generatingIds.value = generatingIds.value.filter((id) => id !== rowId)
  }
}

// ── Paging: save / discard / cancel before leaving a dirty page ─────
/**
 * Guard shared by page changes and page-size changes. Returns false only when
 * the user should stay on the current page (dialog closed or save failed).
 */
async function confirmLeaveDirty(): Promise<boolean> {
  // A click on the pager blurs the open cell editor, but its commit only makes
  // `dirty` true after the 120ms summary debounce. Commit + recompute now so a
  // just-typed value can never be lost by an immediate page change.
  gridRef.value?.commitEditing()
  grid.refreshSummary()
  if (!dirty.value) return true

  try {
    await ElMessageBox.confirm(t('grid.pageDirty'), t('grid.pageDirtyTitle'), {
      distinguishCancelAndClose: true,
      type: 'warning',
      confirmButtonText: t('grid.saveAndGo'),
      cancelButtonText: t('grid.discardAndGo'),
    })
    const ok = await onSave()
    return ok || !dirty.value
  } catch (action) {
    // "cancel" = discard and continue; any other (close) = stay here.
    if (action !== 'cancel') return false
    grid.discardChanges()
    return true
  }
}

async function onPageChange(next: number): Promise<void> {
  if (next === page.value) return
  if (!(await confirmLeaveDirty())) return

  try {
    await grid.loadPage(next)
  } catch (err) {
    console.error('[ProductGrid] page load failed:', err)
    ElMessage.error(t('grid.loadFailed'))
  }
}

/**
 * A new page size always restarts at page 1: the old page number is meaningless
 * once the slices change, and jumping to a clamped last page would surprise.
 */
async function onPageSizeChange(next: number): Promise<void> {
  if (next === pageSize.value) return
  if (!(await confirmLeaveDirty())) return

  const previous = pageSize.value
  grid.setPageSize(next)
  try {
    // loadPage() writes the resolved page back, so the toolbar never shows a
    // page that failed to load.
    await grid.loadPage(1)
  } catch (err) {
    grid.setPageSize(previous)
    console.error('[ProductGrid] page size change failed:', err)
    ElMessage.error(t('grid.loadFailed'))
  }
}

let searchTimer: ReturnType<typeof setTimeout> | null = null

function onSearch(value: string): void {
  search.value = value
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(async () => {
    searchTimer = null
    try {
      await grid.loadPage(1)
    } catch (err) {
      console.error('[ProductGrid] search failed:', err)
    }
  }, 320)
}

async function onRefresh(): Promise<void> {
  try {
    await grid.loadPage(1)
  } catch (err) {
    console.error('[ProductGrid] refresh failed:', err)
  }
}

const shortcuts = computed(() => [
  { keys: 'Ctrl + C / V / X', action: t('grid.shortcutClipboard') },
  { keys: 'Ctrl + A', action: t('grid.shortcutSelectAll') },
  { keys: 'Enter / F2', action: t('grid.shortcutEdit') },
  { keys: 'Delete', action: t('grid.shortcutClear') },
  { keys: 'Shift + ↑↓←→', action: t('grid.shortcutRange') },
])
</script>

<template>
  <div class="product-listing-page">
    <div class="page-header">
      <div>
        <p class="page-desc">{{ t('grid.description') }}</p>
      </div>
      <div class="header-tools">
        <el-select v-model="platform" size="small" class="platform-select">
          <el-option
            v-for="item in PLATFORMS"
            :key="item.value"
            :label="item.label"
            :value="item.value"
          />
        </el-select>
        <el-popover placement="bottom-end" :width="280" trigger="click">
          <template #reference>
            <el-button size="small" text>{{ t('grid.shortcuts') }}</el-button>
          </template>
          <div class="shortcut-list">
            <div v-for="item in shortcuts" :key="item.keys" class="shortcut-row">
              <kbd>{{ item.keys }}</kbd>
              <span>{{ item.action }}</span>
            </div>
          </div>
        </el-popover>
      </div>
    </div>

    <el-alert
      v-if="tableMissing"
      type="warning"
      :closable="false"
      show-icon
      :title="t('grid.tableMissing')"
      class="grid-alert"
    />

    <GridToolbar
      :dirty="dirty"
      :summary="summary"
      :saving="saving || mutating"
      :loading="loading"
      :importing="importing"
      :can-write="canWrite"
      :selected-count="selectedRowIds.length"
      :page="page"
      :page-size="pageSize"
      :total-items="totalItems"
      :total-pages="totalPages"
      :search="search"
      :ephemeral="ephemeral"
      @add="onAdd"
      @delete="onDelete"
      @save="onSave"
      @discard="onDiscard"
      @import="onImportClick"
      @export="onExport"
      @layout="layoutOpen = true"
      @update:search="onSearch"
      @update:page="onPageChange"
      @update:page-size="onPageSizeChange"
      @refresh="onRefresh"
    />

    <div
      ref="regionRef"
      class="grid-region"
      :class="{ 'is-drop-target': dragging }"
      tabindex="0"
      @dragenter.prevent.stop="onDragEnter"
      @dragover.prevent.stop
      @dragleave.prevent.stop="onDragLeave"
      @drop.prevent.stop="onDropFile"
      @copy.capture="clipboard.onCopy"
      @cut.capture="clipboard.onCut"
      @paste.capture="clipboard.onPaste"
      @keydown.capture="clipboard.onKeydown"
    >
      <ExcelGrid
        ref="gridRef"
        v-loading="initializing || loading || mutating"
        :rows="rows"
        :fields="visibleFields"
        :layout="layout"
        :selection="selection"
        :height="gridHeight"
        :can-edit="grid.canEditFor"
        :saving-ids="savingIds"
        :pulse-ids="pulseIds"
        :cell-errors="cellErrors"
        :saving="saving"
        :draft-start="draftStart"
        :actions="true"
        :action-labels="{
          header: t('grid.actionsHeader'),
          save: t('grid.saveAction'),
          generate: t('grid.generateAction'),
          delete: t('grid.deleteAction'),
        }"
        :generating-ids="generatingIds"
        @cell-change="onCellChange"
        @select="onSelect"
        @select-row="onSelectRow"
        @request-save-row="onRowSave"
        @row-open="onRowOpen"
        @row-generate="onRowGenerate"
        @row-delete="onRowDelete"
      />

      <div v-if="dragging" class="drop-hint">
        <el-icon :size="26"><UploadFilled /></el-icon>
        <span>{{ t('grid.dropToImport') }}</span>
      </div>
    </div>

    <p class="grid-footnote">
      {{ t('grid.footnote', { rows: fields.length, total: totalItems, pageSize }) }}
      <span v-if="selectionSize" class="grid-footnote__selection">
        · {{ t('grid.selectionSize', { rows: selectionSize.rows, cols: selectionSize.cols }) }}
      </span>
    </p>

    <GridLayoutPanel
      v-model:open="layoutOpen"
      :layout="layout"
      :fields="fields"
      @apply="onLayoutApply"
      @reset="onLayoutReset"
      @save-default="onLayoutSaveDefault"
    />

    <ImportReportDialog v-model:open="reportOpen" :report="importReport" />

    <ProductInfoDialog
      v-model:open="detailOpen"
      :title="detailTitle"
      :subtitle="detailSubtitle"
      :fields="fields"
      :values="detailRow?.fields ?? {}"
      editable
      :can-edit="detailCanEdit"
      :saving="saving"
      @save="onDetailSave"
    />

    <LanguageRadialMenu
      :open="ring.open"
      :x="ring.x"
      :y="ring.y"
      @select="onRingSelect"
      @close="ring.open = false"
    />

    <input
      ref="fileInput"
      type="file"
      class="hidden-file-input"
      accept=".csv,.xlsx,.xls,.txt"
      @change="onFilePicked"
    />
  </div>
</template>

<style scoped lang="scss">
@use '../styles/components/views/product-grid.scss' as *;
</style>
