<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ListingTab } from '@/types/listing'

/**
 * Browser-style tab strip for generated products.
 *
 * The center panel and the chat panel always show one listing; these tabs are
 * the switch. Labels are truncated by CSS (title attribute keeps the full name)
 * so a long catalogue never stretches the layout.
 */
const props = defineProps<{
  tabs: ListingTab[]
  activeId: string
}>()

const emit = defineEmits<{
  (e: 'select', id: string): void
}>()

const { t } = useI18n()
const scrollEl = ref<HTMLElement | null>(null)

async function scrollActiveIntoView(): Promise<void> {
  await nextTick()
  const container = scrollEl.value
  if (!container) return
  const active = container.querySelector<HTMLElement>('.tab.is-active')
  active?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
}

watch(() => props.activeId, scrollActiveIntoView, { immediate: true })
watch(() => props.tabs.length, scrollActiveIntoView)

/** Vertical wheel scrolls the strip sideways, like a browser tab bar. */
function onWheel(event: WheelEvent): void {
  const container = scrollEl.value
  if (!container || event.deltaY === 0) return
  if (container.scrollWidth <= container.clientWidth) return
  event.preventDefault()
  container.scrollLeft += event.deltaY
}
</script>

<template>
  <nav class="listing-tabs" :aria-label="t('listing.tabsAria')">
    <div v-if="tabs.length === 0" class="tabs-empty">
      <el-icon><Collection /></el-icon>
      <span>{{ t('listing.tabsEmpty') }}</span>
    </div>

    <div v-else ref="scrollEl" class="tabs-scroll" role="tablist" @wheel="onWheel">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        type="button"
        role="tab"
        class="tab"
        :class="{ 'is-active': tab.id === activeId, 'is-generating': tab.generating }"
        :aria-selected="tab.id === activeId"
        :title="tab.label"
        @click="emit('select', tab.id)"
      >
        <span class="tab-dot" />
        <span class="tab-label">{{ tab.label }}</span>
        <span v-if="tab.generating" class="tab-spinner" />
      </button>
    </div>
  </nav>
</template>

<style scoped lang="scss">
@use '../../styles/components/listing/listing-tabs.scss' as *;
</style>
