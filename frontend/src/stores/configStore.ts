import { defineStore } from 'pinia'
import { ref } from 'vue'
import client from '@/api/client'
import type { LLMProvider, HealthStatus } from '@/types/config'

export const useConfigStore = defineStore('config', () => {
  const providers = ref<LLMProvider[]>([])
  const health = ref<HealthStatus | null>(null)
  const loading = ref(false)

  async function fetchProviders() {
    loading.value = true
    try {
      const res = await client.get<LLMProvider[]>('/config/llm-providers')
      providers.value = res.data
    } finally {
      loading.value = false
    }
  }

  async function createProvider(data: Partial<LLMProvider>) {
    const res = await client.post<LLMProvider>('/config/llm-providers', data)
    providers.value.push(res.data)
    return res.data
  }

  async function updateProvider(id: number, data: Partial<LLMProvider>) {
    const res = await client.put<LLMProvider>(`/config/llm-providers/${id}`, data)
    const idx = providers.value.findIndex(p => p.id === id)
    if (idx !== -1) providers.value[idx] = res.data
    return res.data
  }

  async function checkHealth() {
    const res = await client.get<HealthStatus>('/config/health')
    health.value = res.data
  }

  return {
    providers, health, loading,
    fetchProviders, createProvider, updateProvider, checkHealth
  }
})
