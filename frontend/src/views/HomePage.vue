<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/authStore'
import { LISTING_LANGUAGES, PLATFORMS } from '@/utils/constants'
import { safeLocalStorage } from '@/utils/storage'

/**
 * Landing page.
 *
 * Only three surfaces: the hero, the reminder board and the workflow strip.
 * Navigation is explicit only: the hero CTAs, the per-reminder "go" arrow and
 * nothing else. Decorative surfaces react to the pointer but never navigate.
 */
const { t } = useI18n()
const router = useRouter()
const auth = useAuthStore()

const steps = [
  { icon: 'UploadFilled', titleKey: 'home.workflow.import.title', descKey: 'home.workflow.import.desc' },
  { icon: 'MagicStick', titleKey: 'home.workflow.generate.title', descKey: 'home.workflow.generate.desc' },
  { icon: 'ChatDotRound', titleKey: 'home.workflow.refine.title', descKey: 'home.workflow.refine.desc' },
  { icon: 'Download', titleKey: 'home.workflow.export.title', descKey: 'home.workflow.export.desc' },
]

/**
 * Home checklist.
 *
 * No seeded reminders: the board is entirely the user's own list, edited in
 * place and persisted to localStorage. `v2` intentionally ignores the old
 * boolean map so the removed mock items cannot reappear.
 */
interface HomeTodo {
  id: string
  text: string
  done: boolean
}

const TODO_STORAGE_KEY = 'rag-copilot-home-todos-v2'
const MAX_TODO_LENGTH = 120

function createTodoId(): string {
  return `todo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

function loadTodos(): HomeTodo[] {
  try {
    const parsed = JSON.parse(safeLocalStorage.getItem(TODO_STORAGE_KEY) || '[]')
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((item) => item && typeof item.text === 'string' && item.text.trim())
      .map((item) => ({
        id: typeof item.id === 'string' && item.id ? item.id : createTodoId(),
        text: item.text.slice(0, MAX_TODO_LENGTH),
        done: Boolean(item.done),
      }))
  } catch {
    return []
  }
}

const todos = ref<HomeTodo[]>(loadTodos())
const newTodo = ref('')

const total = computed(() => todos.value.length)
const doneCount = computed(() => todos.value.filter((todo) => todo.done).length)
const progress = computed(() =>
  total.value === 0 ? 0 : Math.round((doneCount.value / total.value) * 100),
)
const allDone = computed(() => total.value > 0 && doneCount.value === total.value)

watch(todos, persistTodos, { deep: true })

function persistTodos(): void {
  safeLocalStorage.setItem(TODO_STORAGE_KEY, JSON.stringify(todos.value))
}

function addTodo(): void {
  const text = newTodo.value.trim()
  if (!text) return
  todos.value.push({ id: createTodoId(), text: text.slice(0, MAX_TODO_LENGTH), done: false })
  newTodo.value = ''
}

function toggleTodo(id: string): void {
  const todo = todos.value.find((item) => item.id === id)
  if (todo) todo.done = !todo.done
}

function removeTodo(id: string): void {
  todos.value = todos.value.filter((todo) => todo.id !== id)
}

/** An emptied title means the user wants the row gone, not an invisible todo. */
function onTodoBlur(todo: HomeTodo): void {
  todo.text = todo.text.trim()
  if (!todo.text) removeTodo(todo.id)
}

function onTodoEnter(event: Event): void {
  ;(event.target as HTMLInputElement).blur()
}

function resetTodos(): void {
  todos.value.forEach((todo) => {
    todo.done = false
  })
}

const languageCount = LISTING_LANGUAGES.length
const platformCount = PLATFORMS.length
const prefersReducedMotion =
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

const visualEl = ref<HTMLElement | null>(null)

function navigate(path: string): void {
  router.push(path)
}

function primaryAction(): void {
  if (auth.isLoggedIn) navigate('/product-grid')
  else auth.openLoginModal()
}

function onVisualPointerMove(event: PointerEvent): void {
  if (prefersReducedMotion) return
  const el = event.currentTarget as HTMLElement | null
  if (!el) return
  const rect = el.getBoundingClientRect()
  const px = (event.clientX - rect.left) / rect.width - 0.5
  const py = (event.clientY - rect.top) / rect.height - 0.5
  el.style.setProperty('--tilt-x', `${(-py * 7).toFixed(2)}deg`)
  el.style.setProperty('--tilt-y', `${(px * 10).toFixed(2)}deg`)
}

function resetVisual(): void {
  const el = visualEl.value
  if (!el) return
  el.style.setProperty('--tilt-x', '0deg')
  el.style.setProperty('--tilt-y', '0deg')
}
</script>

<template>
  <div class="home-page">
    <!-- ── Hero ───────────────────────────────────────────────────── -->
    <section class="hero">
      <div class="hero-content">
        <span class="eyebrow">
          <span class="eyebrow-dot" />
          {{ t('home.eyebrow') }}
        </span>

        <h1 class="hero-title">
          <span class="hero-line">{{ t('home.headlineTop') }}</span>
          <span class="hero-line">
            <em>{{ t('home.headlineAccent') }}</em>
            {{ t('home.headlineBottom') }}
          </span>
        </h1>

        <p class="hero-subtitle">{{ t('home.heroSubtitle') }}</p>

        <div class="hero-actions">
          <button type="button" class="btn-primary" @click="primaryAction">
            <el-icon><Grid /></el-icon>
            <span>{{ auth.isLoggedIn ? t('home.uploadBtn') : t('home.loginBtn') }}</span>
            <el-icon class="btn-arrow"><ArrowRight /></el-icon>
          </button>
          <button type="button" class="btn-secondary" @click="navigate('/listing-generator')">
            <el-icon><MagicStick /></el-icon>
            <span>{{ t('home.demoBtn') }}</span>
          </button>
        </div>

        <dl class="hero-proof">
          <div class="proof-item">
            <dt>{{ languageCount }}</dt>
            <dd>{{ t('home.proof.languages') }}</dd>
          </div>
          <div class="proof-item">
            <dt>{{ platformCount }}</dt>
            <dd>{{ t('home.proof.platforms') }}</dd>
          </div>
          <div class="proof-item">
            <dt>RAG</dt>
            <dd>{{ t('home.proof.rules') }}</dd>
          </div>
        </dl>
      </div>

      <!-- A real listing mock, not an abstract diagram: the thing the product
           actually produces, with its score, compliance and keywords. -->
      <div
        ref="visualEl"
        class="hero-visual"
        @pointermove="onVisualPointerMove"
        @pointerleave="resetVisual"
      >
        <div class="visual-orbit" aria-hidden="true" />
        <div class="listing-demo">
          <header class="demo-head">
            <span class="demo-platform">
              <span class="demo-dot" />
              {{ t('home.demo.platform') }}
            </span>
            <span class="demo-live">
              <i />
              {{ t('home.demo.generating') }}
            </span>
          </header>

          <div class="demo-product">
            <div class="demo-thumb">
              <el-icon><Goods /></el-icon>
            </div>
            <div class="demo-heading">
              <span class="demo-sku">{{ t('home.demo.sku') }}</span>
              <p class="demo-title">{{ t('home.demo.title') }}</p>
            </div>
          </div>

          <div class="demo-stream" aria-hidden="true"><span /></div>

          <ul class="demo-bullets">
            <li><el-icon><CircleCheck /></el-icon><span>{{ t('home.demo.bullet1') }}</span></li>
            <li><el-icon><CircleCheck /></el-icon><span>{{ t('home.demo.bullet2') }}</span></li>
            <li><el-icon><CircleCheck /></el-icon><span>{{ t('home.demo.bullet3') }}</span></li>
          </ul>

          <div class="demo-bottom">
            <div class="demo-score">
              <div class="score-ring" :style="{ '--score': 92 }">
                <span class="score-value">92</span>
                <span class="score-max">/100</span>
              </div>
              <div class="score-copy">
                <span class="score-label">{{ t('home.demo.seo') }}</span>
                <div class="score-keywords">
                  <span>camping lantern</span>
                  <span>power bank</span>
                  <span>IPX4</span>
                </div>
              </div>
            </div>
            <span class="demo-compliance">
              <el-icon><CircleCheckFilled /></el-icon>
              {{ t('home.demo.compliance') }}
            </span>
          </div>

          <footer class="demo-footer">
            <span class="demo-keywords-label">{{ t('home.demo.keywords') }}</span>
            <span class="demo-export">
              {{ t('home.demo.exportLabel') }}
              <el-icon><Download /></el-icon>
            </span>
          </footer>
        </div>
      </div>
    </section>

    <!-- ── Reminders ──────────────────────────────────────────────── -->
    <section class="todo-section">
      <div class="section-head todo-head">
        <div class="todo-heading">
          <span class="section-kicker">{{ t('home.todo.kicker') }}</span>
          <h2 class="section-title">{{ t('home.todo.title') }}</h2>
        </div>

        <div class="todo-progress" :class="{ complete: allDone }">
          <div class="progress-top">
            <span class="progress-value">
              {{ t('home.todo.progress', { done: doneCount, total }) }}
            </span>
            <button
              type="button"
              class="progress-reset"
              :disabled="doneCount === 0"
              @click="resetTodos"
            >
              {{ t('home.todo.reset') }}
            </button>
          </div>
          <div
            class="progress-track"
            role="progressbar"
            :aria-valuenow="progress"
            aria-valuemin="0"
            aria-valuemax="100"
          >
            <span class="progress-fill" :style="{ width: `${progress}%` }" />
          </div>
        </div>
      </div>

      <div class="todo-add">
        <input
          v-model="newTodo"
          class="todo-add-input"
          type="text"
          :maxlength="MAX_TODO_LENGTH"
          :placeholder="t('home.todo.addPlaceholder')"
          @keydown.enter.prevent="addTodo"
        />
        <button
          type="button"
          class="todo-add-btn"
          :disabled="!newTodo.trim()"
          @click="addTodo"
        >
          <el-icon><Plus /></el-icon>
          {{ t('home.todo.add') }}
        </button>
      </div>

      <ul v-if="todos.length" class="todo-grid">
        <li
          v-for="todo in todos"
          :key="todo.id"
          class="todo-card"
          :class="{ done: todo.done }"
        >
          <button
            type="button"
            class="todo-check"
            role="checkbox"
            :aria-checked="todo.done"
            :aria-label="t('home.todo.toggle')"
            @click="toggleTodo(todo.id)"
          >
            <el-icon v-if="todo.done"><Check /></el-icon>
          </button>

          <div class="todo-copy">
            <input
              v-model="todo.text"
              class="todo-title-input"
              type="text"
              :maxlength="MAX_TODO_LENGTH"
              :aria-label="t('home.todo.edit')"
              :title="t('home.todo.edit')"
              @blur="onTodoBlur(todo)"
              @keydown.enter.prevent="onTodoEnter"
            />
          </div>

          <button
            type="button"
            class="todo-delete"
            :aria-label="t('common.delete')"
            :title="t('common.delete')"
            @click="removeTodo(todo.id)"
          >
            <el-icon><Delete /></el-icon>
          </button>
        </li>
      </ul>

      <div v-else class="todo-empty">
        <el-icon><List /></el-icon>
        <p>{{ t('home.todo.empty') }}</p>
      </div>

      <p v-if="allDone" class="todo-done-note">
        <el-icon><CircleCheckFilled /></el-icon>
        {{ t('home.todo.allDone') }}
      </p>
    </section>

    <!-- ── Workflow (compact, closing the page) ───────────────────── -->
    <section class="workflow-section">
      <div class="section-head workflow-head">
        <span class="section-kicker">{{ t('home.workflow.kicker') }}</span>
        <h2 class="section-title">{{ t('home.workflow.title') }}</h2>
      </div>

      <div class="workflow-track">
        <article
          v-for="(step, index) in steps"
          :key="step.titleKey"
          class="workflow-step"
          :style="{ '--step-index': index }"
        >
          <span class="step-number">{{ String(index + 1).padStart(2, '0') }}</span>
          <span class="step-icon">
            <el-icon><component :is="step.icon" /></el-icon>
          </span>
          <div class="step-copy">
            <h3 class="step-title">{{ t(step.titleKey) }}</h3>
            <p class="step-desc">{{ t(step.descKey) }}</p>
          </div>
        </article>
      </div>
    </section>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/components/views/home-page.scss' as *;
</style>
