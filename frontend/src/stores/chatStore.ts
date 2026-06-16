import { defineStore } from 'pinia'
import { ref } from 'vue'
import { sendChatMessage, type ChatMessage } from '@/api/chat'
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
  const error = ref('')
  const customPresets = ref<string[]>(loadPresets())

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
    error.value = ''

    try {
      const modelStore = useModelStore()
      const response = await sendChatMessage({
        messages: messages.value.slice(-10),
        listingContext,
        providerId: modelStore.activeConfig?.providerId,
      })
      messages.value.push({ role: 'assistant', content: response.reply })
      return response.reply
    } catch (err: any) {
      const msg = err.response?.data?.error || err.message || i18n.global.t('chat.failed')
      error.value = msg
      messages.value.push({
        role: 'assistant',
        content: i18n.global.t('chat.checkConfig', { msg }),
      })
      return ''
    } finally {
      isLoading.value = false
    }
  }

  function clearMessages() {
    messages.value = []
    error.value = ''
  }

  return {
    messages,
    isLoading,
    error,
    customPresets,
    addPreset,
    removePreset,
    addUserMessage,
    sendMessage,
    clearMessages,
  }
})
