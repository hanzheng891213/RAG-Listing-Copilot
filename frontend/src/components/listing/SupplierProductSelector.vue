<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useListingGenerator } from '@/composables/useListingGenerator'
import { useSupplierStore } from '@/stores/supplierStore'
import type { SupplierProduct } from '@/types/supplier'

const emit = defineEmits<{ generate: [product: SupplierProduct] }>()
const { t } = useI18n()
const { productSearch, filteredProducts, getProductLabel } = useListingGenerator()
const supplierStore = useSupplierStore()

function firstRawValue(product: SupplierProduct, excludeKeys: string[] = []): string {
  const entries = Object.entries(product.rawData)
  for (const [k, v] of entries) {
    if (!excludeKeys.includes(k) && v) return v
  }
  return ''
}
</script>

<template>
  <div class="product-selector">
    <h3 class="panel-title">{{ t('listing.selectProduct') }}</h3>

    <div v-if="!supplierStore.hasProducts" class="no-products">
      <el-icon><Warning /></el-icon>
      <p>{{ t('listing.uploadFirst') }}</p>
      <el-button size="small" @click="$router.push('/supplier-upload')">{{ t('common.upload') }}</el-button>
    </div>

    <template v-else>
      <el-input v-model="productSearch" :placeholder="t('listing.searchProduct')" size="small" clearable>
        <template #prefix><el-icon><Search /></el-icon></template>
      </el-input>

      <div class="product-list">
        <div v-for="product in filteredProducts" :key="product.id" class="product-item">
          <div class="product-info">
            <span class="product-title">{{ getProductLabel(product) }}</span>
            <span class="product-meta">{{ firstRawValue(product, [Object.keys(product.rawData)[0]]) }}</span>
          </div>
          <el-button type="primary" size="small" @click="emit('generate', product)">{{ t('listing.generate') }}</el-button>
        </div>
        <div v-if="filteredProducts.length === 0" class="no-results">{{ t('supplier.noProducts') }}</div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.product-selector { display: flex; flex-direction: column; gap: 16px; }
.panel-title { font-family: var(--font-body); font-size: 15px; font-weight: 600; color: var(--text-primary); }
.no-products { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 32px 16px; text-align: center; color: var(--text-muted); font-size: 13px; }
.product-list { display: flex; flex-direction: column; gap: 8px; max-height: 420px; overflow-y: auto; }
.product-item { display: flex; align-items: center; justify-content: space-between; padding: 12px; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-md); gap: 12px; transition: all var(--transition-fast); }
.product-item:hover { border-color: var(--accent-dim); background: var(--bg-card-hover); }
.product-info { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.product-title { font-size: 13px; font-weight: 500; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.product-meta { font-size: 11px; color: var(--text-muted); }
.no-results { text-align: center; padding: 24px; color: var(--text-muted); font-size: 13px; }
</style>
