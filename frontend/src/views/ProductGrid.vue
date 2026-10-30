<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import * as XLSX from 'xlsx'
import ExcelGrid from '@/components/grid/ExcelGrid.vue'
import GridToolbar from '@/components/grid/GridToolbar.vue'
import GridLayoutPanel from '@/components/grid/GridLayoutPanel.vue'
import GridImportDialog from '@/components/grid/GridImportDialog.vue'
import { useProductGrid } from '@/composables/useProductGrid'
import { useGridSelection } from '@/composables/useGridSelection'
import { useGridClipboard } from '@/composables/useGridClipboard'
import { useAuthStore } from '@/stores/authStore'
import { useSupplierStore } from '@/stores/supplierStore'
import type { GridImportIssue, GridLayout, GridRow } from '@/types/grid'

const { t } = useI18n()
const auth = useAuthStore()
const supplierStore = useSupplierStore()
const route = useRoute()
const router = useRouter()

const regionRef = ref<HTMLElement | null>(null)
const gridRef = ref<InstanceType<typeof ExcelGrid> | null>(null)
const gridHeight = ref(480)
const layoutOpen = ref(false)
const importOpen = ref(false)
const importReport = ref<{
  version: number
  fileName: string
  added: number
  skipped: number
  issues: GridImportIssue[]
} | null>(null)
let reportVersion = 0

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
  pageSize: 100,
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

const selectedRowIds = computed(() => {
  const box = selectionApi.bounds(rows.value, visibleFields.value)
  if (!box) return []
  return rows.value.slice(box.rowStart, box.rowEnd + 1).map((row) => row.id)
})

const canWrite = computed(() => auth.isLoggedIn)

const clipboard = useGridClipboard({
  rows,
  fields: visibleFields,
  selection,
  canEdit: (row) => grid.canEditFor(row),
  setCell: (rowId, field, value) => grid.setCell(rowId, field, value),
  applyPaste: (anchor, matrix, opts) => grid.applyPaste(anchor, matrix, opts),
  move: (deltaRow, deltaCol, extend) =>
    selectionApi.move(deltaRow, deltaCol, rows.value, visibleFields.value, extend),
  clearSelection: () => selectionApi.clear(),
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

  consumePendingImport()
})

/**
 * One-shot handoff from the upload page. The query flag is cleared after use so
 * a refresh does not silently re-import the same file a second time.
 */
function consumePendingImport(): void {
  if (route.query.import !== '1') return
  const parsed = supplierStore.products
  router.replace({ query: {} })
  if (parsed.length === 0) return

  const records = parsed.map((product) => ({ ...product.rawData }))
  const result = grid.importRecords(records, 2)
  importReport.value = {
    version: ++reportVersion,
    fileName: supplierStore.currentFileName || 'upload',
    added: result.added,
    skipped: result.skipped,
    issues: result.issues,
  }
  importOpen.value = true
  if (result.added > 0) {
    ElMessage.success(t('grid.imported', { count: result.added }))
  }
}

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
  } else if (result.skipped > 0) {
    ElMessage.warning(t('grid.partialDelete', { deleted: result.deleted, skipped: result.skipped }))
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
  const header = visible.map((field) => field.label)
  const body = data.map((row) => visible.map((field) => row.fields[field.key] ?? ''))
  const sheet = XLSX.utils.aoa_to_sheet([header, ...body])
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, sheet, 'products')
  XLSX.writeFile(book, `products-${new Date().toISOString().slice(0, 10)}.xlsx`)
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

function onParsed(payload: { records: Array<Record<string, string>>; fileName: string }): void {
  const result = grid.importRecords(payload.records, 2)
  importReport.value = {
    version: ++reportVersion,
    fileName: payload.fileName,
    added: result.added,
    skipped: result.skipped,
    issues: result.issues,
  }
  if (result.added > 0) {
    ElMessage.success(t('grid.imported', { count: result.added }))
  } else {
    ElMessage.warning(t('grid.importNothing'))
  }
}

// ── Paging: save / discard / cancel before leaving a dirty page ─────
async function onPageChange(next: number): Promise<void> {
  if (next === page.value) return

  if (dirty.value) {
    try {
      await ElMessageBox.confirm(t('grid.pageDirty'), t('grid.pageDirtyTitle'), {
        distinguishCancelAndClose: true,
        type: 'warning',
        confirmButtonText: t('grid.saveAndGo'),
        cancelButtonText: t('grid.discardAndGo'),
      })
      const ok = await onSave()
      if (!ok && dirty.value) return
    } catch (action) {
      // "cancel" = discard and continue; any other (close) = stay here.
      if (action !== 'cancel') return
      grid.discardChanges()
    }
  }

  try {
    await grid.loadPage(next)
  } catch (err) {
    console.error('[ProductGrid] page load failed:', err)
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
  { keys: 'Enter / F2', action: t('grid.shortcutEdit') },
  { keys: 'Delete', action: t('grid.shortcutClear') },
  { keys: 'Shift + 方向键', action: t('grid.shortcutRange') },
])
</script>

<template>
  <div class="product-grid-page">
    <div class="page-header">
      <div>
        <h1 class="page-title">{{ t('grid.title') }}</h1>
        <p class="page-desc">{{ t('grid.description') }}</p>
      </div>
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
      @import="importOpen = true"
      @export="onExport"
      @layout="layoutOpen = true"
      @update:search="onSearch"
      @update:page="onPageChange"
      @refresh="onRefresh"
    />

    <div
      ref="regionRef"
      class="grid-region"
      tabindex="0"
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
        @cell-change="onCellChange"
        @select="onSelect"
        @request-save-row="onRowSave"
      />
    </div>

    <p class="grid-footnote">
      {{ t('grid.footnote', { rows: fields.length, total: totalItems }) }}
    </p>

    <GridLayoutPanel
      v-model:open="layoutOpen"
      :layout="layout"
      :fields="fields"
      @apply="onLayoutApply"
      @reset="onLayoutReset"
      @save-default="onLayoutSaveDefault"
    />

    <GridImportDialog v-model:open="importOpen" :report="importReport" @parsed="onParsed" />
  </div>
</template>

<style scoped>
.product-grid-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  box-sizing: border-box;
}

.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.page-title {
  margin: 0 0 4px;
  font-size: 20px;
  font-weight: 600;
}

.page-desc {
  margin: 0;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.grid-alert {
  margin-bottom: 8px;
}

.grid-region {
  flex: 1;
  min-height: 0;
  outline: none;
}

.grid-footnote {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.shortcut-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
}

.shortcut-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.shortcut-row kbd {
  flex: 0 0 118px;
  font-family: var(--el-font-family-mono, monospace);
  background: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 3px;
  padding: 1px 4px;
  font-size: 11px;
  text-align: center;
}
</style>
