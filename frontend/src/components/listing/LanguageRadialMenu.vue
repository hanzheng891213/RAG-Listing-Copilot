<script setup lang="ts">
import { computed, onBeforeUnmount, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { LISTING_LANGUAGES } from '@/utils/constants'

/**
 * The radial language picker: a 160° fan of language bubbles anchored at
 * (x, y) and always opening to the left, because both call sites sit against
 * the right edge of their panel.
 *
 * Teleported to <body>: inside the grid it would be clipped by the cell
 * (overflow: hidden) and the scroll container. A full-screen backdrop closes it
 * on the next click, the way a menu should.
 */
const props = withDefaults(
  defineProps<{
    open: boolean
    x: number
    y: number
    radius?: number
  }>(),
  { radius: 96 },
)

const emit = defineEmits<{
  (e: 'select', language: string): void
  (e: 'close'): void
}>()

const { t } = useI18n()

const ARC_START = -170
const ARC_END = -10

const items = computed(() => {
  const step = LISTING_LANGUAGES.length > 1
    ? (ARC_END - ARC_START) / (LISTING_LANGUAGES.length - 1)
    : 0
  return LISTING_LANGUAGES.map((lang, index) => {
    const angle = ARC_START + index * step
    return {
      ...lang,
      code: lang.value.slice(0, 2).toUpperCase(),
      style: {
        transform: `rotate(${angle}deg) translateY(-${props.radius}px) rotate(${-angle}deg)`,
        animationDelay: `${index * 20}ms`,
      },
    }
  })
})

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') emit('close')
}

watch(
  () => props.open,
  (open) => {
    if (open) window.addEventListener('keydown', onKeydown)
    else window.removeEventListener('keydown', onKeydown)
  },
)

onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <Transition name="radial-layer">
      <div v-if="open" class="radial-layer" @pointerdown.self="emit('close')">
        <div class="radial-anchor" :style="{ left: `${x}px`, top: `${y}px` }">
          <button
            v-for="item in items"
            :key="item.value"
            type="button"
            class="radial-item"
            :style="item.style"
            v-tooltip="t(item.label)"
            @click.stop="emit('select', item.value)"
          >
            <span class="radial-code">{{ item.code }}</span>
          </button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped lang="scss">
@use '../../styles/components/listing/language-radial-menu.scss' as *;
</style>
