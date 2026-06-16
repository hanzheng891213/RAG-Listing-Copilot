import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { UserInfo } from '@/api/auth'
import { login as loginApi, fetchMe } from '@/api/auth'

const TOKEN_STORAGE = 'rag-copilot-token'
const REGISTERED_USERS_KEY = 'rag-copilot-registered-users'

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

function loadRegisteredUsers(): Record<string, { password: string; user: UserInfo }> {
  try {
    const data = localStorage.getItem(REGISTERED_USERS_KEY)
    return data ? JSON.parse(data) : {}
  } catch {
    return {}
  }
}

function persistRegisteredUsers(users: Record<string, { password: string; user: UserInfo }>) {
  try {
    localStorage.setItem(REGISTERED_USERS_KEY, JSON.stringify(users))
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

  /** 注册新用户，信息仅存储在客户端 localStorage */
  function register(username: string, password: string): boolean {
    const registered = loadRegisteredUsers()
    if (registered[username]) {
      return false // 用户名已存在
    }
    const newUser: UserInfo = {
      id: 'user-' + Date.now(),
      username,
      role: 'user',
      apiCallCount: 0,
      createdAt: new Date().toISOString(),
    }
    registered[username] = { password, user: newUser }
    persistRegisteredUsers(registered)

    // 注册后自动登录
    setToken('local-jwt-' + newUser.id)
    user.value = newUser
    showLoginModal.value = false
    return true
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
        // Fallback to registered users in localStorage
        const registered = loadRegisteredUsers()
        const regUser = registered[username]
        if (regUser && regUser.password === password) {
          setToken('local-jwt-' + regUser.user.id)
          user.value = regUser.user
          showLoginModal.value = false
        } else {
          throw e
        }
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
    // User auth
    token,
    user,
    showLoginModal,
    authLoading,
    isLoggedIn,
    isAdmin,
    register,
    login,
    refreshUser,
    logout,
    openLoginModal,
    closeLoginModal,
  }
})
