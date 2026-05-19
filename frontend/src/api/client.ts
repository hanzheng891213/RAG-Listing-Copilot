import axios from 'axios'
import { message } from 'ant-design-vue'

const client = axios.create({
  baseURL: '/api/v1',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' }
})

client.interceptors.response.use(
  res => res,
  error => {
    const msg = error.response?.data?.detail || error.message || '请求失败'
    message.error(msg)
    return Promise.reject(error)
  }
)

export default client
