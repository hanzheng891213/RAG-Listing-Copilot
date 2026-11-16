import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import type { PermissionKey, UserInfo } from '@/api/auth'
import { login as loginApi, register as registerApi, fetchMe } from '@/api/auth'
import { useModelStore } from '@/stores/modelStore'

const TOKEN_STORAGE = 'rag-copilot-token'

function loadToken(): string {
  try {
    return localStorage.getItem(TOKEN_STORAGE) || ''
  } catch {
    return ''
  }
}

function persistToken(token: string) {
  try {
    if (token) {
      localStorage.setItem(TOKEN_STORAGE, token)
    } else {
      localStorage.removeItem(TOKEN_STORAGE)
    }
  } catch { /* storage unavailable */ }
}

export const useAuthStore = defineStore('auth', () => {
  // --- User auth state ---
  const token = ref(loadToken())
  const user = ref<UserInfo | null>(null)
  const showLoginModal = ref(false)
  const authLoading = ref(false)

  const isLoggedIn = computed(() => !!token.value && !!user.value)
  const isAdmin = computed(() => user.value?.role === 'admin')

  /** Server-granted page permissions. Admins implicitly hold all of them. */
  const permissions = computed<PermissionKey[]>(() => {
    if (!user.value) return []
    return user.value.role === 'admin'
      ? ['productGrid', 'listingGenerator', 'knowledgeBase', 'modelManager', 'finance']
      : user.value.permissions
  })

  function hasPermission(permission: PermissionKey): boolean {
    return permissions.value.includes(permission)
  }

  function setToken(newToken: string) {
    token.value = newToken
    persistToken(newToken)
  }

  /**
   * Register through the API. The server owns uniqueness (case-insensitive),
   * password policy and the new account's zero-permission starting state.
   */
  async function register(username: string, password: string): Promise<UserInfo> {
    authLoading.value = true
    try {
      const res = await registerApi({ username, password })
      setToken(res.token)
      user.value = res.user
      showLoginModal.value = false
      return res.user
    } finally {
      authLoading.value = false
    }
  }

  async function login(username: string, password: string): Promise<UserInfo> {
    authLoading.value = true
    try {
      const res = await loginApi({ username, password })
      setToken(res.token)
      user.value = res.user
      showLoginModal.value = false
      return res.user
    } finally {
      authLoading.value = false
    }
  }

  let refreshPromise: Promise<void> | null = null

  async function refreshUser() {
    if (!token.value) return
    // Reuse the in-flight request so the router guard and the store-init
    // auto-refresh never issue duplicate fetchMe() calls.
    if (!refreshPromise) {
      refreshPromise = (async () => {
        try {
          user.value = await fetchMe()
        } catch {
          // Token expired or invalid
          logout()
        }
      })().finally(() => {
        refreshPromise = null
      })
    }
    return refreshPromise
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

  // ── Per-account model configuration ─────────────────────────────────
  // Configs are server-scoped by user id. On every identity change the model
  // store drops the previous account's list (so it can never flash another
  // user's provider) and reloads this account's configs.
  watch(
    user,
    (next) => {
      void useModelStore().onUserChanged(next?.id ?? '')
    },
    { immediate: true },
  )

  // Auto-refresh user on store init if token exists
  if (token.value && !user.value) {
    refreshUser()
  }

  // The axios interceptor clears the token on 401; mirror that in memory so the
  // header switches to "logged out" without a reload.
  if (typeof window !== 'undefined') {
    window.addEventListener('rag-auth-expired', () => {
      if (!token.value && !user.value) return
      user.value = null
      token.value = ''
    })
  }

  return {
    token,
    user,
    showLoginModal,
    authLoading,
    isLoggedIn,
    isAdmin,
    permissions,
    hasPermission,
    register,
    login,
    refreshUser,
    logout,
    openLoginModal,
    closeLoginModal,
  }
})
