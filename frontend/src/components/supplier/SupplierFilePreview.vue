<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import type { ElTable } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { useSupplierStore } from '@/stores/supplierStore'
import { useSupplierParser } from '@/composables/useSupplierParser'
import type { SupplierProduct } from '@/types/supplier'

const { t } = useI18n()
const store = useSupplierStore()
const { getProductLabel } = useSupplierParser()
const tableRef = ref<InstanceType<typeof ElTable>>()

const dataKeys = computed(() => {
  const keys = new Set<string>()
  store.products.forEach((p) => Object.keys(p.rawData).forEach((k) => keys.add(k)))
  return Array.from(keys)
})

const labelColumn = { key: '__label__', label: t('supplier.columns.title'), width: 200 }

const dataColumns = computed(() =>
  dataKeys.value.map((key) => ({
    key,
    label: key,
    minWidth: 120,
  })),
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
        <el-button text @click="store.clearAll()">
          <el-icon><Upload /></el-icon>
          {{ t('supplier.uploadAnother') }}
        </el-button>
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
          v-for="col in dataColumns"
          :key="col.key"
          :prop="col.key"
          :label="col.label"
          :min-width="col.minWidth"
          show-overflow-tooltip
        >
          <template #default="{ row }">{{ getCellValue(row, col.key) }}</template>
        </el-table-column>
        <el-table-column :label="t('common.actions')" width="100" fixed="right">
          <template #default="{ row }">
            <el-button text type="danger" size="small" @click="store.removeProduct(row.id)">{{ t('common.delete') }}</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog v-model="store.isEditing" :title="t('supplier.editProduct')" width="640px" destroy-on-close>
      <template v-if="store.editingProduct">
        <div class="edit-grid">
          <div v-for="(value, key) in store.editingProduct.rawData" :key="key" class="edit-field">
            <label>{{ key }}</label>
            <el-input v-model="store.editingProduct.rawData[key]" />
          </div>
        </div>
      </template>
      <template #footer>
        <el-button @click="store.cancelEditing()">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="store.saveEditing()">{{ t('common.save') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.preview-section { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-lg); overflow: hidden; }
.preview-header { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid var(--border-color); }
.preview-info { display: flex; align-items: center; gap: 10px; color: var(--text-primary); font-size: 14px; font-weight: 500; }
.preview-actions { display: flex; gap: 8px; }
.preview-table { padding: 4px; }
.preview-table :deep(.el-table th) { font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
.preview-table :deep(.el-table .cell) { font-size: 13px; }
.edit-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
.edit-field { display: flex; flex-direction: column; gap: 6px; }
.edit-field label { font-size: 13px; font-weight: 500; color: var(--text-secondary); text-transform: capitalize; }

@media (max-width: 768px) {
  .preview-header { flex-direction: column; gap: 12px; align-items: flex-start; }
  .preview-actions { width: 100%; justify-content: flex-end; }
  .edit-grid { grid-template-columns: 1fr; }
  .preview-info { font-size: 13px; }
}
</style>
