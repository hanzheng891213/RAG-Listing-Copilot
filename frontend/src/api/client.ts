import axios from 'axios'
import i18n from '@/locales'
import errors from '@/locales/errors'

const client = axios.create({
  baseURL: `${import.meta.env.VITE_API_BASE_URL || ''}/api`,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// ─── Request deduplication cache ──────────────────────────────────────
// 同一 GET 请求在飞行中时后续调用自动复用同一个 Promise
const inflightGetCache = new Map<string, Promise<any>>()
// 备份原始 get 方法
const _clientGet = client.get.bind(client)
client.get = function <T = any>(url: string, config?: any): Promise<T> {
  const key = `${url}:${JSON.stringify(config?.params || '')}`
  const existing = inflightGetCache.get(key)
  if (existing) return existing as Promise<T>
  const promise = _clientGet(url, config).finally(() => {
    inflightGetCache.delete(key)
  }) as Promise<T>
  inflightGetCache.set(key, promise)
  return promise
} as typeof client.get

// ─── Request interceptor: attach auth headers ─────────────────────────
client.interceptors.request.use((config) => {
  try {
    const token = localStorage.getItem('rag-copilot-token')
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`
    }
    const activeProvider = localStorage.getItem('rag-copilot-active-provider')
    if (activeProvider) {
      config.headers['X-Active-Provider'] = activeProvider
    }
  } catch {
    // localStorage unavailable
  }
  return config
})

// ─── Response interceptors ────────────────────────────────────────────

// Interceptor 1: 401 → clear token
client.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error?.response?.status === 401) {
      try {
        localStorage.removeItem('rag-copilot-token')
      } catch { /* ignore */ }
    }
    return Promise.reject(error)
  },
)

// Interceptor 2: error localization
client.interceptors.response.use(
  (response) => {
    return response.data
  },
  (error) => {
    const rawMessage = error.response?.data?.error || error.message || 'Request failed'
    const code = error.response?.data?.code

    // Map error code to localized message
    let message = rawMessage
    if (code) {
      try {
        const locale = i18n.global.locale.value as string
        if (errors[locale]?.[code]) {
          message = errors[locale][code]
        } else if (errors.en?.[code]) {
          message = errors.en[code]
        }
      } catch {
        // fallback to raw message
      }
    }

    console.error(`[API Error] ${message} (${code || 'no-code'})`)
    return Promise.reject(error)
  },
)

export default client
