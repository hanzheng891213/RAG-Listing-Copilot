<script setup lang="ts">
import { computed, inject, ref, watch, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useListingGenerator } from '@/composables/useListingGenerator'
import { useGridProducts, type GridProduct } from '@/composables/useGridProducts'
import { listingToFields } from '@/composables/useListingGeneration'
import { useModelStore } from '@/stores/modelStore'
import { cellToBulletPoints, hasGeneratedListing } from '@/utils/gridFields'
import ListingPreview from '@/components/listing/ListingPreview.vue'
import ListingTabs from '@/components/listing/ListingTabs.vue'
import CompliancePanel from '@/components/listing/CompliancePanel.vue'
import SEOInsights from '@/components/listing/SEOInsights.vue'
import ExportBar from '@/components/listing/ExportBar.vue'
import ModelMonitorPanel from '@/components/listing/ModelMonitorPanel.vue'
import ChatPanel from '@/components/listing/ChatPanel.vue'
import SupplierProductSelector from '@/components/listing/SupplierProductSelector.vue'
import type { GeneratedListing, ListingTab } from '@/types/listing'

const { t } = useI18n()
const router = useRouter()
const { store, handleRegenerate, handleExport, platforms } = useListingGenerator()
const modelStore = useModelStore()

/**
 * Products come from the 上架表 rows, not from a separate upload store: the
 * table is the source of truth, and a generated listing is written back into
 * its row so both pages stay in sync.
 */
const { items: products, loading: productsLoading, loadAll, patch } = useGridProducts()
const selectedIds = ref<string[]>([])
const generatingIds = ref<string[]>([])

/**
 * A batch is a resumable queue, not a for-loop local: pausing must survive the
 * aborted request and continue from the same product, and the progress banner
 * reads from here.
 */
interface BatchState {
  products: GridProduct[]
  language: string
  /** Index of the product currently being (or about to be) generated. */
  index: number
  ok: number
  failed: number
}

const batch = ref<BatchState | null>(null)
const batchPaused = ref(false)
const batchLoopRunning = ref(false)
let batchCancelled = false
let manualStop = false

const batchActive = computed(() => batch.value !== null)
const batchTotal = computed(() => batch.value?.products.length ?? 0)
const batchDone = computed(() =>
  batch.value ? Math.min(batch.value.index + 1, batchTotal.value) : 0,
)
const batchOk = computed(() => batch.value?.ok ?? 0)
const batchFailed = computed(() => batch.value?.failed ?? 0)

/** Products with a generated listing become switchable tabs in the center. */
const productById = computed(() => new Map(products.value.map((product) => [product.id, product])))
const listingTabs = computed<ListingTab[]>(() =>
  store.generatedListings.map((listing) => {
    const product = productById.value.get(listing.productId)
    return {
      id: listing.id,
      label: product ? labelOf(product) : listing.title || t('listing.untitledProduct'),
      generating: listing.id === store.generatingListingId,
    }
  }),
)
const activeTabId = computed(() => store.activeListing?.id ?? '')

/** Provided by AppLayout; opens the read-only product detail sheet. */
const showProductDetail = inject<(product: GridProduct | null) => void>('showProductDetail')

// 流式状态文字轮播（每2.5s切换）
const STATUS_TEXTS = ['正在生成标题', '正在生成五点描述', '正在生成详情描述', '正在检查合规性', '正在进行优化', '正在优化标题', '正在优化五点', '正在优化详情']
const displayIndex = ref(0)
let statusTimer: ReturnType<typeof setInterval> | null = null

watch(() => store.isStreaming, (val) => {
  if (statusTimer) { clearInterval(statusTimer); statusTimer = null }
  if (val) {
    displayIndex.value = 0
    statusTimer = setInterval(() => {
      displayIndex.value = (displayIndex.value + 1) % STATUS_TEXTS.length
    }, 2500)
  }
})

onUnmounted(() => {
  if (statusTimer) clearInterval(statusTimer)
  // Leaving the page during a paid batch must stop the queue, not let it run on.
  if (batch.value) {
    batchCancelled = true
    batchPaused.value = false
    batch.value = null
    store.stopGeneration()
  }
})

onMounted(async () => {
  modelStore.loadConfigs()
  try {
    await loadAll()
    hydrateTabs()
  } catch (err) {
    console.error('[Listing] failed to load table rows:', err)
    ElMessage.error(t('listing.tableLoadFailed'))
  }
})

function labelOf(product: GridProduct): string {
  return product.fields.productName || product.fields.sku || product.id
}

/**
 * Rows generated in an earlier visit only exist in the table. Rebuild a listing
 * view for them so their tabs and detail panel work without regenerating.
 */
function listingFromProduct(product: GridProduct): GeneratedListing {
  const fields = product.fields
  return {
    id: `table:${product.id}`,
    productId: product.id,
    title: fields.title ?? '',
    bulletPoints: cellToBulletPoints(fields.bulletPoints ?? ''),
    description: fields.description ?? '',
    keywords: (fields.keywords ?? '')
      .split(/[,，\n]/)
      .map((keyword) => keyword.trim())
      .filter(Boolean),
    // The table does not persist the score; generation always writes 85, so a
    // hydrated row uses the same baseline instead of showing a misleading 0.
    seoScore: 85,
    complianceResults: [],
    platform: store.selectedPlatform,
    template: 'standard',
    version: 1,
    createdAt: '',
    isDemo: false,
  }
}

function hydrateTabs(): void {
  for (const product of products.value) {
    if (!hasGeneratedListing(product.fields)) continue
    store.hydrateListing(listingFromProduct(product))
  }
  if (!store.activeListing && store.generatedListings.length > 0) {
    store.selectListing(store.generatedListings[0])
  }
}

function selectTab(id: string): void {
  const listing = store.generatedListings.find((item) => item.id === id)
  if (listing) store.selectListing(listing)
}

function toggle(id: string): void {
  selectedIds.value = selectedIds.value.includes(id)
    ? selectedIds.value.filter((value) => value !== id)
    : [...selectedIds.value, id]
}

function toggleAll(checked: boolean): void {
  selectedIds.value = checked
    ? products.value.filter((product) => product.editable).map((product) => product.id)
    : []
}

/**
 * `store.generate` drives the preview and streams into it; it resolves before
 * the stream finishes, so completion is detected by watching `isGenerating`.
 * Resolve the session by product id: the user may have switched tabs while the
 * request was in flight, in which case `activeListing` is a different product.
 */
function waitForGeneration(productId: string): Promise<GeneratedListing | null> {
  return new Promise((resolve) => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const stop = watch(
      () => store.isGenerating,
      (busy) => {
        if (busy) return
        stop()
        if (timer) clearTimeout(timer)
        resolve(store.findListing(productId) ?? null)
      },
    )
    // A hung provider must not block a batch forever — and must stop costing.
    timer = setTimeout(() => {
      stop()
      store.stopGeneration()
      resolve(store.findListing(productId) ?? null)
    }, 180_000)
  })
}

type GenerateOutcome = 'ok' | 'failed' | 'skipped'

async function generateProduct(product: GridProduct, language: string): Promise<GenerateOutcome> {
  if (!modelStore.hasAnyConfigured) {
    ElMessage.warning(t('listing.noModelForGenerate'))
    router.push('/model-manager')
    return 'failed'
  }
  if (generatingIds.value.includes(product.id)) return 'skipped'

  generatingIds.value = [...generatingIds.value, product.id]
  try {
    const completion = waitForGeneration(product.id)
    void store.generate(product, language)
    const listing = await completion

    // Paused/cancelled while this item was streaming: the request was aborted
    // on purpose, so it is not a failure and must not be written to the table.
    if (batchPaused.value || batchCancelled || manualStop) {
      const stopped = manualStop
      manualStop = false
      if (stopped) ElMessage.info(t('listing.generationStopped'))
      return 'skipped'
    }
    if (!listing || (!listing.title && !listing.description)) {
      ElMessage.warning(
        `${t('listing.generateFailed')}「${labelOf(product)}」${store.generationError || ''}`.trim(),
      )
      return 'failed'
    }

    await patch(product.id, listingToFields(listing))
    ElMessage.success(t('listing.generatedSaved', { name: labelOf(product) }))
    return 'ok'
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[Listing] generation failed:', error)
    ElMessage.error(`${t('listing.generateFailed')}：${message}`)
    return 'failed'
  } finally {
    generatingIds.value = generatingIds.value.filter((id) => id !== product.id)
  }
}

async function onGenerate(payload: { product: GridProduct; language: string }): Promise<void> {
  await generateProduct(payload.product, payload.language)
}

async function onBatchGenerate(payload: { products: GridProduct[]; language: string }): Promise<void> {
  if (batch.value || payload.products.length === 0) return
  if (!modelStore.hasAnyConfigured) {
    ElMessage.warning(t('listing.noModelForGenerate'))
    router.push('/model-manager')
    return
  }

  batch.value = {
    products: [...payload.products],
    language: payload.language,
    index: 0,
    ok: 0,
    failed: 0,
  }
  batchPaused.value = false
  batchCancelled = false
  await runBatch()
}

/**
 * Sequential queue with a pause point between items. Pausing also aborts the
 * item in flight: "pause" means stop spending now, not after this product.
 */
async function runBatch(): Promise<void> {
  const state = batch.value
  if (!state || batchLoopRunning.value) return
  batchLoopRunning.value = true

  try {
    while (state.index < state.products.length) {
      if (batchPaused.value || batchCancelled) break
      const outcome = await generateProduct(state.products[state.index], state.language)
      if (outcome === 'ok') state.ok += 1
      else if (outcome === 'failed') state.failed += 1
      if (batchPaused.value || batchCancelled) break
      state.index += 1
    }
  } finally {
    batchLoopRunning.value = false
    try {
      await loadAll()
    } catch (err) {
      // A failed reload must not leave the batch banner stuck in "running".
      console.error('[Listing] failed to reload table after batch:', err)
    }

    // A resume may already be pumping the next loop; that one finalises.
    if (batchLoopRunning.value) return
    const current = batch.value
    if (!current) return

    if (batchCancelled) {
      batch.value = null
      batchPaused.value = false
      batchCancelled = false
      ElMessage.info(t('listing.batchCancelled', { ok: current.ok, failed: current.failed }))
      return
    }

    if (batchPaused.value && current.index < current.products.length) return

    const { ok, failed } = current
    batch.value = null
    batchPaused.value = false
    ElMessage({
      type: failed > 0 ? 'warning' : 'success',
      message: t('listing.batchDone', { ok, failed }),
    })
  }
}

function pauseBatch(): void {
  if (!batch.value || batchPaused.value) return
  batchPaused.value = true
  store.stopGeneration()
  ElMessage.info(t('listing.batchPausedToast'))
}

function resumeBatch(): void {
  if (!batch.value || !batchPaused.value) return
  batchPaused.value = false
  void runBatch()
}

function cancelBatch(): void {
  if (!batch.value) return
  batchCancelled = true
  batchPaused.value = false
  store.stopGeneration()
  if (!batchLoopRunning.value) {
    // Nothing in flight (paused between items): finalise immediately.
    void runBatch()
  }
}

function stopSingleGeneration(): void {
  // During a batch the same button means "pause the queue", otherwise the loop
  // would simply move on to the next paid request.
  if (batch.value) {
    batchPaused.value = true
    store.stopGeneration()
    ElMessage.info(t('listing.batchPausedToast'))
    return
  }
  manualStop = true
  store.stopGeneration()
}

function onRegenerate() {
  if (batch.value) {
    ElMessage.warning(t('listing.batchBusy'))
    return
  }
  if (store.isGenerating) {
    ElMessage.warning(t('listing.generationBusy'))
    return
  }
  if (!modelStore.hasAnyConfigured) {
    router.push('/model-manager')
    return
  }
  // Regenerate the product the active tab shows, not whatever was generated
  // last: after switching tabs those two are different rows.
  const product = products.value.find(
    (item) => item.id === store.activeListing?.productId,
  )
  if (product) {
    void generateProduct(product, store.selectedLanguage)
    return
  }
  handleRegenerate()
}

/**
 * Chat "apply" changed the active listing in memory. Persist it back into the
 * 上架表 row so the table stays the source of truth; a failed write must not
 * roll the preview back, but it does need a visible warning.
 */
async function onChatApplied(payload: { listing: GeneratedListing }): Promise<void> {
  const listing = payload.listing
  const rowId = listing.productId
  if (!rowId || !products.value.some((product) => product.id === rowId)) return
  try {
    await patch(rowId, listingToFields(listing))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[Listing] failed to persist applied chat changes:', error)
    ElMessage.warning(`${t('chat.syncFailed')}：${message}`)
  }
}
</script>

<template>
  <div class="listing-generator-page">
    <div class="page-header">
      <p class="page-desc">{{ t('listing.description') }}</p>
    </div>

    <div v-if="batchActive" class="batch-progress" :class="{ 'is-paused': batchPaused }">
      <el-icon v-if="!batchPaused" class="is-loading"><Loading /></el-icon>
      <el-icon v-else><VideoPause /></el-icon>
      <span class="batch-progress-text">
        {{
          batchPaused
            ? t('listing.batchPaused', { done: batchDone, total: batchTotal })
            : t('listing.batchProgress', { done: batchDone, total: batchTotal })
        }}
      </span>
      <span class="batch-progress-stats">
        {{ t('listing.batchStats', { ok: batchOk, failed: batchFailed }) }}
      </span>
      <div class="batch-progress-actions">
        <el-button v-if="!batchPaused" size="small" @click="pauseBatch">
          <el-icon><VideoPause /></el-icon>
          {{ t('listing.batchPause') }}
        </el-button>
        <el-button v-else size="small" type="primary" @click="resumeBatch">
          <el-icon><VideoPlay /></el-icon>
          {{ t('listing.batchResume') }}
        </el-button>
        <el-button size="small" text @click="cancelBatch">{{ t('listing.batchCancel') }}</el-button>
      </div>
    </div>

    <div class="generator-layout">
      <!-- Left: Platform Selector + Product List -->
      <div class="panel panel-left">
        <div class="platform-section">
          <el-button
            v-for="p in platforms"
            :key="p.value"
            :type="store.selectedPlatform === p.value ? 'primary' : 'default'"
            size="small"
            :disabled="batchActive"
            @click="store.setPlatform(p.value)"
          >{{ p.label }}</el-button>
        </div>
        <div class="product-section">
          <SupplierProductSelector
            :products="products"
            :loading="productsLoading"
            :selected-ids="selectedIds"
            :generating-ids="generatingIds"
            :platform="store.selectedPlatform"
            :batch-active="batchActive"
            :batch-paused="batchPaused"
            @generate="onGenerate"
            @batch-generate="onBatchGenerate"
            @pause-batch="pauseBatch"
            @resume-batch="resumeBatch"
            @cancel-batch="cancelBatch"
            @toggle="toggle"
            @toggle-all="toggleAll"
            @detail="(product) => showProductDetail?.(product)"
          />
        </div>
      </div>

      <!-- Center: generated-product tabs + listing + SEO insights -->
      <div class="content-area">
        <ListingTabs
          :tabs="listingTabs"
          :active-id="activeTabId"
          @select="selectTab"
        />

        <div class="listing-area">
          <!-- No model configured warning -->
          <div v-if="!modelStore.hasAnyConfigured && products.length > 0" class="no-model-banner">
            <el-icon><WarningFilled /></el-icon>
            <span>{{ t('listing.noModelForGenerate') }}</span>
            <el-button size="small" type="primary" @click="router.push('/model-manager')">
              {{ t('listing.goToModelManager') }}
            </el-button>
          </div>

          <div
            v-if="store.isGenerating && store.activeListing?.id === store.generatingListingId"
            class="generating-state"
            :class="{ streaming: store.isStreaming }"
          >
            <div class="generating-pulse" />
            <h3>{{ t('listing.generating') }}</h3>
            <div v-if="store.isStreaming" class="status-scroll">
              <div class="status-scroll-inner" :style="{ transform: `translateY(-${displayIndex * 28}px)` }">
                <span v-for="(text, i) in STATUS_TEXTS" :key="i" class="status-text-status">{{ text }}</span>
              </div>
            </div>
            <p v-else>{{ t('listing.generatingDesc') }}</p>
            <div class="progress-bar"><div class="progress-fill" /></div>
            <el-button class="generating-stop" size="small" text @click="stopSingleGeneration">
              {{ t('listing.stopGeneration') }}
            </el-button>
          </div>

          <template v-if="store.activeListing">
            <div v-if="store.generationError" class="error-banner">
              <el-icon><WarningFilled /></el-icon>
              <span>{{ store.generationError }}</span>
            </div>
            <div v-if="store.activeListing.isDemo" class="demo-banner">
              <el-icon><InfoFilled /></el-icon>
              <span>{{ $t('listing.demoWarning') }}</span>
            </div>
            <ListingPreview :listing="store.activeListing" />
            <ExportBar
              v-if="!store.isGenerating || store.activeListing.id !== store.generatingListingId"
              :listing="store.activeListing"
              @regenerate="onRegenerate"
              @export="handleExport"
            />
          </template>

          <div v-else class="empty-state">
            <div class="empty-icon"><el-icon :size="48"><MagicStick /></el-icon></div>
            <h3>{{ t('listing.noListing') }}</h3>
            <p>{{ products.length ? t('listing.noListingDesc') : t('listing.noListingNoData') }}</p>
            <el-button v-if="!products.length" type="primary" @click="router.push('/product-grid')">{{ t('listing.goToTable') }}</el-button>
          </div>
        </div>

        <div class="seo-area">
          <SEOInsights v-if="store.activeListing" :keywords="store.activeKeywords" :seo-score="store.activeListing.seoScore" />
          <div v-if="!store.activeListing" class="insights-placeholder">
            <el-icon :size="32"><InfoFilled /></el-icon>
            <p>{{ t('listing.insightsPlaceholder') }}</p>
          </div>
        </div>
      </div>

      <!-- Right 1/4: Chat Panel (Trae style) -->
      <div class="chat-area">
        <ChatPanel @applied="onChatApplied" />
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/components/views/listing-generator.scss' as *;
</style>
