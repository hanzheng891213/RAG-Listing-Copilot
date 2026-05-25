<script setup lang="ts">
import { onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useListingGenerator } from '@/composables/useListingGenerator'
import { useSupplierStore } from '@/stores/supplierStore'
import { useAuthStore } from '@/stores/authStore'
import ListingPreview from '@/components/listing/ListingPreview.vue'
import CompliancePanel from '@/components/listing/CompliancePanel.vue'
import SEOInsights from '@/components/listing/SEOInsights.vue'
import ExportBar from '@/components/listing/ExportBar.vue'
import SupplierProductSelector from '@/components/listing/SupplierProductSelector.vue'
import type { SupplierProduct } from '@/types/supplier'

const { t } = useI18n()
const { store, handleGenerate, handleRegenerate, handleExport, platforms } = useListingGenerator()
const supplierStore = useSupplierStore()
const auth = useAuthStore()

function onGenerate(product: SupplierProduct) {
  auth.requireAuth(() => handleGenerate(product))
}

function onRegenerate() {
  auth.requireAuth(() => handleRegenerate())
}

onMounted(() => {
  const selected = supplierStore.selectedProducts
  if (selected.length > 0 && !store.activeListing) {
    onGenerate(selected[0])
  }
})
</script>

<template>
  <div class="listing-generator-page">
    <div class="page-header">
      <div>
        <h1 class="page-title">{{ t('listing.title') }}</h1>
        <p class="page-desc">{{ t('listing.description') }}</p>
      </div>
      <div class="platform-selector">
        <el-button v-for="p in platforms" :key="p.value" :type="store.selectedPlatform === p.value ? 'primary' : 'default'" size="small" @click="store.setPlatform(p.value)">{{ p.label }}</el-button>
      </div>
    </div>

    <div class="generator-layout">
      <div class="panel panel-left">
        <SupplierProductSelector @generate="onGenerate" />
      </div>

      <div class="panel panel-center">
        <div v-if="store.isGenerating" class="generating-state">
          <div class="generating-pulse" />
          <h3>{{ t('listing.generating') }}</h3>
          <p>{{ t('listing.generatingDesc') }}</p>
          <div class="progress-bar"><div class="progress-fill" /></div>
        </div>
        <template v-else-if="store.activeListing">
          <ListingPreview :listing="store.activeListing" />
          <ExportBar :listing="store.activeListing" @regenerate="onRegenerate" @export="handleExport" />
        </template>
        <div v-else class="empty-state">
          <div class="empty-icon"><el-icon :size="48"><MagicStick /></el-icon></div>
          <h3>{{ t('listing.noListing') }}</h3>
          <p>{{ supplierStore.hasProducts ? t('listing.noListingDesc') : t('listing.noListingNoData') }}</p>
          <el-button v-if="!supplierStore.hasProducts" type="primary" @click="$router.push('/supplier-upload')">{{ t('listing.goToUpload') }}</el-button>
        </div>
      </div>

      <div class="panel panel-right">
        <CompliancePanel v-if="store.activeListing" :results="store.activeCompliance" />
        <SEOInsights v-if="store.activeListing" :keywords="store.activeKeywords" :seo-score="store.activeListing.seoScore" />
        <div v-if="!store.activeListing" class="insights-placeholder">
          <el-icon :size="32"><InfoFilled /></el-icon>
          <p>{{ t('listing.insightsPlaceholder') }}</p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.listing-generator-page { max-width: 1440px; }
.page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; gap: 20px; flex-wrap: wrap; }
.page-title { font-size: 28px; font-weight: 400; margin-bottom: 8px; }
.page-desc { color: var(--text-secondary); font-size: 15px; }
.platform-selector { display: flex; gap: 6px; }
.generator-layout { display: grid; grid-template-columns: 280px 1fr 280px; gap: 20px; align-items: start; min-height: calc(100vh - 200px); }
.panel { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-lg); padding: 20px; position: sticky; top: 80px; }
.panel-center { position: static; }
.generating-state { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 80px 40px; text-align: center; gap: 16px; }
.generating-pulse { width: 48px; height: 48px; border-radius: 50%; background: var(--accent-glow); animation: glow-pulse 2s ease-in-out infinite; }
.generating-state h3 { font-family: var(--font-body); font-size: 18px; color: var(--text-primary); }
.generating-state p { color: var(--text-secondary); font-size: 14px; }
.progress-bar { width: 200px; height: 3px; background: var(--bg-secondary); border-radius: 2px; overflow: hidden; }
.progress-fill { height: 100%; width: 60%; background: var(--accent); border-radius: 2px; animation: progress 1.5s ease-in-out infinite; }
@keyframes progress { 0% { width: 0%; } 50% { width: 70%; } 100% { width: 90%; } }
.empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 80px 40px; text-align: center; gap: 12px; color: var(--text-muted); }
.empty-icon { color: var(--accent-dim); margin-bottom: 8px; }
.empty-state h3 { font-family: var(--font-body); font-size: 16px; color: var(--text-secondary); }
.empty-state p { font-size: 14px; max-width: 300px; line-height: 1.6; }
.insights-placeholder { display: flex; flex-direction: column; align-items: center; padding: 60px 20px; text-align: center; color: var(--text-muted); gap: 12px; }
.insights-placeholder p { font-size: 13px; line-height: 1.6; }
@media (max-width: 1200px) { .generator-layout { grid-template-columns: 1fr; } .panel { position: static; } .panel-left, .panel-right { max-height: none; } }
</style>
