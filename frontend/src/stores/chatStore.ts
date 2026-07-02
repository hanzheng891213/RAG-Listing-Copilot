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
    addUserMessage(content)
    isLoading.value = true
    isStreaming.value = true
    error.value = ''

    // Placeholder for streaming response
    messages.value.push({ role: 'assistant', content: '' })
    const assistantIdx = messages.value.length - 1

    try {
      const modelStore = useModelStore()
      const activeCfg = modelStore.activeConfig

      streamController = sendChatMessageStream(
        {
          messages: messages.value.slice(-11, -1), // last 10 before the placeholder
          listingContext,
          providerId: activeCfg?.providerId,
          apiKey: activeCfg?.apiKey,
          model: activeCfg?.activeModel,
          temperature: activeCfg?.temperature,
          maxTokens: activeCfg?.maxTokens,
        },
        // onChunk
        (content: string) => {
          messages.value[assistantIdx] = {
            ...messages.value[assistantIdx],
            content: messages.value[assistantIdx].content + content,
          }
        },
        // onDone
        () => {
          isLoading.value = false
          isStreaming.value = false
          streamController = null
        },
        // onError
        (message: string) => {
          error.value = message
          if (messages.value[assistantIdx].content === '') {
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

  function clearMessages() {
    messages.value = []
    error.value = ''
  }

  return {
    messages,
    isLoading,
    isStreaming,
    error,
    customPresets,
    addPreset,
    removePreset,
    addUserMessage,
    sendMessage,
    clearMessages,
  }
})
