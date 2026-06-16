import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { getProviders, type ModelProvider, type ProviderConfig } from '@/api/models'

const ACTIVE_PROVIDER_KEY = 'rag-copilot-active-provider'
const CONFIGS_STORAGE_KEY = 'rag-copilot-provider-configs'

// ── localStorage helpers ──────────────────────────────────────────────

function loadConfigsFromStorage(): ProviderConfig[] {
  try {
    const raw = localStorage.getItem(CONFIGS_STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw)
  } catch {
    return []
  }
}

function saveConfigsToStorage(configs: ProviderConfig[]): void {
  try {
    localStorage.setItem(CONFIGS_STORAGE_KEY, JSON.stringify(configs))
  } catch { /* storage full or unavailable */ }
}

function loadActiveProviderFromStorage(): string {
  try {
    return localStorage.getItem(ACTIVE_PROVIDER_KEY) || ''
  } catch {
    return ''
  }
}

function saveActiveProviderToStorage(id: string): void {
  try {
    localStorage.setItem(ACTIVE_PROVIDER_KEY, id)
  } catch { /* ignore */ }
}

// ── Store ─────────────────────────────────────────────────────────────

export const useModelStore = defineStore('model', () => {
  const providers = ref<ModelProvider[]>([])
  const configs = ref<ProviderConfig[]>(loadConfigsFromStorage())
  const activeProviderId = ref<string>(loadActiveProviderFromStorage())
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

  /**
   * Load provider list from backend, configs from localStorage.
   * Keys NEVER leave the browser.
   */
  async function loadConfigs() {
    try {
      const res = await getProviders()
      providers.value = res.providers
      // configs are already loaded from localStorage in the ref init

      const saved = loadActiveProviderFromStorage()
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

  /**
   * Save provider config to localStorage (NOT to server).
   * Keys stay in the browser only.
   */
  function updateProviderConfig(config: ProviderConfig) {
    const idx = configs.value.findIndex((c) => c.providerId === config.providerId)
    if (idx >= 0) {
      configs.value[idx] = config
    } else {
      configs.value.push(config)
    }
    saveConfigsToStorage(configs.value)
  }

  /**
   * Clear a provider's API key from localStorage.
   */
  function clearProviderKey(providerId: string) {
    const idx = configs.value.findIndex((c) => c.providerId === providerId)
    if (idx >= 0) {
      configs.value[idx].apiKey = ''
      saveConfigsToStorage(configs.value)
    }
  }

  function setActiveProvider(providerId: string) {
    activeProviderId.value = providerId
    saveActiveProviderToStorage(providerId)
  }

  function getConfig(providerId: string): ProviderConfig | undefined {
    return configs.value.find((c) => c.providerId === providerId)
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
    updateProviderConfig,
    clearProviderKey,
    getConfig,
    maskKey,
  }
})
