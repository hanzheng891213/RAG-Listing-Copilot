<script setup lang="ts">
import { ref, inject, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useListingGenerator } from '@/composables/useListingGenerator'
import { useSupplierStore } from '@/stores/supplierStore'
import { LISTING_LANGUAGES } from '@/utils/constants'
import type { SupplierProduct } from '@/types/supplier'

const emit = defineEmits<{ generate: [product: SupplierProduct, language: string] }>()
const { t } = useI18n()
const { productSearch, filteredProducts, getProductLabel } = useListingGenerator()
const supplierStore = useSupplierStore()

const openProductId = ref<string | null>(null)
const rootRef = ref<HTMLElement | null>(null)

// 从 AppLayout 注入商品详情展开函数
const showProductDetail = inject<(product: SupplierProduct | null) => void>('showProductDetail')

function toggleMenu(productId: string) {
  openProductId.value = openProductId.value === productId ? null : productId
}

function selectLanguage(product: SupplierProduct, language: string) {
  openProductId.value = null
  emit('generate', product, language)
}

function onClickOutside(e: MouseEvent) {
  if (!openProductId.value) return
  if (rootRef.value && !rootRef.value.contains(e.target as Node)) {
    openProductId.value = null
  }
}

onMounted(() => document.addEventListener('click', onClickOutside))
onUnmounted(() => document.removeEventListener('click', onClickOutside))

function firstRawValue(product: SupplierProduct, excludeKeys: string[] = []): string {
  const entries = Object.entries(product.rawData)
  for (const [k, v] of entries) {
    if (!excludeKeys.includes(k) && v) return v
  }
  return ''
}

// Pre-compute radial positions: 12 items fanned in a 160° arc pointing upward-left
const RADIUS = 100
const ARC_START = -168
const ARC_END = -12
const ITEM_COUNT = LISTING_LANGUAGES.length
const STEP = (ARC_END - ARC_START) / (ITEM_COUNT - 1)

const radialItems = LISTING_LANGUAGES.map((lang, i) => {
  const angle = ARC_START + i * STEP
  return {
    ...lang,
    angle,
    style: {
      transform: `rotate(${angle}deg) translateY(-${RADIUS}px) rotate(${-angle}deg)`,
      animationDelay: `${i * 25}ms`,
    },
  }
})
</script>

<template>
  <div ref="rootRef" class="product-selector">
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

          <div class="btn-zone">
            <div class="btn-row">
              <button
                class="gen-btn"
                :class="{ active: openProductId === product.id }"
                @click.stop="toggleMenu(product.id)"
              >
                <span v-if="openProductId !== product.id">{{ t('listing.generate') }}</span>
                <span v-else class="gen-btn-close">&times;</span>
              </button>

              <button class="detail-btn" title="View Details" @click.stop="showProductDetail?.(product)">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/>
                </svg>
              </button>
            </div>

            <Transition name="radial">
              <div v-if="openProductId === product.id" class="radial-menu" @click.stop>
                <div
                  v-for="item in radialItems"
                  :key="item.value"
                  class="radial-item"
                  :style="item.style"
                  @click="selectLanguage(product, item.value)"
                  :title="t(item.label)"
                >
                  <span class="radial-code">{{ item.value.slice(0, 2) }}</span>
                </div>
              </div>
            </Transition>
          </div>
        </div>
        <div v-if="filteredProducts.length === 0" class="no-results">{{ t('supplier.noProducts') }}</div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.product-selector { display: flex; flex-direction: column; gap: 16px; width: 100%; }
.panel-title { font-family: var(--font-body); font-size: 15px; font-weight: 600; color: var(--text-primary); }
.no-products { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 32px 16px; text-align: center; color: var(--text-muted); font-size: 13px; }
.product-list { display: flex; flex-direction: column; gap: 8px; flex: 1; width: 100%; }
.product-item { display: flex; align-items: center; justify-content: space-between; padding: 12px; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-md); gap: 12px; transition: all var(--transition-fast); position: relative; width: 100%; }
.product-item:hover { border-color: var(--accent-dim); background: var(--bg-card-hover); }
.product-info { display: flex; flex-direction: column; gap: 4px; min-width: 0; flex: 1; }
.product-title { font-size: 13px; font-weight: 500; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.product-meta { font-size: 11px; color: var(--text-muted); }
.no-results { text-align: center; padding: 24px; color: var(--text-muted); font-size: 13px; }

/* ---- Button zone ---- */
.btn-zone {
  position: relative;
  flex-shrink: 0;
}

.btn-row {
  display: flex;
  align-items: center;
  gap: 4px;
}

/* ---- Generate button ---- */
.gen-btn {
  position: relative;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 72px;
  height: 28px;
  padding: 0 12px;
  border: 1px solid var(--accent);
  border-radius: 8px;
  background: transparent;
  color: var(--accent);
  font-size: 12px;
  font-family: var(--font-body);
  cursor: pointer;
  transition: all 0.25s ease;
  white-space: nowrap;
}
.gen-btn:hover {
  background: var(--accent);
  color: #e6f8f8;
  box-shadow: 0 0 0 4px rgba(99, 232, 241, 0.15);
}
.gen-btn.active {
  background: var(--accent);
  color: #d9f4f7;
}
.gen-btn-close {
  font-size: 18px;
  line-height: 1;
}

/* ---- Detail button ---- */
.detail-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.2s ease;
}
.detail-btn:hover {
  background: var(--bg-secondary);
  color: var(--text-primary);
}

/* ---- Radial menu ---- */
.radial-menu {
  position: absolute;
  top: 50%;
  right: 10px;
  width: 0;
  height: 0;
  z-index: 10;
  pointer-events: none;
}

.radial-item {
  position: absolute;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--bg-card);
  border: 1.5px solid var(--accent-dim);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  pointer-events: auto;
  transition: all 0.2s ease;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
  animation: radial-enter 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) both;
}
.radial-item:hover {
  background: var(--accent);
  border-color: var(--accent);
  border-width: 2px;
  box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.2), 0 4px 16px rgba(0, 0, 0, 0.25);
}
.radial-code {
  font-size: 10px;
  font-weight: 700;
  color: var(--text-primary);
  text-transform: uppercase;
  letter-spacing: 0.3px;
  transition: color 0.2s;
}
.radial-item:hover .radial-code {
  color: #fff;
}

/* Staggered entry animation */
@keyframes radial-enter {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

/* Transition wrapper for enter/leave */
.radial-enter-active { transition: opacity 0.2s ease; }
.radial-leave-active { transition: opacity 0.15s ease; }
.radial-enter-from,
.radial-leave-to { opacity: 0; }
</style>