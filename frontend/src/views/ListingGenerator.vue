<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useListingGenerator } from '@/composables/useListingGenerator'
import { useSupplierStore } from '@/stores/supplierStore'
import { useAuthStore } from '@/stores/authStore'
import { useModelStore } from '@/stores/modelStore'
import ListingPreview from '@/components/listing/ListingPreview.vue'
import CompliancePanel from '@/components/listing/CompliancePanel.vue'
import SEOInsights from '@/components/listing/SEOInsights.vue'
import ExportBar from '@/components/listing/ExportBar.vue'
import ModelMonitorPanel from '@/components/listing/ModelMonitorPanel.vue'
import ChatPanel from '@/components/listing/ChatPanel.vue'
import SupplierProductSelector from '@/components/listing/SupplierProductSelector.vue'
import type { SupplierProduct } from '@/types/supplier'

const { t } = useI18n()
const router = useRouter()
const { store, handleGenerate, handleRegenerate, handleExport, platforms } = useListingGenerator()
const supplierStore = useSupplierStore()
const auth = useAuthStore()
const modelStore = useModelStore()

// 流式状态文字轮播（每2.5s切换）
const STATUS_TEXTS = ['正在生成标题', '正在生成五点描述', '正在生成详情描述', '正在检查合规性','正在进行优化', '正在优化标题', '正在优化五点', '正在优化祥描']
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

onUnmounted(() => { if (statusTimer) clearInterval(statusTimer) })

onMounted(() => {
  modelStore.loadConfigs()
})

function onGenerate(product: SupplierProduct, language: string) {
  if (auth.isAdmin && !modelStore.hasAnyConfigured) {
    router.push('/model-manager')
    return
  }
  handleGenerate(product, language)
}

function onRegenerate() {
  if (auth.isAdmin && !modelStore.hasAnyConfigured) {
    router.push('/model-manager')
    return
  }
  handleRegenerate()
}
</script>

<template>
  <div class="listing-generator-page">
    <div class="page-header">
      <h1 class="page-title">{{ t('listing.title') }}</h1>
      <p class="page-desc">{{ t('listing.description') }}</p>
    </div>

    <div class="generator-layout">
      <!-- Left 1/3: Platform Selector + Product List -->
      <div class="panel panel-left">
        <div class="platform-section">
          <el-button
            v-for="p in platforms"
            :key="p.value"
            :type="store.selectedPlatform === p.value ? 'primary' : 'default'"
            size="small"
            @click="store.setPlatform(p.value)"
          >{{ p.label }}</el-button>
        </div>
        <div class="product-section">
          <SupplierProductSelector @generate="onGenerate" />
        </div>
      </div>

      <!-- Center 1/2: Listing + SEO Insights (stacked vertically) -->
      <div class="content-area">
        <div class="listing-area">
          <!-- No model configured warning -->
          <div v-if="auth.isAdmin && !modelStore.hasAnyConfigured && supplierStore.hasProducts" class="no-model-banner">
            <el-icon><WarningFilled /></el-icon>
            <span>{{ t('listing.noModelForGenerate') }}</span>
            <el-button size="small" type="primary" @click="router.push('/model-manager')">
              {{ t('listing.goToModelManager') }}
            </el-button>
          </div>

          <div v-if="store.isGenerating" class="generating-state" :class="{ streaming: store.isStreaming }">
            <div class="generating-pulse" />
            <h3>{{ t('listing.generating') }}</h3>
            <div v-if="store.isStreaming" class="status-scroll">
              <div class="status-scroll-inner" :style="{ transform: `translateY(-${displayIndex * 28}px)` }">
                <span v-for="(text, i) in STATUS_TEXTS" :key="i" class="status-text-status">{{ text }}</span>
              </div>
            </div>
            <p v-else>{{ t('listing.generatingDesc') }}</p>
            <div class="progress-bar"><div class="progress-fill" /></div>
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
            <ExportBar v-if="!store.isGenerating" :listing="store.activeListing" @regenerate="onRegenerate" @export="handleExport" />
          </template>

          <div v-else class="empty-state">
            <div class="empty-icon"><el-icon :size="48"><MagicStick /></el-icon></div>
            <h3>{{ t('listing.noListing') }}</h3>
            <p>{{ supplierStore.hasProducts ? t('listing.noListingDesc') : t('listing.noListingNoData') }}</p>
            <el-button v-if="!supplierStore.hasProducts" type="primary" @click="router.push('/supplier-upload')">{{ t('listing.goToUpload') }}</el-button>
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
        <div v-if="auth.isAdmin" class="chat-model-bar">
          <el-dropdown
            v-if="modelStore.configuredProviders.length > 0"
            trigger="click"
            @command="modelStore.setActiveProvider"
          >
            <el-button size="small" text class="model-switch-btn">
              <el-icon><Cpu /></el-icon>
              <span class="model-name">{{ modelStore.activeModelName || modelStore.activeConfig?.activeModel }}</span>
              <el-icon><ArrowDown /></el-icon>
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item
                  v-for="cfg in modelStore.configuredProviders"
                  :key="cfg.providerId"
                  :command="cfg.providerId"
                  :class="{ active: cfg.providerId === modelStore.activeProviderId }"
                >
                  <el-icon v-if="cfg.providerId === modelStore.activeProviderId"><Check /></el-icon>
                  <span>{{ modelStore.providers.find(p => p.id === cfg.providerId)?.name || cfg.providerId }} - {{ cfg.activeModel }}</span>
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
        <ChatPanel v-if="auth.isAdmin" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.listing-generator-page {
  max-width: 1440px;
}

.page-header {
  margin-bottom: 24px;
}

.page-title {
  font-family: var(--font-display-serif);
  font-size: 28px;
  font-weight: 400;
  margin-bottom: 8px;
  color: var(--text-primary);
}

.page-desc {
  color: var(--text-secondary);
  font-size: 15px;
  margin: 0;
}

/* Main layout: left 1/4 + center 1/2 + right 1/4 */
.generator-layout {
  display: grid;
  grid-template-columns: 1fr 2fr 1fr;
  gap: 16px;
  align-items: start;
  min-height: calc(100vh - 200px);
}

/* ---- Left panel (1/4) ---- */
.panel-left {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: 20px;
  position: sticky;
  top: 80px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-height: calc(100vh - 160px);
  overflow: hidden;
}

.platform-section {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  flex-shrink: 0;
}

.product-section {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

/* ---- Center area (1/2) ---- */
.content-area {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 0;
}

.listing-area {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: 20px;
  flex: 1;
}

.seo-area {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: 20px;
}

/* ---- Right panel (1/4): Chat ---- */
.chat-area {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: 16px 20px 20px;
  position: sticky;
  top: 80px;
  max-height: calc(100vh - 160px);
  display: flex;
  flex-direction: column;
}

.chat-model-bar {
  margin-bottom: 10px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--border-color);
}

.model-switch-btn {
  font-size: 12px;
  color: var(--text-secondary);
  gap: 4px;
  padding: 2px 8px;
  max-width: 100%;
  overflow: hidden;
}
.model-switch-btn:hover {
  color: var(--accent);
}
.model-switch-btn .model-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ---- No model banner ---- */
.no-model-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: rgba(245, 159, 0, 0.08);
  border: 1px solid rgba(245, 159, 0, 0.25);
  border-radius: var(--radius-md);
  color: #e6a100;
  font-size: 13px;
  margin-bottom: 12px;
}

/* ---- Generating / Empty states ---- */
.generating-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 40px;
  text-align: center;
  gap: 16px;
}

.generating-state.streaming {
  flex-direction: row;
  padding: 12px 20px;
  gap: 12px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  margin-bottom: 16px;
}
.generating-state.streaming .generating-pulse {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
}
.generating-state.streaming h3 {
  font-size: 13px;
  white-space: nowrap;
}
.generating-state.streaming .status-scroll {
  height: 28px;
  overflow: hidden;
  flex: 1;
}
.generating-state.streaming .status-scroll-inner {
  display: flex;
  flex-direction: column;
  transition: transform 0.5s cubic-bezier(0.4, 0, 0.2, 1);
}
.generating-state.streaming .status-text-status {
  height: 28px;
  line-height: 28px;
  font-size: 13px;
  color: var(--text-secondary);
  white-space: nowrap;
}
.generating-state.streaming .progress-bar {
  width: 80px;
  flex-shrink: 0;
}

.generating-pulse {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: var(--accent-glow);
  animation: glow-pulse 2s ease-in-out infinite;
}

.generating-state h3 {
  font-family: var(--font-body);
  font-size: 18px;
  color: var(--text-primary);
}

.generating-state p {
  color: var(--text-secondary);
  font-size: 14px;
}

.progress-bar {
  width: 200px;
  height: 3px;
  background: var(--bg-secondary);
  border-radius: 2px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  width: 60%;
  background: var(--accent);
  border-radius: 2px;
  animation: progress 1.5s ease-in-out infinite;
}

@keyframes progress {
  0% { width: 0%; }
  50% { width: 70%; }
  100% { width: 90%; }
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 40px;
  text-align: center;
  gap: 12px;
  color: var(--text-muted);
}

.empty-icon {
  color: var(--accent-dim);
  margin-bottom: 8px;
}

.empty-state h3 {
  font-family: var(--font-body);
  font-size: 16px;
  color: var(--text-secondary);
}

.empty-state p {
  font-size: 14px;
  max-width: 300px;
  line-height: 1.6;
}

.insights-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 60px 20px;
  text-align: center;
  color: var(--text-muted);
  gap: 12px;
}

.insights-placeholder p {
  font-size: 13px;
  line-height: 1.6;
}

.error-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: rgba(245, 63, 63, 0.08);
  border: 1px solid rgba(245, 63, 63, 0.25);
  border-radius: var(--radius-md);
  color: #f53f3f;
  font-size: 13px;
  margin-bottom: 12px;
}

.demo-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: rgba(255, 171, 0, 0.08);
  border: 1px solid rgba(255, 171, 0, 0.25);
  border-radius: var(--radius-md);
  color: #e6a100;
  font-size: 13px;
  margin-bottom: 12px;
}

/* ---- Responsive ---- */
@media (max-width: 1200px) {
  .generator-layout {
    grid-template-columns: 1fr 2fr;
  }

  .chat-area {
    position: static;
    max-height: none;
  }
}

@media (max-width: 900px) {
  .generator-layout {
    grid-template-columns: 1fr;
  }

  .panel-left {
    position: static;
    max-height: none;
  }

  .content-area {
    min-height: auto;
  }
}
</style>
