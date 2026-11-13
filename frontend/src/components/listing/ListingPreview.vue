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

<style scoped lang="scss">
@use '../../styles/components/listing/listing-preview.scss' as *;
</style>
