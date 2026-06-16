<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import type { ElTable } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { useSupplierStore } from '@/stores/supplierStore'
import { useSupplierParser } from '@/composables/useSupplierParser'
import type { SupplierProduct } from '@/types/supplier'
import ConfirmButton from '@/components/common/ConfirmButton.vue'
import { ElMessage } from 'element-plus'

const { t } = useI18n()
const store = useSupplierStore()
const { getProductLabel } = useSupplierParser()
const tableRef = ref<InstanceType<typeof ElTable>>()

// 抽屉状态
const drawerVisible = ref(false)
const drawerProduct = ref<SupplierProduct | null>(null)
const draftData = ref<Record<string, string>>({})

// 始终可见的主字段（不区分大小写）
const PRIMARY_FIELD_PATTERNS = [
  'id', '商品id', 'sku', '编号', 'product id',
  'title', '商品名称', '名称', 'name', 'product name', 'product title',
  'brand', '品牌',
  'category', '类别', '分类',
]

const dataKeysAll = computed(() => {
  const keys = new Set<string>()
  store.products.forEach((p) => Object.keys(p.rawData).forEach((k) => keys.add(k)))
  return Array.from(keys)
})

function openDrawer(row: SupplierProduct) {
  drawerProduct.value = row
  draftData.value = { ...row.rawData }
  drawerVisible.value = true
}

function saveDrawer() {
  if (!drawerProduct.value) return
  const index = store.products.findIndex((p) => p.id === drawerProduct.value!.id)
  if (index !== -1) {
    store.products[index] = { ...store.products[index], rawData: { ...draftData.value } }
  }
  drawerVisible.value = false
  drawerProduct.value = null
  ElMessage.success(t('common.saved'))
}

function cancelDrawer() {
  drawerVisible.value = false
  drawerProduct.value = null
}

const labelColumn = { key: '__label__', label: t('supplier.columns.title'), width: 200 }

const visibleColumns = computed(() =>
  dataKeysAll.value
    .filter((key) =>
      PRIMARY_FIELD_PATTERNS.some((pattern) => key.toLowerCase() === pattern.toLowerCase()),
    )
    .map((key) => ({ key, label: key, minWidth: 120 })),
)

const hiddenColumns = computed(() =>
  dataKeysAll.value
    .filter((key) =>
      !PRIMARY_FIELD_PATTERNS.some((pattern) => key.toLowerCase() === pattern.toLowerCase()),
    )
    .map((key) => ({ key, label: key, minWidth: 120 })),
)

function getCellValue(product: SupplierProduct, key: string): string {
  if (key === '__label__') return getProductLabel(product)
  return product.rawData[key] || '-'
}

function onSelectionChange(rows: SupplierProduct[]) {
  const ids = new Set(rows.map((r) => r.id))
  store.selectedIds = ids
}

watch(() => store.products, () => {
  nextTick(() => {
    if (!tableRef.value) return
    tableRef.value.clearSelection()
    store.products.forEach((p) => {
      if (store.selectedIds.has(p.id)) {
        tableRef.value!.toggleRowSelection(p, true)
      }
    })
  })
}, { deep: true })
</script>

<template>
  <div class="preview-section">
    <div class="preview-header">
      <div class="preview-info">
        <el-icon><Document /></el-icon>
        <span>{{ store.currentFileName || 'Products' }}</span>
        <el-tag size="small" type="info">{{ store.products.length }} {{ t('supplier.items') }}</el-tag>
      </div>
      <div class="preview-actions">
        <ConfirmButton
          class="delete-btn"
          text
          :confirm-title="t('common.confirmTitle')"
          :confirm-message="t('supplier.confirmClearAll')"
          @click="store.clearAll()"
        >
          <el-icon><Upload /></el-icon>
          {{ t('supplier.uploadAnother') }}
        </ConfirmButton>
      </div>
    </div>

    <div class="preview-table">
      <el-table
        ref="tableRef"
        :data="store.products"
        style="width: 100%"
        row-key="id"
        max-height="520"
        @selection-change="onSelectionChange"
      >
        <el-table-column type="selection" width="44" />
        <el-table-column
          :key="labelColumn.key"
          :prop="labelColumn.key"
          :label="labelColumn.label"
          :width="labelColumn.width"
          show-overflow-tooltip
        >
          <template #default="{ row }">{{ getProductLabel(row) }}</template>
        </el-table-column>
        <el-table-column
          v-for="col in visibleColumns"
          :key="col.key"
          :prop="col.key"
          :label="col.label"
          :min-width="col.minWidth"
          class-name="desktop-only"
          show-overflow-tooltip
        >
          <template #default="{ row }">{{ getCellValue(row, col.key) }}</template>
        </el-table-column>
        <el-table-column v-if="hiddenColumns.length > 0" width="48" fixed="right">
          <template #default="{ row }">
            <el-button text size="small" class="ellipsis-btn" @click="openDrawer(row)">
              <el-icon><MoreFilled /></el-icon>
            </el-button>
          </template>
        </el-table-column>
        <el-table-column :label="t('common.actions')" width="120" fixed="right">
          <template #default="{ row }">
            <ConfirmButton
               class="delete-btn"
               text
               type="danger"
               size="small"
               :confirm-title="t('common.confirmTitle')"
               :confirm-message="t('supplier.confirmDelete')"
               @click="store.removeProduct(row.id)"
             >
              {{ t('common.delete') }}
            </ConfirmButton>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 商品详情抽屉 -->
    <el-drawer
      v-model="drawerVisible"
      :title="t('supplier.editProduct')"
      direction="rtl"
      size="480px"
      destroy-on-close
    >
      <template v-if="drawerProduct">
        <div class="drawer-body">
          <div class="drawer-header">
            <el-tag type="info" effect="plain">{{ getProductLabel(drawerProduct) }}</el-tag>
          </div>
          <div class="drawer-fields">
            <div v-for="(value, key) in draftData" :key="key" class="drawer-field">
              <label class="drawer-label">{{ key }}</label>
              <el-input
                v-model="draftData[key]"
                :placeholder="key"
                size="large"
                clearable
              />
            </div>
          </div>
        </div>
      </template>
      <template #footer>
        <div class="drawer-footer">
          <el-button @click="cancelDrawer">{{ t('common.cancel') }}</el-button>
          <el-button type="primary" @click="saveDrawer">{{ t('common.save') }}</el-button>
        </div>
      </template>
    </el-drawer>
  </div>
</template>

<style scoped>
.preview-section {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  overflow: hidden;
  margin-top: 24px;
}
.preview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-card);
}
.preview-info {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 500;
}
.preview-actions {
  display: flex;
  gap: 8px;
}
.preview-table {
  padding: 4px;
  overflow-x: auto;
}
.preview-table :deep(.el-table th) {
  font-weight: 600;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.preview-table :deep(.el-table .cell) {
  font-size: 13px;
}
.preview-table :deep(.el-table__fixed-right) {
  right: 0 !important;
  box-shadow: -4px 0 8px rgba(0, 0, 0, 0.1);
}
.preview-table :deep(.el-table .el-table__fixed) {
  box-shadow: 4px 0 8px rgba(0, 0, 0, 0.1);
}
.edit-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
.edit-field { display: flex; flex-direction: column; gap: 6px; }
.edit-field label { font-size: 13px; font-weight: 500; color: var(--text-secondary); text-transform: capitalize; }
.ellipsis-btn { padding: 4px; font-size: 16px; }

/* 抽屉样式 */
.drawer-body { padding: 0 4px; }
.drawer-header { margin-bottom: 24px; }
.drawer-fields { display: flex; flex-direction: column; gap: 18px; }
.drawer-field { display: flex; flex-direction: column; gap: 6px; }
.drawer-label { font-size: 12px; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px; }
.drawer-footer { display: flex; justify-content: flex-end; gap: 12px; padding-top: 8px; }

/* 统一的删除按钮样式 */
:deep(.delete-btn) {
  transition: all var(--transition-fast, 0.2s) !important;
}
:deep(.delete-btn:hover) {
  opacity: 0.8;
  transform: scale(1.04);
}
:deep(.delete-btn:hover .el-icon) {
  transform: scale(1.1);
}
:deep(.delete-btn .el-icon) {
  transition: transform var(--transition-fast, 0.2s);
}

@media (max-width: 768px) {
  .preview-header { flex-direction: column; gap: 12px; align-items: flex-start; }
  .preview-actions { width: 100%; justify-content: flex-end; }
  .edit-grid { grid-template-columns: 1fr; }
  .preview-info { font-size: 13px; }
  .preview-table :deep(.desktop-only) { display: none; }
}
</style>
