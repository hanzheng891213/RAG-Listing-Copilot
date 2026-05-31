import axios from 'axios'

const STORAGE_KEY = 'rag-copilot-api-key'

const client = axios.create({
  baseURL: 'http://localhost:3001/api',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
})

client.interceptors.request.use((config) => {
  try {
    const apiKey = localStorage.getItem(STORAGE_KEY)
    if (apiKey) {
      config.headers['X-DeepSeek-API-Key'] = apiKey
    }
    const token = localStorage.getItem('rag-copilot-token')
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`
    }
  } catch {
    // localStorage unavailable
  }
  return config
})

client.interceptors.response.use(
  (response) => response,
  async (error) => {
    // On 401, clear the stored token so the user is prompted to log in again
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
    const message = error.response?.data?.message || error.message || 'Request failed'
    console.error(`[API Error] ${message}`)
    return Promise.reject(error)
  },
)

export default client
