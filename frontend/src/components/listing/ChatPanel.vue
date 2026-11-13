<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { marked } from 'marked'
import { useChatStore } from '@/stores/chatStore'
import { useListingStore } from '@/stores/listingStore'
import { useModelStore } from '@/stores/modelStore'
import { applyListingDirection } from '@/api/chat'
import type { GeneratedListing } from '@/types/listing'
import ConfirmButton from '@/components/common/ConfirmButton.vue'

/**
 * The optimisation copilot panel.
 *
 * Chat answers stream in as markdown; "apply" is a separate structured call:
 * the prose answer is only context, the endpoint rewrites the listing into a
 * JSON patch, and the patch is merged into the active listing (then the parent
 * writes it back into the 上架表 row).
 */
const emit = defineEmits<{
  (e: 'applied', payload: { listing: GeneratedListing; fields: string[] }): void
}>()

const { t } = useI18n()
const store = useListingStore()
const chat = useChatStore()
const modelStore = useModelStore()

const input = ref('')
const chatBody = ref<HTMLElement | null>(null)
const inputEl = ref<HTMLTextAreaElement | null>(null)
const showAddPreset = ref(false)
const newPreset = ref('')
const composerFocused = ref(false)
const stickToBottom = ref(true)
const applyingIndex = ref<number | null>(null)
/** Applied-field badges are per listing thread, not per message index globally. */
const appliedByListing = ref<Record<string, Record<number, string[]>>>({})
const activeListingId = computed(() => store.activeListing?.id ?? '')

function appliedFieldsFor(index: number): string[] | undefined {
  return appliedByListing.value[activeListingId.value]?.[index]
}

function markApplied(index: number, fields: string[]): void {
  const id = activeListingId.value
  if (!id) return
  appliedByListing.value = {
    ...appliedByListing.value,
    [id]: { ...(appliedByListing.value[id] ?? {}), [index]: fields },
  }
}

const defaultPresetKeys = [
  'chat.presets.engaging',
  'chat.presets.shorten',
  'chat.presets.compliance',
  'chat.presets.keywords',
  'chat.presets.seo',
  'chat.presets.professional',
  'chat.presets.eco',
]

const allPresets = computed(() => [
  ...defaultPresetKeys.map((key) => t(key)),
  ...chat.customPresets,
])

const activeListingTitle = computed(() => {
  const title = store.activeListing?.title?.trim()
  return title || t('chat.untitledListing')
})

const lastIndex = computed(() => chat.messages.length - 1)

function directionFor(index: number): string {
  for (let i = index - 1; i >= 0; i--) {
    const candidate = chat.messages[i]
    if (candidate?.role === 'user' && candidate.content.trim()) return candidate.content
  }
  return ''
}

function isThinking(index: number): boolean {
  const message = chat.messages[index]
  return (
    chat.isLoading &&
    index === lastIndex.value &&
    message?.role === 'assistant' &&
    message.content.length === 0
  )
}

function isStreamingMessage(index: number): boolean {
  const message = chat.messages[index]
  return (
    chat.isStreaming &&
    index === lastIndex.value &&
    message?.role === 'assistant' &&
    message.content.length > 0
  )
}

function isAssistant(index: number): boolean {
  return chat.messages[index]?.role === 'assistant'
}

function canApply(index: number): boolean {
  const message = chat.messages[index]
  return Boolean(
    message &&
      message.role === 'assistant' &&
      message.content.trim() &&
      !message.content.startsWith('Error:') &&
      store.activeListing &&
      !isStreamingMessage(index) &&
      !isThinking(index),
  )
}

function renderMarkdown(content: string): string {
  // The assistant is allowed to emit markdown but never raw HTML: escape tags
  // before parsing so an echoed product description cannot inject markup.
  const safe = String(content ?? '').replace(/</g, '&lt;')
  return marked.parse(safe, { gfm: true, breaks: true }) as string
}

function fieldLabel(field: string): string {
  return t(`chat.fields.${field}`)
}

function onBodyScroll(): void {
  const el = chatBody.value
  if (!el) return
  stickToBottom.value = el.scrollHeight - el.scrollTop - el.clientHeight < 90
}

function scrollToBottom(force = false): void {
  if (!force && !stickToBottom.value) return
  nextTick(() => {
    const el = chatBody.value
    if (!el) return
    el.scrollTop = el.scrollHeight
  })
}

function onPresetClick(text: string): void {
  input.value = text
  inputEl.value?.focus()
}

async function onSend(): Promise<void> {
  const text = input.value.trim()
  if (!text || chat.isLoading) return
  input.value = ''
  stickToBottom.value = true

  const context: GeneratedListing | undefined = store.activeListing ?? undefined
  void chat.sendMessage(text, context)
  scrollToBottom(true)
}

async function onCopy(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    ElMessage.success(t('chat.copied'))
  } catch {
    ElMessage.warning(t('chat.copyFailed'))
  }
}

async function onApply(index: number): Promise<void> {
  if (applyingIndex.value !== null || !canApply(index)) return
  const message = chat.messages[index]
  const listing = store.activeListing
  if (!listing) {
    ElMessage.warning(t('chat.needListing'))
    return
  }

  const cfg = modelStore.activeConfig
  if (!cfg?.apiKey) {
    ElMessage.warning(t('chat.needModel'))
    return
  }

  applyingIndex.value = index
  try {
    const direction = directionFor(index) || t('chat.defaultDirection')
    const { patch } = await applyListingDirection({
      direction,
      suggestion: message.content,
      listing,
      providerId: cfg.providerId,
      apiKey: cfg.apiKey,
      model: cfg.activeModel,
      maxTokens: cfg.maxTokens,
    })

    const fields = store.applyPatch(patch ?? {})
    if (fields.length === 0) {
      ElMessage.info(t('chat.noChanges'))
      return
    }

    markApplied(index, fields)
    const labels = fields.map(fieldLabel).join(' · ')
    ElMessage.success(t('chat.appliedNow', { fields: labels }))
    if (store.activeListing) {
      emit('applied', { listing: store.activeListing, fields })
    }
    scrollToBottom(true)
  } catch (err) {
    const error = err as { response?: { data?: { error?: string } }; message?: string }
    const detail = error?.response?.data?.error || error?.message || ''
    console.error('[Chat] apply failed:', err)
    ElMessage.error(`${t('chat.applyFailed')}${detail ? `：${detail}` : ''}`)
  } finally {
    applyingIndex.value = null
  }
}

function onAddPreset(): void {
  const text = newPreset.value.trim()
  if (!text) return
  chat.addPreset(text)
  newPreset.value = ''
  showAddPreset.value = false
}

async function onRemovePreset(index: number): Promise<void> {
  const { ElMessageBox } = await import('element-plus')
  try {
    await ElMessageBox.confirm(t('chat.confirmRemovePreset'), t('common.confirmTitle'), {
      confirmButtonText: t('common.confirm'),
      cancelButtonText: t('common.cancel'),
      type: 'warning',
      draggable: true,
    })
    chat.removePreset(index)
  } catch {
    // cancelled
  }
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return
  event.preventDefault()
  if (!chat.isLoading) void onSend()
}

// Switching product tabs is switching conversations. The thread for the listing
// being left is saved, and the one being opened is restored. Applying a patch
// keeps the same listing id, so it must keep the thread and the badges intact.
watch(
  () => store.activeListing?.id ?? '',
  (id) => {
    // An answer in flight belongs to the old listing; never append it to the new.
    chat.stopStreaming()
    chat.useThread(id)
  },
  { immediate: true },
)

watch(
  () => chat.messages.length,
  (length) => {
    // Clearing via the header must also drop the per-message "applied" badges,
    // otherwise a fresh reply that reuses an index would inherit one.
    if (length === 0 && activeListingId.value) {
      const next = { ...appliedByListing.value }
      delete next[activeListingId.value]
      appliedByListing.value = next
    }
    scrollToBottom(true)
  },
)
watch(
  () => chat.messages[chat.messages.length - 1]?.content,
  () => scrollToBottom(),
)
</script>

<template>
  <div class="chat-panel">
    <!-- Header: identity + model + clear -->
    <header class="chat-head">
      <div class="chat-ident">
        <div class="ai-orb" :class="{ 'is-live': chat.isStreaming || chat.isLoading }">
          <el-icon><MagicStick /></el-icon>
        </div>
        <div class="chat-ident-text">
          <div class="chat-title-row">
            <span class="chat-title">{{ t('chat.title') }}</span>
            <span class="chat-badge">RAG</span>
          </div>
          <span class="chat-subtitle">{{ t('chat.subtitle') }}</span>
        </div>
      </div>

      <div class="chat-head-actions">
        <el-dropdown
          v-if="modelStore.configuredProviders.length > 0"
          trigger="click"
          placement="bottom-end"
          @command="modelStore.setActiveProvider"
        >
          <button
            type="button"
            class="model-pill"
            :aria-label="modelStore.activeModelName || modelStore.activeConfig?.activeModel"
            v-tooltip="modelStore.activeModelName || modelStore.activeConfig?.activeModel || ''"
          >
            <el-icon><Cpu /></el-icon>
            <span class="model-live-dot" />
          </button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item
                v-for="cfg in modelStore.configuredProviders"
                :key="cfg.providerId"
                :command="cfg.providerId"
                :class="{ 'is-active-model': cfg.providerId === modelStore.activeProviderId }"
              >
                <span class="model-option">
                  <el-icon v-if="cfg.providerId === modelStore.activeProviderId"><Check /></el-icon>
                  <span>{{ modelStore.providers.find((p) => p.id === cfg.providerId)?.name || cfg.providerId }}</span>
                  <span class="model-option__id">{{ cfg.activeModel }}</span>
                </span>
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>

        <span v-tooltip="t('chat.clear')">
          <ConfirmButton
            size="small"
            text
            type="danger"
            :confirm-title="t('common.confirmTitle')"
            :confirm-message="t('chat.confirmClear')"
            :disabled="chat.messages.length === 0"
            @click="chat.clearMessages()"
          >
            <el-icon><Delete /></el-icon>
          </ConfirmButton>
        </span>
      </div>
    </header>

    <!-- Current listing context -->
    <div v-if="store.activeListing" class="context-strip">
      <span class="context-dot" />
      <span class="context-label">{{ t('chat.context') }}</span>
      <span class="context-title" :title="activeListingTitle">{{ activeListingTitle }}</span>
      <span class="context-version">v{{ store.activeListing.version }}</span>
    </div>
    <div v-else class="context-strip is-empty">
      <span class="context-dot" />
      <span class="context-label">{{ t('chat.noListingContext') }}</span>
    </div>

    <div ref="chatBody" class="chat-body" @scroll.passive="onBodyScroll">
      <!-- Empty state -->
      <div v-if="chat.messages.length === 0" class="chat-empty">
        <div class="empty-orb">
          <el-icon><ChatDotRound /></el-icon>
        </div>
        <h4 class="empty-title">{{ t('chat.emptyTitle') }}</h4>
        <p class="empty-desc">{{ t('chat.empty') }}</p>
        <div class="empty-hints">
          <button
            v-for="preset in allPresets.slice(0, 3)"
            :key="preset"
            type="button"
            class="empty-hint"
            @click="onPresetClick(preset)"
          >
            <el-icon><Promotion /></el-icon>
            <span>{{ preset }}</span>
          </button>
        </div>
      </div>

      <TransitionGroup name="msg" tag="div" class="chat-stream">
        <div
          v-for="(msg, index) in chat.messages"
          :key="index"
          class="chat-msg"
          :class="msg.role === 'user' ? 'msg-user' : 'msg-assistant'"
        >
          <div class="msg-avatar">
            <el-icon v-if="msg.role === 'user'"><User /></el-icon>
            <el-icon v-else><MagicStick /></el-icon>
          </div>

          <div class="msg-body">
            <div class="bubble" :class="{ 'is-streaming': isStreamingMessage(index) }">
              <div v-if="isThinking(index)" class="typing-dots" aria-label="streaming">
                <span /><span /><span />
              </div>
              <template v-else-if="msg.role === 'assistant'">
                <div class="bubble-text markdown-body" v-html="renderMarkdown(msg.content)" />
                <span v-if="isStreamingMessage(index)" class="stream-caret" />
              </template>
              <p v-else class="bubble-text">{{ msg.content }}</p>
            </div>

            <div v-if="isAssistant(index) && !isThinking(index)" class="msg-meta">
              <span v-if="isStreamingMessage(index)" class="streaming-tag">
                <i class="streaming-dot" />
                {{ t('chat.streaming') }}
              </span>
              <span v-else class="msg-role">{{ t('chat.assistantName') }}</span>

              <div class="msg-tools">
                <button
                  type="button"
                  class="tool-btn"
                  :title="t('chat.copy')"
                  :disabled="!msg.content"
                  @click="onCopy(msg.content)"
                >
                  <el-icon><CopyDocument /></el-icon>
                </button>
                <button
                  type="button"
                  class="apply-btn"
                  :disabled="!canApply(index) || applyingIndex !== null"
                  :title="store.activeListing ? t('chat.applyHint') : t('chat.needListing')"
                  @click="onApply(index)"
                >
                  <el-icon v-if="applyingIndex === index" class="is-loading"><Loading /></el-icon>
                  <el-icon v-else><Promotion /></el-icon>
                  <span>{{ applyingIndex === index ? t('chat.applying') : t('chat.apply') }}</span>
                </button>
              </div>
            </div>

            <div v-if="appliedFieldsFor(index)" class="applied-note">
              <el-icon><CircleCheckFilled /></el-icon>
              <span>{{ t('chat.appliedTo', { fields: appliedFieldsFor(index)?.map(fieldLabel).join(' · ') }) }}</span>
            </div>
          </div>
        </div>
      </TransitionGroup>
    </div>

    <!-- Quick presets (the empty state surfaces a first subset, so the full
         strip only appears once a conversation exists) -->
    <div v-if="chat.messages.length > 0" class="presets-area">
      <div class="presets-header">
        <span class="presets-label">
          <el-icon><Sunny /></el-icon>
          {{ t('chat.quickPrompts') }}
        </span>
        <button type="button" class="presets-add" @click="showAddPreset = !showAddPreset">
          {{ showAddPreset ? '−' : '+' }}
        </button>
      </div>

      <div v-if="showAddPreset" class="preset-add">
        <el-input
          v-model="newPreset"
          size="small"
          :placeholder="t('chat.newPresetPlaceholder')"
          @keydown.enter="onAddPreset"
        >
          <template #append>
            <el-button size="small" @click="onAddPreset">{{ t('chat.addPreset') }}</el-button>
          </template>
        </el-input>
      </div>

      <div class="presets-scroll">
        <button
          v-for="(preset, presetIndex) in allPresets"
          :key="presetIndex"
          type="button"
          class="preset-chip"
          @click="onPresetClick(preset)"
        >
          <span class="preset-text">{{ preset }}</span>
          <span
            v-if="presetIndex >= defaultPresetKeys.length"
            class="preset-remove"
            role="button"
            tabindex="0"
            @click.stop="onRemovePreset(presetIndex - defaultPresetKeys.length)"
          >&times;</span>
        </button>
      </div>
    </div>

    <!-- Composer -->
    <footer class="chat-composer">
      <div class="composer-box" :class="{ 'is-focused': composerFocused }">
        <textarea
          ref="inputEl"
          v-model="input"
          class="composer-input"
          rows="2"
          :placeholder="t('chat.inputPlaceholder')"
          @focus="composerFocused = true"
          @blur="composerFocused = false"
          @keydown="onKeydown"
        />
        <div class="composer-bar">
          <span class="composer-hint">{{ t('chat.sendHint') }}</span>
          <button
            v-if="chat.isLoading"
            type="button"
            class="stop-btn"
            @click="chat.stopStreaming()"
          >
            <span class="stop-square" />
            {{ t('chat.stop') }}
          </button>
          <button
            v-else
            type="button"
            class="send-btn"
            :disabled="!input.trim()"
            @click="onSend"
          >
            <el-icon><Promotion /></el-icon>
            {{ t('chat.send') }}
          </button>
        </div>
      </div>
      <p v-if="chat.error" class="composer-error">{{ chat.error }}</p>
    </footer>
  </div>
</template>

<style scoped lang="scss">
@use '../../styles/components/listing/chat-panel.scss' as *;
</style>
