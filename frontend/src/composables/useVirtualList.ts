import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import type { Ref } from 'vue'

/**
 * Fixed-height virtual scrolling for long lists.
 * Only renders items inside the visible viewport (plus overscan), so the DOM
 * stays small regardless of the total item count. Each item is expected to
 * occupy exactly `itemHeight` pixels (height + gap).
 *
 * The list container is frequently rendered behind a `v-if` (empty state,
 * loading state, no results…) and appears only after the first request
 * resolves. Measuring it once in `onMounted` therefore misses the real
 * viewport: the observer would watch `null`, `viewportHeight` would stay 0 and
 * only the overscan slice would ever be rendered — a tall empty scroll area
 * with a handful of items at the top. The container ref is watched instead and
 * (re)observed whenever it is attached.
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

  let resizeObserver: ResizeObserver | null = null

  function updateViewport() {
    const el = containerRef.value
    if (!el) return
    viewportHeight.value = el.clientHeight
    scrollTop.value = el.scrollTop
  }

  function onScroll() {
    scrollTop.value = containerRef.value?.scrollTop ?? 0
  }

  function attach(el: HTMLElement | null): void {
    if (!resizeObserver && typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => updateViewport())
    }
    resizeObserver?.disconnect()
    if (el) {
      resizeObserver?.observe(el)
      // ResizeObserver fires asynchronously; measure synchronously too so the
      // first paint after the container appears already has a real viewport.
      updateViewport()
    } else {
      viewportHeight.value = 0
      scrollTop.value = 0
    }
  }

  const startIndex = computed(() =>
    Math.max(0, Math.floor(scrollTop.value / itemHeight) - overscan),
  )
  const endIndex = computed(() => {
    // Before the first measurement, render a conservative window instead of
    // nothing: a zero-height viewport would otherwise translate to 0 visible
    // rows (and look like a broken list) for one frame.
    const height = viewportHeight.value || itemHeight * (overscan * 2)
    return Math.min(
      items.value.length,
      Math.ceil((scrollTop.value + height) / itemHeight) + overscan,
    )
  })
  const visibleItems = computed(() => items.value.slice(startIndex.value, endIndex.value))
  const offsetY = computed(() => startIndex.value * itemHeight)
  const totalHeight = computed(() => items.value.length * itemHeight)

  // When the list shrinks (search filter / re-parse), clamp the scroll offset
  // into bounds so the translated window never overshoots the spacer.
  watch(totalHeight, (height) => {
    const el = containerRef.value
    if (!el) return
    const max = Math.max(0, height - el.clientHeight)
    if (el.scrollTop > max) {
      el.scrollTop = max
      scrollTop.value = max
    }
  })

  function scrollToTop(): void {
    const el = containerRef.value
    if (!el) return
    el.scrollTop = 0
    scrollTop.value = 0
  }

  // The container can be unmounted and remounted with the surrounding v-if.
  watch(
    containerRef,
    (el) => attach(el),
    { flush: 'post' },
  )

  onMounted(() => {
    attach(containerRef.value)

    // Layouts can settle after mount (fonts, parent flex sizing); one more
    // measurement on the next frame keeps the window in sync.
    requestAnimationFrame(() => updateViewport())
  })

  onBeforeUnmount(() => {
    resizeObserver?.disconnect()
    resizeObserver = null
  })

  return {
    containerRef,
    onScroll,
    visibleItems,
    totalHeight,
    offsetY,
    startIndex,
    endIndex,
    scrollToTop,
  }
}
