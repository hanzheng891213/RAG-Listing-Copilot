<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{ keywords: string[]; seoScore: number }>()
const { t } = useI18n()

const scoreColor = computed(() => {
  if (props.seoScore >= 85) return 'var(--success)'
  if (props.seoScore >= 60) return 'var(--warning)'
  return 'var(--danger)'
})

const scoreLabelKey = computed(() => {
  if (props.seoScore >= 85) return 'listing.excellent'
  if (props.seoScore >= 60) return 'listing.good'
  return 'listing.needsImprovement'
})
</script>

<template>
  <div class="seo-insights">
    <h3 class="panel-title">{{ t('listing.seo') }}</h3>
    <div class="score-circle" :style="{ borderColor: scoreColor }">
      <span class="score-value" :style="{ color: scoreColor }">{{ seoScore }}</span>
      <span class="score-label">{{ t(scoreLabelKey) }}</span>
    </div>
    <div class="keywords-section">
      <h4 class="keywords-title">{{ t('listing.suggestedKeywords') }}</h4>
      <div class="keywords-list">
        <span v-for="kw in keywords" :key="kw" class="keyword-tag">{{ kw }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.seo-insights { display: flex; flex-direction: column; gap: 20px; }
.panel-title { font-family: var(--font-body); font-size: 15px; font-weight: 600; color: var(--text-primary); }
.score-circle { width: 100px; height: 100px; border-radius: 50%; border: 3px solid; display: flex; flex-direction: column; align-items: center; justify-content: center; margin: 0 auto; background: var(--bg-secondary); }
.score-value { font-family: var(--font-display-serif); font-size: 32px; font-weight: 700; line-height: 1; }
.score-label { font-size: 11px; color: var(--text-muted); margin-top: 2px; }
.keywords-section { display: flex; flex-direction: column; gap: 10px; }
.keywords-title { font-family: var(--font-body); font-size: 13px; font-weight: 600; color: var(--text-secondary); }
.keywords-list { display: flex; flex-wrap: wrap; gap: 6px; }
.keyword-tag { padding: 4px 10px; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 20px; font-size: 12px; color: var(--text-secondary); transition: all var(--transition-fast); }
.keyword-tag:hover { border-color: var(--accent-dim); color: var(--accent); background: var(--accent-glow); }
</style>
