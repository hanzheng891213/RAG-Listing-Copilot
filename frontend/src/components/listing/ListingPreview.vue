<script setup lang="ts">
import { ref, computed } from 'vue'
import { marked } from 'marked'
import { useI18n } from 'vue-i18n'
import type { GeneratedListing } from '@/types/listing'
import { useTypewriter, useTypewriterList } from '@/composables/useTypewriter'

const props = defineProps<{ listing: GeneratedListing }>()
const { t } = useI18n()

const activeTab = ref<'title' | 'bullets' | 'description'>('title')

const { displayText: displayTitle } = useTypewriter(() => props.listing.title)
const { displayItems: displayBullets } = useTypewriterList(() => props.listing.bulletPoints)
const { displayText: displayDescription } = useTypewriter(() => props.listing.description, { speed: 15 })

const renderedDescription = computed(() => marked.parse(displayDescription.value))

const isTitleTyping = computed(() => displayTitle.value !== props.listing.title)
const isBulletTyping = (i: number) => {
  const full = props.listing.bulletPoints[i] ?? ''
  const disp = displayBullets.value[i] ?? ''
  return disp && disp.length < full.length
}
const isDescriptionTyping = computed(() => displayDescription.value !== props.listing.description)

const tabKeys = { title: 'listing.tabs.title', bullets: 'listing.tabs.bullets', description: 'listing.tabs.description' } as const

async function copy(text: string) {
  await navigator.clipboard.writeText(text)
}
</script>

<template>
  <div class="listing-preview">
    <div class="preview-tabs">
      <button v-for="(labelKey, key) in tabKeys" :key="key" class="preview-tab" :class="{ active: activeTab === key }" @click="activeTab = key">{{ t(labelKey) }}</button>
    </div>

    <div v-if="activeTab === 'title'" class="preview-section">
      <div class="content-card">
        <p class="listing-title">{{ displayTitle }}<span v-if="isTitleTyping" class="cursor-blink">|</span></p>
        <button class="copy-btn" @click="copy(listing.title)"><el-icon><CopyDocument /></el-icon></button>
      </div>
      <div class="title-stats">
        <div class="stat"><span class="stat-label">{{ t('listing.characters') }}</span><span class="stat-value" :class="{ warn: listing.title.length > 200 }">{{ listing.title.length }}/200</span></div>
        <div class="stat"><span class="stat-label">{{ t('listing.words') }}</span><span class="stat-value">{{ listing.title.split(' ').length }}</span></div>
      </div>
    </div>

    <div v-if="activeTab === 'bullets'" class="preview-section">
      <ul class="bullet-list">
        <li v-for="(bp, i) in displayBullets" :key="i" class="bullet-item">
          <span class="bullet-num">{{ i + 1 }}</span>
          <span class="bullet-text">{{ bp }}<span v-if="isBulletTyping(i)" class="cursor-blink">|</span></span>
          <button class="copy-btn" @click="copy(listing.bulletPoints[i])"><el-icon><CopyDocument /></el-icon></button>
        </li>
      </ul>
    </div>

    <div v-if="activeTab === 'description'" class="preview-section">
      <div class="description-content" v-html="renderedDescription" />
      <span v-if="isDescriptionTyping" class="desc-cursor cursor-blink">|</span>
    </div>
  </div>
</template>

<style scoped>
.listing-preview { display: flex; flex-direction: column; }
.preview-tabs { display: flex; gap: 4px; margin-bottom: 20px; border-bottom: 1px solid var(--border-color); padding-bottom: 0; }
.preview-tab { padding: 10px 18px; border: none; background: transparent; color: var(--text-secondary); font-family: var(--font-body); font-size: 13px; font-weight: 500; cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -1px; transition: all var(--transition-fast); }
.preview-tab:hover { color: var(--text-primary); }
.preview-tab.active { color: var(--accent); border-bottom-color: var(--accent); }
.preview-section { min-height: 300px; }
.content-card { position: relative; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 24px; }
.listing-title { font-family: var(--font-body); font-size: 16px; font-weight: 600; line-height: 1.5; color: var(--text-primary); padding-right: 40px; }
.copy-btn { position: absolute; top: 12px; right: 12px; width: 32px; height: 32px; border: 1px solid var(--border-color); border-radius: var(--radius-sm); background: var(--bg-card); color: var(--text-muted); cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all var(--transition-fast); font-size: 14px; }
.copy-btn:hover { border-color: var(--accent); color: var(--accent); box-shadow: 0 0 8px var(--accent-glow); }
.title-stats { display: flex; gap: 24px; margin-top: 16px; }
.stat { display: flex; flex-direction: column; gap: 4px; }
.stat-label { font-size: 12px; color: var(--text-muted); }
.stat-value { font-family: var(--font-mono); font-size: 14px; color: var(--text-primary); }
.stat-value.warn { color: var(--warning); }
.bullet-list { list-style: none; display: flex; flex-direction: column; gap: 12px; }
.bullet-item { display: flex; gap: 14px; padding: 16px; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-md); align-items: flex-start; position: relative; transition: all var(--transition-fast); }
.bullet-item:hover { border-color: var(--accent-dim); background: var(--bg-card-hover); }
.bullet-item .copy-btn { opacity: 0; position: static; flex-shrink: 0; }
.bullet-item:hover .copy-btn { opacity: 1; }
.bullet-num { width: 26px; height: 26px; border-radius: 50%; background: var(--accent-glow); color: var(--accent); font-family: var(--font-mono); font-size: 12px; font-weight: 600; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.bullet-text { flex: 1; font-size: 14px; line-height: 1.6; color: var(--text-primary); }
.description-content { background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 28px; font-size: 14px; line-height: 1.8; color: var(--text-primary); }
.description-content :deep(h2) { font-size: 20px; margin: 24px 0 12px; }
.description-content :deep(h3) { font-size: 16px; margin: 20px 0 10px; }
.description-content :deep(ul), .description-content :deep(ol) { padding-left: 20px; margin: 8px 0; }
.description-content :deep(li) { margin: 4px 0; }
.description-content :deep(table) { width: 100%; border-collapse: collapse; margin: 16px 0; }
.description-content :deep(th), .description-content :deep(td) { padding: 10px 14px; border: 1px solid var(--border-color); text-align: left; }
.description-content :deep(th) { background: var(--bg-primary); font-weight: 600; font-size: 13px; }
.description-content :deep(strong) { color: var(--accent-bright); }

.cursor-blink {
  animation: blink 1s step-end infinite;
  color: var(--accent);
  font-weight: 400;
}
@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}
.desc-cursor {
  font-size: 14px;
  line-height: 1.8;
  margin-left: 2px;
}
</style>
