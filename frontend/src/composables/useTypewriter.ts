import { ref, watch, onUnmounted } from 'vue'

/**
 * Typewriter animation for a single string.
 * Returns displayText that progressively reveals the target string character-by-character.
 */
export function useTypewriter(
  target: () => string,
  options?: { speed?: number; delay?: number },
) {
  const speed = options?.speed ?? 30
  const delay = options?.delay ?? 0
  const displayText = ref('')
  let timer: ReturnType<typeof setInterval> | null = null
  let delayTimer: ReturnType<typeof setTimeout> | null = null

  function cleanup() {
    if (timer !== null) { clearInterval(timer); timer = null }
    if (delayTimer !== null) { clearTimeout(delayTimer); delayTimer = null }
  }

  function startAnimating(targetStr: string) {
    cleanup()

    let startIdx: number
    if (targetStr.startsWith(displayText.value)) {
      startIdx = displayText.value.length
    } else {
      startIdx = 0
      displayText.value = ''
    }

    const go = () => {
      let i = startIdx
      timer = setInterval(() => {
        if (i < targetStr.length) {
          i++
          displayText.value = targetStr.slice(0, i)
        } else {
          cleanup()
        }
      }, speed)
    }

    if (startIdx === 0 && delay > 0) {
      delayTimer = setTimeout(go, delay)
    } else {
      go()
    }
  }

  watch(
    () => target(),
    (newVal) => {
      if (!newVal) {
        displayText.value = ''
        cleanup()
        return
      }
      if (displayText.value === newVal) return
      startAnimating(newVal)
    },
    { immediate: true },
  )

  onUnmounted(cleanup)

  return { displayText }
}

/**
 * Typewriter animation for an array of strings.
 * Types out each item one by one, with a gap between items.
 */
export function useTypewriterList(
  items: () => string[],
  options?: { speed?: number; itemGap?: number },
) {
  const speed = options?.speed ?? 30
  const itemGap = options?.itemGap ?? 400
  const displayItems = ref<string[]>([])
  let timeout: ReturnType<typeof setTimeout> | null = null

  function cleanup() {
    if (timeout !== null) { clearTimeout(timeout); timeout = null }
  }

  function animate(list: string[], itemIdx: number, charIdx: number) {
    cleanup()
    if (itemIdx >= list.length) return

    if (charIdx < list[itemIdx].length) {
      const result = list.map((full, i) => {
        if (i < itemIdx) return full
        if (i === itemIdx) return full.slice(0, charIdx + 1)
        return ''
      })
      displayItems.value = result
      timeout = setTimeout(() => animate(list, itemIdx, charIdx + 1), speed)
    } else {
      displayItems.value = list.map((_, i) => (i <= itemIdx ? list[i] : ''))
      timeout = setTimeout(() => animate(list, itemIdx + 1, 0), itemGap)
    }
  }

  watch(
    () => items(),
    (newVal) => {
      cleanup()
      if (!newVal || newVal.length === 0) {
        displayItems.value = []
        return
      }
      displayItems.value = new Array(newVal.length).fill('')
      animate(newVal, 0, 0)
    },
    { immediate: true },
  )

  onUnmounted(cleanup)
  return { displayItems }
}
