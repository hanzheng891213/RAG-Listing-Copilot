import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

const STORAGE_KEY = 'rag-copilot-api-key'

function loadKey(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) || ''
  } catch {
    return ''
  }
}

function persistKey(key: string) {
  try {
    if (key) {
      localStorage.setItem(STORAGE_KEY, key)
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
  } catch {
    // storage full or unavailable
  }
}

export const useAuthStore = defineStore('auth', () => {
  const apiKey = ref(loadKey())
  const showModal = ref(false)
  const pendingAction = ref<(() => void) | null>(null)

  const isConfigured = computed(() => apiKey.value.length > 0)
  const maskedKey = computed(() => {
    if (!apiKey.value) return ''
    const len = apiKey.value.length
    if (len <= 8) return 'sk-****'
    return apiKey.value.slice(0, 5) + '****' + apiKey.value.slice(-4)
  })

  function setKey(key: string) {
    apiKey.value = key
    persistKey(key)
  }

  function clearKey() {
    apiKey.value = ''
    persistKey('')
  }

  function requireAuth(action: () => void) {
    if (isConfigured.value) {
      action()
    } else {
      pendingAction.value = action
      showModal.value = true
    }
  }

  function onKeySubmitted(key: string) {
    setKey(key)
    showModal.value = false
    const action = pendingAction.value
    pendingAction.value = null
    if (action) {
      action()
    }
  }

  function cancelAuth() {
    showModal.value = false
    pendingAction.value = null
  }

  return {
    apiKey,
    showModal,
    isConfigured,
    maskedKey,
    setKey,
    clearKey,
    requireAuth,
    onKeySubmitted,
    cancelAuth,
  }
})
