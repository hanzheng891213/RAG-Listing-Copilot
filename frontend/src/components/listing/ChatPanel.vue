<script setup lang="ts">
import { ref, computed, nextTick, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessageBox } from 'element-plus'
import { useChatStore } from '@/stores/chatStore'
import { useListingStore } from '@/stores/listingStore'
import type { GeneratedListing } from '@/types/listing'
import ConfirmButton from '@/components/common/ConfirmButton.vue'

const { t } = useI18n()
const store = useListingStore()
const chat = useChatStore()
const input = ref('')
const chatBody = ref<HTMLElement | null>(null)
const showAddPreset = ref(false)
const newPreset = ref('')

const defaultPresetKeys = ['chat.presets.engaging', 'chat.presets.shorten', 'chat.presets.compliance', 'chat.presets.keywords', 'chat.presets.seo', 'chat.presets.professional', 'chat.presets.eco']

const allPresets = computed(() => [...defaultPresetKeys.map(k => t(k)), ...chat.customPresets])

function scrollToBottom() {
  nextTick(() => {
    if (chatBody.value) {
      chatBody.value.scrollTop = chatBody.value.scrollHeight
    }
  })
}

function onPresetClick(text: string) {
  input.value = text
}

async function onSend() {
  const text = input.value.trim()
  if (!text || chat.isLoading) return
  input.value = ''

  const context: GeneratedListing | undefined = store.activeListing ?? undefined
  await chat.sendMessage(text, context)
  scrollToBottom()
}

function onApply(text: string) {
  // Parse AI reply for listing fields to update
  // For now, notify via the store that we have a suggestion
  chat.messages.push({
    role: 'assistant',
    content: `[Applied] ${t('chat.applied')}`,
  })
  scrollToBottom()
}

function onAddPreset() {
  const text = newPreset.value.trim()
  if (!text) return
  chat.addPreset(text)
  newPreset.value = ''
  showAddPreset.value = false
}

function onRemovePreset(index: number) {
  ElMessageBox.confirm(t('chat.confirmRemovePreset'), t('common.confirmTitle'), {
    confirmButtonText: t('common.confirm'),
    cancelButtonText: t('common.cancel'),
    type: 'warning',
    draggable: true,
  }).then(() => {
    chat.removePreset(index)
  }).catch(() => {})
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    onSend()
  }
}

watch(() => store.activeListing, () => {
  if (store.activeListing) {
    chat.clearMessages()
  }
})
</script>

<template>
  <div class="chat-panel">
    <div class="chat-header">
      <span class="chat-title">{{ t("chat.title") }}</span>
      <ConfirmButton
        size="small"
        text
        type="danger"
        :confirm-title="t('common.confirmTitle')"
        :confirm-message="t('chat.confirmClear')"
        :disabled="chat.messages.length === 0"
        @click="chat.clearMessages()"
      >
        {{ t('chat.clear') }}
      </ConfirmButton>
    </div>

    <div ref="chatBody" class="chat-body">
      <div v-if="chat.messages.length === 0" class="chat-empty">
        <p>{{ t("chat.empty") }}</p>
      </div>

      <div
        v-for="(msg, i) in chat.messages"
        :key="i"
        :class="['chat-msg', msg.role === 'user' ? 'msg-user' : 'msg-assistant']"
      >
        <div class="msg-content">{{ msg.content }}</div>
        <div v-if="msg.role === 'assistant' && !msg.content.startsWith('Error:')" class="msg-actions">
          <el-button size="small" text type="primary" @click="onApply(msg.content)">
            {{ t('chat.apply') }}
          </el-button>
        </div>
      </div>

      <div v-if="chat.isLoading" class="chat-loading">
        <span class="dot-pulse" />
        <span>{{ t("chat.thinking") }}</span>
      </div>
    </div>

    <!-- Quick presets -->
    <div class="presets-area">
      <div class="presets-header">
        <span class="presets-label">{{ t("chat.quickPrompts") }}</span>
        <el-button size="small" text @click="showAddPreset = !showAddPreset">+</el-button>
      </div>
      <div v-if="showAddPreset" class="preset-add">
        <el-input
          v-model="newPreset"
          size="small"
          :placeholder="t('chat.newPresetPlaceholder')"
          @keydown.enter="onAddPreset"
        >
          <template #append>
            <el-button @click="onAddPreset" size="small">{{ t('chat.addPreset') }}</el-button>
          </template>
        </el-input>
      </div>
      <div class="presets-list">
        <span
          v-for="(p, pi) in allPresets"
          :key="pi"
          class="preset-chip"
          @click="onPresetClick(p)"
        >
          {{ p }}
          <span
            v-if="pi >= defaultPresetKeys.length"
            class="preset-remove"
            @click.stop="onRemovePreset(pi - defaultPresetKeys.length)"
          >&times;</span>
        </span>
      </div>
    </div>

    <!-- Input -->
    <div class="chat-input-area">
      <el-input
        v-model="input"
        type="textarea"
        :rows="2"
        :placeholder="t('chat.inputPlaceholder')"
        @keydown="onKeydown"
        resize="none"
      />
      <el-button
        type="primary"
        size="small"
        :disabled="!input.trim() || chat.isLoading"
        @click="onSend"
        class="send-btn"
      >
        {{ t('chat.send') }}
      </el-button>
    </div>
  </div>
</template>

<style scoped>
.chat-panel {
  display: flex;
  flex-direction: column;
  height: 480px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background: var(--bg-card);
  margin-top: 12px;
}
.chat-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border-color);
  gap: 8px;
}
.chat-title {
  font-weight: 500;
  font-size: 14px;
  color: var(--text-primary);
  white-space: nowrap;
}
.chat-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.chat-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-muted);
  font-size: 13px;
  text-align: center;
  padding: 20px;
}
.chat-msg {
  max-width: 90%;
  padding: 8px 12px;
  border-radius: var(--radius-md);
  font-size: 13px;
  line-height: 1.5;
}
.msg-user {
  align-self: flex-end;
  background: var(--accent);
  color: #fff;
}
.msg-assistant {
  align-self: flex-start;
  background: var(--bg-secondary);
  color: var(--text-primary);
}
.msg-content {
  white-space: pre-wrap;
  word-break: break-word;
}
.msg-actions {
  margin-top: 4px;
  display: flex;
  gap: 6px;
}
.chat-loading {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-muted);
  font-size: 13px;
  padding: 4px 0;
}
.dot-pulse {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent);
  animation: dot-pulse 1s ease-in-out infinite;
}
@keyframes dot-pulse {
  0%, 100% { opacity: 0.3; }
  50% { opacity: 1; }
}
.presets-area {
  padding: 8px 14px;
  border-top: 1px solid var(--border-color);
}
.presets-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}
.presets-label {
  font-size: 11px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.preset-add {
  margin-bottom: 6px;
}
.presets-list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  max-height: 80px;
  overflow-y: auto;
}
.preset-chip {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 2px 8px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  font-size: 11px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.preset-chip:hover {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
}
.preset-remove {
  font-size: 14px;
  font-weight: bold;
  opacity: 0.5;
}
.preset-remove:hover { opacity: 1; }
.chat-input-area {
  padding: 8px 14px;
  border-top: 1px solid var(--border-color);
  display: flex;
  gap: 8px;
  align-items: flex-end;
}
.send-btn {
  flex-shrink: 0;
  margin-bottom: 2px;
}
</style>
