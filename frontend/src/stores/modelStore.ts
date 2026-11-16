import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  getProviders,
  type ModelProvider,
  type ProviderConfig,
} from '@/api/models'

const ACTIVE_PROVIDER_KEY = 'rag-copilot-active-provider'
const ACTIVE_PROVIDER_PREFIX = 'rag-copilot-active-provider:'
const CONFIGS_PREFIX = 'rag-copilot-provider-configs:'
/** Pre-personalisation builds kept every user's config in one shared record. */
const LEGACY_CONFIGS_KEY = 'rag-copilot-provider-configs'
const CUSTOM_PROVIDERS_KEY = 'rag-copilot-custom-providers'
const GUEST_SCOPE = 'guest'

/**
 * Keys are namespaced by login identity, so one browser can hold several
 * accounts without leaking a key or a model choice between them. Before login
 * (or for a guest) the `guest` scope is used.
 */
function scopeOf(userId: string): string {
  const trimmed = (userId ?? '').trim()
  if (!trimmed) return GUEST_SCOPE
  return trimmed.replace(/[^A-Za-z0-9_-]+/g, '_') || GUEST_SCOPE
}

function configsKey(scope: string): string {
  return `${CONFIGS_PREFIX}${scope}`
}

function activeProviderKey(scope: string): string {
  return `${ACTIVE_PROVIDER_PREFIX}${scope}`
}

// ── localStorage helpers ──────────────────────────────────────────────

function parseConfigs(raw: string | null): ProviderConfig[] {
  if (!raw) return []
  try {
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

/**
 * Load one identity's configs. The first logged-in account takes over the
 * pre-personalisation record; later accounts start clean (they must never
 * inherit another user's API key).
 */
function loadConfigsFromStorage(scope: string): ProviderConfig[] {
  try {
    const own = parseConfigs(localStorage.getItem(configsKey(scope)))
    if (own.length > 0 || scope === GUEST_SCOPE) return own

    const legacy = parseConfigs(localStorage.getItem(LEGACY_CONFIGS_KEY))
    if (legacy.length === 0) return []
    localStorage.setItem(configsKey(scope), JSON.stringify(legacy))
    localStorage.removeItem(LEGACY_CONFIGS_KEY)
    return legacy
  } catch {
    return []
  }
}

function saveConfigsToStorage(configs: ProviderConfig[], scope: string): void {
  try {
    localStorage.setItem(configsKey(scope), JSON.stringify(configs))
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

function loadActiveProviderFromStorage(scope: string): string {
  try {
    return localStorage.getItem(activeProviderKey(scope)) || ''
  } catch {
    return ''
  }
}

/**
 * Persist the per-user choice, and mirror it to the legacy key: the SSE client
 * still reads `X-Active-Provider` from that key, and the header is only a hint.
 */
function saveActiveProviderToStorage(id: string, scope: string): void {
  try {
    localStorage.setItem(activeProviderKey(scope), id)
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
  /** Storage scope of the currently bound login (user id, or `guest`). */
  const scope = ref(GUEST_SCOPE)
  const configs = ref<ProviderConfig[]>(loadConfigsFromStorage(GUEST_SCOPE))
  const activeProviderId = ref<string>(loadActiveProviderFromStorage(GUEST_SCOPE))
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
        saveActiveProviderToStorage(activeProviderId.value, scope.value)
      }
    } catch {
      loaded.value = true
    }
  }

  /**
   * Switch the storage scope when the logged-in account changes.
   *
   * Each account keeps its own provider configs (and therefore its own API
   * key), so signing out and back in restores the key instead of asking for it
   * again. The first account also inherits the old global record; later
   * accounts never see it.
   */
  function bindUser(userId: string | null | undefined): void {
    const nextScope = scopeOf(userId ?? '')
    if (nextScope === scope.value) return

    scope.value = nextScope
    configs.value = loadConfigsFromStorage(nextScope)
    activeProviderId.value = loadActiveProviderFromStorage(nextScope)

    const activeUsable = configs.value.some(
      (config) => config.providerId === activeProviderId.value && config.apiKey,
    )
    if (!activeUsable) {
      activeProviderId.value = configs.value.find((config) => config.apiKey)?.providerId || ''
      saveActiveProviderToStorage(activeProviderId.value, nextScope)
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
    saveConfigsToStorage(configs.value, scope.value)
  }

  /** Removes a config row entirely (used when deleting a custom provider). */
  function removeProviderConfig(providerId: string) {
    configs.value = configs.value.filter((c) => c.providerId !== providerId)
    saveConfigsToStorage(configs.value, scope.value)
    if (activeProviderId.value === providerId) {
      activeProviderId.value = configuredProviders.value[0]?.providerId || ''
      saveActiveProviderToStorage(activeProviderId.value, scope.value)
    }
  }

  /**
   * Clear a provider's API key from localStorage.
   */
  function clearProviderKey(providerId: string) {
    const idx = configs.value.findIndex((c) => c.providerId === providerId)
    if (idx >= 0) {
      configs.value[idx].apiKey = ''
      saveConfigsToStorage(configs.value, scope.value)
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
    saveActiveProviderToStorage(providerId, scope.value)
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
    bindUser,
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
