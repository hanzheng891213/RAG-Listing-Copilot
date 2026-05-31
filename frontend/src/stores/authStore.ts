import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { UserInfo } from '@/api/auth'
import { login as loginApi, fetchMe } from '@/api/auth'

const API_KEY_STORAGE = 'rag-copilot-api-key'
const TOKEN_STORAGE = 'rag-copilot-token'

function loadApiKey(): string {
  try {
    return localStorage.getItem(API_KEY_STORAGE) || ''
  } catch {
    return ''
  }
}

function loadToken(): string {
  try {
    return localStorage.getItem(TOKEN_STORAGE) || ''
  } catch {
    return ''
  }
}

function persistApiKey(key: string) {
  try {
    if (key) {
      localStorage.setItem(API_KEY_STORAGE, key)
    } else {
      localStorage.removeItem(API_KEY_STORAGE)
    }
  } catch { /* storage unavailable */ }
}

function persistToken(token: string) {
  try {
    if (token) {
      localStorage.setItem(TOKEN_STORAGE, token)
    } else {
      localStorage.removeItem(TOKEN_STORAGE, token)
    }
  } catch { /* storage unavailable */ }
}

export const useAuthStore = defineStore('auth', () => {
  // --- DeepSeek API key state (existing) ---
  const apiKey = ref(loadApiKey())
  const showApiKeyModal = ref(false)
  const pendingAction = ref<(() => void) | null>(null)

  const isApiKeyConfigured = computed(() => apiKey.value.length > 0)
  const maskedKey = computed(() => {
    if (!apiKey.value) return ''
    const len = apiKey.value.length
    if (len <= 8) return 'sk-****'
    return apiKey.value.slice(0, 5) + '****' + apiKey.value.slice(-4)
  })

  function setKey(key: string) {
    apiKey.value = key
    persistApiKey(key)
  }

  function clearKey() {
    apiKey.value = ''
    persistApiKey('')
  }

  function requireAuth(action: () => void) {
    if (isApiKeyConfigured.value) {
      action()
    } else {
      pendingAction.value = action
      showApiKeyModal.value = true
    }
  }

  function onKeySubmitted(key: string) {
    setKey(key)
    showApiKeyModal.value = false
    const action = pendingAction.value
    pendingAction.value = null
    if (action) action()
  }

  function cancelApiKey() {
    showApiKeyModal.value = false
    pendingAction.value = null
  }

  // --- User auth state (new) ---
  const token = ref(loadToken())
  const user = ref<UserInfo | null>(null)
  const showLoginModal = ref(false)
  const authLoading = ref(false)

  const isLoggedIn = computed(() => !!token.value && !!user.value)
  const isAdmin = computed(() => user.value?.role === 'admin')
  const apiCallsRemaining = computed(() => {
    if (!user.value) return 0
    if (user.value.role === 'admin') return Infinity
    return Math.max(0, 3 - user.value.apiCallCount)
  })

  function setToken(newToken: string) {
    token.value = newToken
    persistToken(newToken)
  }

  // Hardcoded credentials — frontend fallback when backend is unavailable
  const MOCK_USERS: Record<string, { password: string; user: UserInfo }> = {
    'hanzheng891213@gmail.com': {
      password: 'handsandblog@110',
      user: { id: 'admin-001', username: 'hanzheng891213@gmail.com', role: 'admin', apiCallCount: 0, createdAt: '2026-05-31T00:00:00.000Z' },
    },
    'O_O@visitor.com': {
      password: '123@456vst',
      user: { id: 'visitor-001', username: 'O_O@visitor.com', role: 'user', apiCallCount: 0, createdAt: '2026-05-31T00:00:00.000Z' },
    },
  }

  async function login(username: string, password: string) {
    authLoading.value = true
    try {
      const res = await loginApi({ username, password })
      setToken(res.token)
      user.value = res.user
      showLoginModal.value = false
    } catch (e: any) {
      // Fallback to mock login when backend is unreachable
      const mock = MOCK_USERS[username]
      if (mock && mock.password === password) {
        setToken('mock-jwt-' + mock.user.id)
        user.value = mock.user
        showLoginModal.value = false
      } else {
        throw e
      }
    } finally {
      authLoading.value = false
    }
  }

  async function refreshUser() {
    if (!token.value) return
    try {
      user.value = await fetchMe()
    } catch {
      // Token expired or invalid
      logout()
    }
  }

  function logout() {
    user.value = null
    setToken('')
  }

  function openLoginModal() {
    showLoginModal.value = true
  }

  function closeLoginModal() {
    showLoginModal.value = false
  }

  // Auto-refresh user on store init if token exists
  if (token.value && !user.value) {
    refreshUser()
  }

  return {
    // API key
    apiKey,
    showApiKeyModal,
    isApiKeyConfigured,
    maskedKey,
    setKey,
    clearKey,
    requireAuth,
    onKeySubmitted,
    cancelApiKey,
    // User auth
    token,
    user,
    showLoginModal,
    authLoading,
    isLoggedIn,
    isAdmin,
    apiCallsRemaining,
    login,
    refreshUser,
    logout,
    openLoginModal,
    closeLoginModal,
  }
})
