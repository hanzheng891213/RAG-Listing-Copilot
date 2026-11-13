import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  getProviders,
  type ModelProvider,
  type ProviderConfig,
} from '@/api/models'

const ACTIVE_PROVIDER_KEY = 'rag-copilot-active-provider'
const CONFIGS_STORAGE_KEY = 'rag-copilot-provider-configs'
const CUSTOM_PROVIDERS_KEY = 'rag-copilot-custom-providers'

// ── localStorage helpers ──────────────────────────────────────────────

function loadConfigsFromStorage(): ProviderConfig[] {
  try {
    const raw = localStorage.getItem(CONFIGS_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    // Older builds kept a per-provider model catalogue. Providers now carry a
    // single free-form model id, so the legacy list is dropped on read.
    return parsed.map((entry: Record<string, unknown> | null) => {
      const { models: _legacyModels, ...rest } = entry ?? {}
      return rest as unknown as ProviderConfig
    })
  } catch {
    return []
  }
}

function saveConfigsToStorage(configs: ProviderConfig[]): void {
  try {
    localStorage.setItem(CONFIGS_STORAGE_KEY, JSON.stringify(configs))
  } catch { /* storage full or unavailable */ }
}

function loadCustomProviders(): ModelProvider[] {
  try {
    const raw = localStorage.getItem(CUSTOM_PROVIDERS_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveCustomProviders(providers: ModelProvider[]): void {
  try {
    localStorage.setItem(CUSTOM_PROVIDERS_KEY, JSON.stringify(providers))
  } catch { /* ignore */ }
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

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// ── Store ─────────────────────────────────────────────────────────────

export const useModelStore = defineStore('model', () => {
  /** Providers published by the backend (built-in directory). */
  const directory = ref<ModelProvider[]>([])
  /** Providers the admin declared locally (custom endpoints / relays). */
  const customProviders = ref<ModelProvider[]>(loadCustomProviders())
  const configs = ref<ProviderConfig[]>(loadConfigsFromStorage())
  const activeProviderId = ref<string>(loadActiveProviderFromStorage())
  const loaded = ref(false)

  /** Built-in + user-declared providers, in display order. */
  const providers = computed<ModelProvider[]>(() => [
    ...directory.value,
    ...customProviders.value,
  ])

  const configuredProviders = computed(() =>
    configs.value.filter((c) => c.apiKey),
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
    if (!activeConfig.value) return ''
    return activeConfig.value.activeModel
  })

  function maskKey(key: string): string {
    if (!key) return ''
    if (key.length <= 12) return key.slice(0, 4) + '****'
    return key.slice(0, 7) + '****' + key.slice(-4)
  }

  function providerOf(providerId: string): ModelProvider | undefined {
    return providers.value.find((p) => p.id === providerId)
  }

  function baseUrlFor(providerId: string): string {
    const override = configs.value.find((c) => c.providerId === providerId)?.baseUrl
    return override || providerOf(providerId)?.baseUrl || ''
  }

  function saveCustomToStorage(): void {
    saveCustomProviders(customProviders.value)
  }

  /**
   * Load the provider directory from the backend. Configs and custom providers
   * stay local: API keys never leave the browser.
   */
  async function loadConfigs() {
    try {
      const res = await getProviders()
      directory.value = Array.isArray(res?.providers) ? res.providers : []
      loaded.value = true
      if (
        activeProviderId.value &&
        !configs.value.find((c) => c.providerId === activeProviderId.value && c.apiKey)
      ) {
        activeProviderId.value = configuredProviders.value[0]?.providerId || ''
      }
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
      configs.value[idx] = { ...configs.value[idx], ...config }
    } else {
      configs.value.push(config)
    }
    saveConfigsToStorage(configs.value)
  }

  /** Removes a config row entirely (used when deleting a custom provider). */
  function removeProviderConfig(providerId: string) {
    configs.value = configs.value.filter((c) => c.providerId !== providerId)
    saveConfigsToStorage(configs.value)
    if (activeProviderId.value === providerId) {
      activeProviderId.value = configuredProviders.value[0]?.providerId || ''
      saveActiveProviderToStorage(activeProviderId.value)
    }
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

  /**
   * Declares a provider the backend directory does not know about (a relay, a
   * self-hosted OpenAI-compatible endpoint, …).
   */
  function addProvider(input: {
    name: string
    baseUrl: string
  }): string | null {
    const name = input.name.trim()
    if (!name) return null
    const base = slugify(name) || `custom-${Date.now().toString(36)}`
    let id = base
    let suffix = 2
    while (providers.value.some((p) => p.id === id)) {
      id = `${base}-${suffix}`
      suffix += 1
    }
    customProviders.value = [
      ...customProviders.value,
      {
        id,
        name,
        baseUrl: input.baseUrl.trim(),
        signupUrl: '',
      },
    ]
    saveCustomToStorage()
    updateProviderConfig({
      providerId: id,
      apiKey: '',
      activeModel: '',
      temperature: 0.7,
      maxTokens: 4096,
      baseUrl: input.baseUrl.trim(),
    })
    return id
  }

  /** Deletes a locally declared provider (built-ins are not removable). */
  function removeProvider(providerId: string): boolean {
    if (!customProviders.value.some((p) => p.id === providerId)) return false
    customProviders.value = customProviders.value.filter((p) => p.id !== providerId)
    saveCustomToStorage()
    removeProviderConfig(providerId)
    return true
  }

  function isCustomProvider(providerId: string): boolean {
    return customProviders.value.some((p) => p.id === providerId)
  }

  function setActiveProvider(providerId: string) {
    activeProviderId.value = providerId
    saveActiveProviderToStorage(providerId)
  }

  function getConfig(providerId: string): ProviderConfig | undefined {
    return configs.value.find((c) => c.providerId === providerId)
  }

  return {
    directory,
    customProviders,
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
    removeProviderConfig,
    clearProviderKey,
    addProvider,
    removeProvider,
    isCustomProvider,
    baseUrlFor,
    providerOf,
    getConfig,
    maskKey,
  }
})
