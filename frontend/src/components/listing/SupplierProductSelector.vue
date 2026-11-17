<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useVirtualList } from '@/composables/useVirtualList'
import LanguageRadialMenu from '@/components/listing/LanguageRadialMenu.vue'
import { LISTING_LANGUAGES } from '@/utils/constants'
import { hasGeneratedListing } from '@/utils/gridFields'
import type { Platform } from '@/types/listing'
import type { GridProduct } from '@/composables/useGridProducts'

/**
 * Product picker for the 上架表 rows.
 *
 * The list doubles as the product switcher: clicking a row loads that product's
 * generated listing and chat thread in the centre, exactly like the old tab
 * strip, but without spending a separate horizontal column on navigation.
 * Generated rows are painted deep green, pending rows pale green, and the row
 * currently shown in the preview carries an accent ring.
 */
const props = defineProps<{
  products: GridProduct[]
  loading: boolean
  selectedIds: string[]
  generatingIds: string[]
  platform: Platform
  activeProductId?: string
  batchActive?: boolean
  batchPaused?: boolean
}>()

const emit = defineEmits<{
  (e: 'generate', payload: { product: GridProduct; language: string }): void
  (e: 'batch-generate', payload: { products: GridProduct[]; language: string }): void
  (e: 'pause-batch'): void
  (e: 'resume-batch'): void
  (e: 'cancel-batch'): void
  (e: 'toggle', id: string): void
  (e: 'toggle-all', checked: boolean): void
  (e: 'detail', product: GridProduct): void
  (e: 'select-product', product: GridProduct): void
  (e: 'reload'): void
}>()

const { t } = useI18n()

const search = ref('')
const batchLanguage = ref<string>('english')
const ring = ref({ open: false, productId: '', x: 0, y: 0 })

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return props.products
  return props.products.filter((product) =>
    Object.values(product.rawData).some((value) => (value ?? '').toLowerCase().includes(q)),
  )
})

// 74 = item height (66) + row gap (8). Keep the CSS in sync with this number.
const { containerRef, onScroll, visibleItems, totalHeight, offsetY, scrollToTop, scrollToIndex } =
  useVirtualList(filtered, { itemHeight: 74 })

// A filtered list starts at the top: keeping the old offset would open the
// results halfway down and look like rows are missing.
watch(search, () => scrollToTop())

// Batch generation and "generate from the card" both change the active product;
// keep that row inside the virtual window instead of letting it drift off-screen.
watch(
  () => props.activeProductId,
  (productId) => {
    if (!productId) return
    const index = filtered.value.findIndex((product) => product.id === productId)
    if (index >= 0) scrollToIndex(index)
  },
)

const allChecked = computed(() => {
  const selectable = filtered.value.filter((product) => product.editable)
  return selectable.length > 0 && selectable.every((product) => props.selectedIds.includes(product.id))
})

/** Read-only rows cannot be selected, so select-all is pointless without one. */
const hasSelectable = computed(() => filtered.value.some((product) => product.editable))

const selectedProducts = computed(() =>
  props.products.filter((product) => product.editable && props.selectedIds.includes(product.id)),
)

const busy = computed(
  () => props.generatingIds.length > 0 || props.loading || Boolean(props.batchActive),
)
const generatedCount = computed(
  () => props.products.filter((product) => hasGeneratedListing(product.fields)).length,
)
const ungeneratedCount = computed(() => props.products.length - generatedCount.value)

function labelOf(product: GridProduct): string {
  return (
    product.fields.productName ||
    product.fields.title ||
    product.fields.sku ||
    `Product ${product.id.slice(0, 6)}`
  )
}

function metaOf(product: GridProduct): string {
  return [product.fields.category, product.fields.price]
    .filter((value) => Boolean(value && value.trim()))
    .join(' · ')
}

/** The SKU is the row's stable identifier, so it gets its own unshrunk slot. */
function skuOf(product: GridProduct): string {
  return (product.fields.sku ?? '').trim()
}

function isGenerating(product: GridProduct): boolean {
  return props.generatingIds.includes(product.id)
}

function isActive(product: GridProduct): boolean {
  return Boolean(props.activeProductId) && props.activeProductId === product.id
}

function onSelect(product: GridProduct): void {
  emit('select-product', product)
}

/**
 * The checkbox column is a full-height hit area, so checking a row is not a
 * pixel hunt. Clicks landing on the checkbox itself are left to it (it emits
 * its own update), otherwise the click would toggle twice.
 */
function onCheckCell(event: MouseEvent, product: GridProduct): void {
  if (!product.editable) return
  if ((event.target as HTMLElement | null)?.closest('.el-checkbox')) return
  emit('toggle', product.id)
}

function isGenerated(product: GridProduct): boolean {
  return hasGeneratedListing(product.fields)
}

function openRing(product: GridProduct, event: MouseEvent): void {
  const target = event.currentTarget as HTMLElement | null
  const rect = target?.getBoundingClientRect()
  ring.value = {
    open: true,
    productId: product.id,
    x: rect ? rect.right - 4 : window.innerWidth / 2,
    y: rect ? rect.top + rect.height / 2 : window.innerHeight / 2,
  }
}

function onRingSelect(language: string): void {
  const product = props.products.find((item) => item.id === ring.value.productId)
  ring.value.open = false
  if (product) emit('generate', { product, language })
}

function onBatch(): void {
  if (selectedProducts.value.length === 0) return
  emit('batch-generate', {
    products: selectedProducts.value,
    language: batchLanguage.value,
  })
}
</script>

<template>
  <div class="product-selector">
    <div class="selector-head">
      <div class="selector-heading">
        <h3 class="panel-title">{{ t('listing.selectProduct') }}</h3>
        <span class="selector-subtitle">{{ t('listing.clickToPreview') }}</span>
      </div>
      <span class="selector-count">{{ t('listing.fromTable', { count: products.length }) }}</span>
    </div>

    <div v-if="products.length" class="selector-legend">
      <span class="legend-item">
        <i class="legend-dot is-idle" />
        {{ t('listing.legendUngenerated', { count: ungeneratedCount }) }}
      </span>
      <span class="legend-item">
        <i class="legend-dot is-done" />
        {{ t('listing.legendGenerated', { count: generatedCount }) }}
      </span>
    </div>

    <div v-if="!products.length && !loading" class="no-products">
      <el-icon><Warning /></el-icon>
      <p>{{ t('listing.tableEmpty') }}</p>
      <el-button size="small" @click="$router.push('/product-grid')">{{ t('listing.goToTable') }}</el-button>
    </div>

    <template v-else>
      <div class="batch-bar">
        <div class="batch-actions">
          <el-select v-model="batchLanguage" size="small" class="batch-lang" :disabled="busy">
            <el-option
              v-for="lang in LISTING_LANGUAGES"
              :key="lang.value"
              :label="t(lang.label)"
              :value="lang.value"
            />
          </el-select>

          <template v-if="batchActive">
            <el-button
              v-if="!batchPaused"
              size="small"
              @click="emit('pause-batch')"
            >
              <el-icon><VideoPause /></el-icon>
              {{ t('listing.batchPause') }}
            </el-button>
            <el-button v-else size="small" type="primary" @click="emit('resume-batch')">
              <el-icon><VideoPlay /></el-icon>
              {{ t('listing.batchResume') }}
            </el-button>
            <el-button size="small" text @click="emit('cancel-batch')">
              {{ t('listing.batchCancel') }}
            </el-button>
          </template>

          <el-button
            v-else
            size="small"
            type="primary"
            :loading="loading"
            :disabled="selectedIds.length === 0 || busy"
            @click="onBatch"
          >
            {{ t('listing.batchGenerate') }}
          </el-button>
        </div>
      </div>

      <el-input v-model="search" :placeholder="t('listing.searchProduct')" size="small" clearable>
        <template #prefix><el-icon><Search /></el-icon></template>
      </el-input>

      <!-- Column header: the checkbox owns its own column, so select-all and
           every row checkbox line up instead of floating inside the card. -->
      <div class="list-head">
        <div class="head-check">
          <el-checkbox
            :model-value="allChecked"
            :indeterminate="selectedIds.length > 0 && !allChecked"
            :disabled="busy || !hasSelectable"
            size="small"
            :aria-label="t('listing.selectAllCount', { count: selectedIds.length })"
            @update:model-value="(value: any) => emit('toggle-all', Boolean(value))"
          />
        </div>
        <div class="head-main">
          <span>{{ t('listing.productColumn') }}</span>
          <span v-if="selectedIds.length" class="head-selected">
            {{ t('listing.selectedCount', { count: selectedIds.length }) }}
          </span>
        </div>
        <span class="head-actions">{{ t('listing.actionsColumn') }}</span>
      </div>

      <div ref="containerRef" class="product-list" @scroll="onScroll">
        <div class="vl-spacer" :style="{ height: totalHeight + 'px' }">
          <div class="vl-window" :style="{ transform: `translateY(${offsetY}px)` }">
            <div
              v-for="product in visibleItems"
              :key="product.id"
              class="product-item"
              :class="{
                'is-generating': isGenerating(product),
                'is-generated': isGenerated(product),
                'is-ungenerated': !isGenerated(product),
                'is-readonly': !product.editable,
                'is-active': isActive(product),
              }"
              v-tooltip="product.editable ? '' : t('listing.readOnlyRow')"
              role="button"
              tabindex="0"
              :aria-pressed="isActive(product)"
              @click="onSelect(product)"
              @keydown.enter.prevent="onSelect(product)"
              @keydown.space.prevent="onSelect(product)"
            >
              <div
                class="item-check-col"
                :class="{ 'is-selected': selectedIds.includes(product.id) }"
                @click.stop="onCheckCell($event, product)"
              >
                <el-checkbox
                  :model-value="selectedIds.includes(product.id)"
                  :disabled="busy || !product.editable"
                  class="item-check"
                  @click.stop
                  @update:model-value="() => emit('toggle', product.id)"
                />
              </div>

              <div class="product-info">
                <span class="product-title-row">
                  <span class="product-title">{{ labelOf(product) }}</span>
                  <el-icon v-if="isGenerated(product)" class="product-done-icon"><CircleCheckFilled /></el-icon>
                </span>
                <span class="product-sub-row">
                  <template v-if="skuOf(product) || metaOf(product)">
                    <span v-if="skuOf(product)" class="product-sku">{{ skuOf(product) }}</span>
                    <span v-if="skuOf(product) && metaOf(product)" class="product-sub-sep" aria-hidden="true">·</span>
                    <span class="product-meta">{{ metaOf(product) }}</span>
                  </template>
                  <span v-else class="product-meta">{{ t('listing.noMeta') }}</span>
                </span>
              </div>

              <!-- The active marker floats in the action column's spare top
                   corner: in the meta row it consumed the width the SKU needs. -->
              <span v-if="isActive(product)" class="product-active-tag">
                {{ t('listing.previewing') }}
              </span>

              <div class="btn-row">
                <button
                  class="gen-btn"
                  :class="{ active: ring.open && ring.productId === product.id }"
                  :disabled="busy || isGenerating(product) || !product.editable"
                  v-tooltip="product.editable ? t('listing.generate') : t('listing.readOnlyRow')"
                  @click.stop="openRing(product, $event)"
                >
                  <span v-if="isGenerating(product)" class="gen-spinner" />
                  <span v-else-if="ring.open && ring.productId === product.id" class="gen-btn-close">&times;</span>
                  <span v-else>{{ t('listing.generate') }}</span>
                </button>

                <button class="detail-btn" v-tooltip="t('listing.details')" @click.stop="emit('detail', product)">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="1" /><circle cx="12" cy="5" r="1" /><circle cx="12" cy="19" r="1" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
        <div v-if="filtered.length === 0" class="no-results">{{ t('supplier.noProducts') }}</div>
      </div>
    </template>

    <LanguageRadialMenu
      :open="ring.open"
      :x="ring.x"
      :y="ring.y"
      @select="onRingSelect"
      @close="ring.open = false"
    />
  </div>
</template>

<style scoped lang="scss">
@use '../../styles/components/listing/supplier-product-selector.scss' as *;
</style>
