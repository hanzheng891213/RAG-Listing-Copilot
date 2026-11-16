import { defineStore } from 'pinia'
import { ref } from 'vue'
import { sendChatMessageStream, type ChatMessage } from '@/api/chat'
import { useModelStore } from '@/stores/modelStore'
import type { GeneratedListing } from '@/types/listing'
import i18n from '@/locales'

const PRESETS_STORAGE = 'rag-copilot-chat-presets'

function loadPresets(): string[] {
  try {
    const raw = localStorage.getItem(PRESETS_STORAGE)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function savePresets(presets: string[]) {
  try {
    localStorage.setItem(PRESETS_STORAGE, JSON.stringify(presets))
  } catch { /* ignore */ }
}

export const useChatStore = defineStore('chat', () => {
  const messages = ref<ChatMessage[]>([])
  const isLoading = ref(false)
  const isStreaming = ref(false)
  const error = ref('')
  const customPresets = ref<string[]>(loadPresets())
  /**
   * Conversations keyed by listing id. Switching the product tab must not throw
   * away the thread the user already had for another product.
   */
  const threads = ref<Record<string, ChatMessage[]>>({})
  const activeThreadId = ref('')
  let streamController: AbortController | null = null

  function addPreset(text: string) {
    if (customPresets.value.includes(text)) return
    customPresets.value.push(text)
    savePresets(customPresets.value)
  }

  function removePreset(index: number) {
    customPresets.value.splice(index, 1)
    savePresets(customPresets.value)
  }

  function addUserMessage(content: string) {
    messages.value.push({ role: 'user', content })
  }

  async function sendMessage(content: string, listingContext?: GeneratedListing) {
    if (isLoading.value) return
    addUserMessage(content)
    isLoading.value = true
    isStreaming.value = true
    error.value = ''

    // Placeholder for streaming response
    messages.value.push({ role: 'assistant', content: '' })
    const assistantIdx = messages.value.length - 1
    // Every callback below is scoped to the thread that asked. A tab switch
    // stops the stream, but already-queued chunks can still arrive and must not
    // be appended to the newly selected product's conversation.
    const threadId = activeThreadId.value
    const isCurrentThread = () => activeThreadId.value === threadId

    try {
      const modelStore = useModelStore()
      const activeCfg = modelStore.activeConfig

      streamController = sendChatMessageStream(
        {
          messages: messages.value.slice(-11, -1), // last 10 before the placeholder
          listingContext,
          providerId: activeCfg?.providerId,
        },
        // onChunk
        (content: string) => {
          if (!isCurrentThread()) return
          const target = messages.value[assistantIdx]
          // The user may have cleared the conversation mid-stream.
          if (!target) return
          messages.value[assistantIdx] = { ...target, content: target.content + content }
        },
        // onDone
        () => {
          if (!isCurrentThread()) return
          isLoading.value = false
          isStreaming.value = false
          streamController = null
        },
        // onError
        (message: string) => {
          if (!isCurrentThread()) return
          error.value = message
          const target = messages.value[assistantIdx]
          if (target && target.content === '') {
            messages.value[assistantIdx] = {
              role: 'assistant',
              content: i18n.global.t('chat.failed'),
            }
          }
          isLoading.value = false
          isStreaming.value = false
          streamController = null
        },
      )
    } catch (err: any) {
      if (!isCurrentThread()) return
      const msg = err.response?.data?.error || err.message || i18n.global.t('chat.failed')
      error.value = msg
      messages.value.push({
        role: 'assistant',
        content: i18n.global.t('chat.checkConfig', { msg }),
      })
      isLoading.value = false
      isStreaming.value = false
    }
  }

  /** Stops the in-flight answer but keeps the partial text that already arrived. */
  function stopStreaming() {
    if (!streamController) return
    streamController.abort()
    streamController = null
    isLoading.value = false
    isStreaming.value = false
  }

  function clearMessages() {
    messages.value = []
    error.value = ''
    if (activeThreadId.value) delete threads.value[activeThreadId.value]
  }

  /**
   * Points the panel at a listing's thread, saving the one being left first.
   * Callers stop the stream before switching: an answer belongs to the listing
   * that asked the question, never to the newly selected one.
   */
  function useThread(listingId: string) {
    if (listingId === activeThreadId.value) return
    if (activeThreadId.value) {
      threads.value[activeThreadId.value] = messages.value.map((message) => ({ ...message }))
    }
    activeThreadId.value = listingId
    messages.value = listingId
      ? (threads.value[listingId] ?? []).map((message) => ({ ...message }))
      : []
    error.value = ''
  }

  return {
    messages,
    isLoading,
    isStreaming,
    error,
    customPresets,
    activeThreadId,
    addPreset,
    removePreset,
    addUserMessage,
    sendMessage,
    stopStreaming,
    clearMessages,
    useThread,
  }
})
