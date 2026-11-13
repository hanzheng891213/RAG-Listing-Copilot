import type { Directive, DirectiveBinding } from 'vue'

/**
 * Themed replacement for the native `title` tooltip.
 *
 * Native `title` popups are drawn by the OS/browser and are always a plain
 * black rectangle — they ignore the app theme and look broken against both the
 * dark and light palettes. This directive renders one reusable fixed-position
 * card in the app palette instead, and removes any leftover `title` attribute
 * so the black popup can never appear next to it.
 *
 * Usage:
 *   v-tooltip="'Full text'"
 *   v-tooltip="{ content: text, disabled: !text }"
 */

type TooltipValue =
  | string
  | {
      content?: string
      disabled?: boolean
    }
  | null
  | undefined

interface TooltipState {
  value: TooltipValue
  show: () => void
  hide: () => void
  focusIn: (event: FocusEvent) => void
}

const states = new WeakMap<HTMLElement, TooltipState>()

let tip: HTMLDivElement | null = null
let showTimer: ReturnType<typeof setTimeout> | null = null
let activeEl: HTMLElement | null = null

const SHOW_DELAY_MS = 160
const GAP_PX = 8
const EDGE_PX = 8

function contentOf(value: TooltipValue): string {
  if (!value) return ''
  if (typeof value === 'string') return value.trim()
  if (value.disabled) return ''
  return (value.content ?? '').trim()
}

function ensureTip(): HTMLDivElement {
  if (tip) return tip
  tip = document.createElement('div')
  tip.className = 'app-tooltip'
  tip.setAttribute('role', 'tooltip')
  tip.setAttribute('aria-hidden', 'true')
  document.body.appendChild(tip)
  return tip
}

function position(el: HTMLElement, node: HTMLDivElement): void {
  const rect = el.getBoundingClientRect()
  const tipRect = node.getBoundingClientRect()

  let top = rect.top - tipRect.height - GAP_PX
  if (top < EDGE_PX) top = rect.bottom + GAP_PX
  top = Math.min(top, window.innerHeight - tipRect.height - EDGE_PX)
  top = Math.max(top, EDGE_PX)

  let left = rect.left + rect.width / 2 - tipRect.width / 2
  const maxLeft = window.innerWidth - tipRect.width - EDGE_PX
  left = Math.min(Math.max(left, EDGE_PX), Math.max(EDGE_PX, maxLeft))

  node.style.left = `${Math.round(left)}px`
  node.style.top = `${Math.round(top)}px`
}

function hide(): void {
  if (showTimer) {
    clearTimeout(showTimer)
    showTimer = null
  }
  if (!tip) return
  tip.classList.remove('is-visible')
  tip.setAttribute('aria-hidden', 'true')
  activeEl = null
  window.removeEventListener('scroll', hide, true)
  window.removeEventListener('resize', hide)
}

function show(el: HTMLElement): void {
  const state = states.get(el)
  if (!state) return
  const content = contentOf(state.value)
  if (!content) return

  if (showTimer) clearTimeout(showTimer)
  showTimer = setTimeout(() => {
    showTimer = null
    const node = ensureTip()
    node.textContent = content
    node.classList.add('is-visible')
    node.setAttribute('aria-hidden', 'false')
    activeEl = el
    requestAnimationFrame(() => {
      if (tip && activeEl === el) position(el, tip)
    })
    window.addEventListener('scroll', hide, true)
    window.addEventListener('resize', hide)
  }, SHOW_DELAY_MS)
}

function bind(el: HTMLElement, binding: DirectiveBinding<TooltipValue>): void {
  // The browser title is what produces the unstyled black popup.
  el.removeAttribute('title')
  const focusIn = (event: FocusEvent) => {
    // A cell tooltip must not pop over the inline editor when it gains focus.
    const target = event.target as HTMLElement | null
    if (target && target !== el && target.closest('input, textarea, select, [contenteditable="true"]')) {
      return
    }
    show(el)
  }
  const state: TooltipState = {
    value: binding.value,
    show: () => show(el),
    hide: () => hide(),
    focusIn,
  }
  states.set(el, state)
  el.addEventListener('mouseenter', state.show)
  el.addEventListener('mouseleave', state.hide)
  el.addEventListener('focusin', focusIn)
  el.addEventListener('focusout', state.hide)
  el.addEventListener('pointerdown', state.hide)
}

export const tooltip: Directive<HTMLElement, TooltipValue> = {
  mounted(el, binding) {
    bind(el, binding)
  },
  updated(el, binding) {
    el.removeAttribute('title')
    const state = states.get(el)
    if (!state) return
    state.value = binding.value

    if (activeEl === el) {
      const content = contentOf(binding.value)
      if (!content) {
        hide()
      } else if (tip) {
        tip.textContent = content
        requestAnimationFrame(() => {
          if (tip && activeEl === el) position(el, tip)
        })
      }
    }
  },
  unmounted(el) {
    const state = states.get(el)
    if (!state) return
    el.removeEventListener('mouseenter', state.show)
    el.removeEventListener('mouseleave', state.hide)
    el.removeEventListener('focusin', state.focusIn)
    el.removeEventListener('focusout', state.hide)
    el.removeEventListener('pointerdown', state.hide)
    states.delete(el)
    if (activeEl === el) hide()
  },
}
