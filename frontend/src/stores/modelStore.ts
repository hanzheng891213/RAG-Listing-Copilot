import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { getProviders, type ModelProvider, type ProviderConfig } from '@/api/models'

const ACTIVE_PROVIDER_KEY = 'rag-copilot-active-provider'

export const useModelStore = defineStore('model', () => {
  const providers = ref<ModelProvider[]>([])
  const configs = ref<ProviderConfig[]>([])
  const activeProviderId = ref<string>('')
  const loaded = ref(false)

  const configuredProviders = computed(() =>
    configs.value.filter((c) => c.apiKey && c.providerId !== 'custom'),
  )

  const hasAnyConfigured = computed(() => configuredProviders.value.length > 0)

  const activeConfig = computed(() => {
    if (activeProviderId.value) {
      const found = configs.value.find((c) => c.providerId === activeProviderId.value && c.apiKey)
      if (found) return found
    }
    return configuredProviders.value[0] || null
  })

  const activeProvider = computed(() => {
    if (!activeConfig.value) return null
    return providers.value.find((p) => p.id === activeConfig.value!.providerId) || null
  })

  const activeModelName = computed(() => {
    if (!activeProvider.value || !activeConfig.value) return ''
    const model = activeProvider.value.models.find((m) => m.id === activeConfig.value!.activeModel)
    return model?.name || activeConfig.value.activeModel
  })

  function maskKey(key: string): string {
    if (!key) return ''
    if (key.length <= 12) return key.slice(0, 4) + '****'
    return key.slice(0, 7) + '****' + key.slice(-4)
  }

  async function loadConfigs() {
    try {
      const res = await getProviders()
      providers.value = res.providers
      configs.value = res.configs

      const saved = localStorage.getItem(ACTIVE_PROVIDER_KEY)
      if (saved && configs.value.find((c) => c.providerId === saved && c.apiKey)) {
        activeProviderId.value = saved
      } else if (configuredProviders.value.length > 0) {
        activeProviderId.value = configuredProviders.value[0].providerId
      }
      loaded.value = true
    } catch {
      loaded.value = true
    }
  }

  function setActiveProvider(providerId: string) {
    activeProviderId.value = providerId
    try {
      localStorage.setItem(ACTIVE_PROVIDER_KEY, providerId)
    } catch { /* ignore */ }
  }

  function getMaskedKey(providerId: string): string {
    const cfg = configs.value.find((c) => c.providerId === providerId)
    return cfg?.apiKey || ''
  }

  return {
    providers,
    configs,
    activeProviderId,
    loaded,
    configuredProviders,
    hasAnyConfigured,
    activeConfig,
    activeProvider,
    activeModelName,
    loadConfigs,
    setActiveProvider,
    getMaskedKey,
    maskKey,
  }
})
