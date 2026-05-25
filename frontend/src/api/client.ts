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
  } catch {
    // localStorage unavailable
  }
  return config
})

client.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const message = error.response?.data?.message || error.message || 'Request failed'
    console.error(`[API Error] ${message}`)
    return Promise.reject(error)
  },
)

export default client
