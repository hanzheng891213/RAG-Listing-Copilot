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

client.interceptors.response.use(
  (response) => response,
  async (error) => {
    // On 401, clear the stored token
    if (error.response?.status === 401) {
      try {
        localStorage.removeItem('rag-copilot-token')
      } catch { /* ignore */ }
    }
    return Promise.reject(error)
  },
)

client.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const code = error.response?.data?.code
    const rawMessage = error.response?.data?.error || error.message || 'Request failed'

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
