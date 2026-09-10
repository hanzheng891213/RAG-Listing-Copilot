import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import type { Ref } from 'vue'

/**
 * Fixed-height virtual scrolling for long lists.
 * Only renders items inside the visible viewport (plus overscan), so the DOM
 * stays small regardless of the total item count. Each item is expected to
 * occupy exactly `itemHeight` pixels (height + gap).
 */
export function useVirtualList<T>(
  items: Ref<T[]>,
  options?: { itemHeight?: number; overscan?: number },
) {
  const itemHeight = options?.itemHeight ?? 74
  const overscan = options?.overscan ?? 6

  const containerRef = ref<HTMLElement | null>(null)
  const scrollTop = ref(0)
  const viewportHeight = ref(0)

  function updateViewport() {
    viewportHeight.value = containerRef.value?.clientHeight ?? 0
  }

  function onScroll() {
    scrollTop.value = containerRef.value?.scrollTop ?? 0
  }

  const startIndex = computed(() =>
    Math.max(0, Math.floor(scrollTop.value / itemHeight) - overscan),
  )
  const endIndex = computed(() =>
    Math.min(
      items.value.length,
      Math.ceil((scrollTop.value + viewportHeight.value) / itemHeight) + overscan,
    ),
  )
  const visibleItems = computed(() => items.value.slice(startIndex.value, endIndex.value))
  const offsetY = computed(() => startIndex.value * itemHeight)
  const totalHeight = computed(() => items.value.length * itemHeight)

  // When the list shrinks (search filter / re-parse), clamp the scroll offset
  // into bounds so the translated window never overshoots the spacer.
  watch(totalHeight, (height) => {
    const el = containerRef.value
    if (el && el.scrollTop > height) {
      el.scrollTop = height
    }
  })

  let resizeObserver: ResizeObserver | null = null

  onMounted(() => {
    updateViewport()
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(updateViewport)
      if (containerRef.value) resizeObserver.observe(containerRef.value)
    }
  })

  onBeforeUnmount(() => {
    resizeObserver?.disconnect()
  })

  return { containerRef, onScroll, visibleItems, totalHeight, offsetY, startIndex, endIndex }
}
