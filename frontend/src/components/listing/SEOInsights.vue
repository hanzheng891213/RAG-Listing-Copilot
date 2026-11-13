<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useTypewriterList } from '@/composables/useTypewriter'

const props = defineProps<{ keywords: string[]; seoScore: number }>()
const { t } = useI18n()

const { displayItems: displayKeywords } = useTypewriterList(() => props.keywords, { speed: 40, itemGap: 300 })

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
        <span v-for="(kw, i) in displayKeywords" :key="i" class="keyword-tag" :class="{ typing: kw && kw.length < (props.keywords[i] || '').length }">{{ kw }}<span v-if="kw && kw.length < (props.keywords[i] || '').length" class="cursor-blink">|</span></span>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '../../styles/components/listing/seo-insights.scss' as *;
</style>
