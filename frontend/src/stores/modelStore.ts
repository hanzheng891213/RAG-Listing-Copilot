import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import {
  deleteModelConfig,
  deleteModelKey,
  getModelConfigs,
  saveModelConfig,
  setActiveModel,
  toProviderConfig,
  type ModelProvider,
  type ProviderConfig,
} from '@/api/models'

/**
 * Per-account model configuration, backed by the server.
 *
 * The previous implementation kept API keys in localStorage, namespaced by user
 * id. That protected against accidental cross-account display but not against
 * XSS or a browser extension. Configs now live in D1, keys are AES-GCM
 * encrypted, and this store only ever holds `hasKey` + the last four digits.
 */

const GUEST_SCOPE = ''

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export const useModelStore = defineStore('model', () => {
  const directory = ref<ModelProvider[]>([])
  const configs = ref<ProviderConfig[]>([])
  const activeProviderId = ref('')
  const loaded = ref(false)
  const loading = ref(false)
  const scope = ref(GUEST_SCOPE)

  /** Built-ins plus the custom providers this account has declared. */
  const providers = computed<ModelProvider[]>(() => {
    const builtinIds = new Set(directory.value.map((provider) => provider.id))
    const custom = configs.value
      .filter((config) => config.providerName && !builtinIds.has(config.providerId))
      .map<ModelProvider>((config) => ({
        id: config.providerId,
        name: config.providerName ?? config.providerId,
        baseUrl: config.baseUrl ?? '',
        signupUrl: '',
      }))
    return [...directory.value, ...custom]
  })

  const configuredProviders = computed(() =>
    configs.value.filter((config) => config.hasKey && config.activeModel),
  )

  const hasAnyConfigured = computed(() => configuredProviders.value.length > 0)

  const activeConfig = computed(() => {
    if (activeProviderId.value) {
      const found = configs.value.find(
        (config) =>
          config.providerId === activeProviderId.value && config.hasKey && config.activeModel,
      )
      if (found) return found
    }
    return configuredProviders.value[0] || null
  })

  const activeProvider = computed(() => {
    if (!activeConfig.value) return null
    return providers.value.find((provider) => provider.id === activeConfig.value!.providerId) || null
  })

  const activeModelName = computed(() => activeConfig.value?.activeModel ?? '')

  function applyResponse(payload: {
    providers?: ModelProvider[]
    configs?: ProviderConfig[]
    activeProviderId?: string
  }): void {
    if (Array.isArray(payload.providers)) directory.value = payload.providers
    if (Array.isArray(payload.configs)) configs.value = payload.configs
    if (typeof payload.activeProviderId === 'string') {
      activeProviderId.value = payload.activeProviderId
    }
  }

  /** One request: directory + configs + active provider. */
  async function loadConfigs(): Promise<void> {
    if (!scope.value) {
      loaded.value = true
      return
    }
    const requestedScope = scope.value
    loading.value = true
    try {
      const response = await getModelConfigs()
      // The account switched while this was in flight: discard, never paint
      // another user's provider list.
      if (scope.value !== requestedScope) return
      applyResponse(response)
    } catch (error) {
      console.warn('[ModelStore] configs unavailable:', error)
    } finally {
      loading.value = false
      if (scope.value === requestedScope) loaded.value = true
    }
  }

  /**
   * Called by the auth store on every identity change. Clearing first means a
   * slow reload can never paint the previous account's provider list.
   */
  async function onUserChanged(userId: string | null | undefined): Promise<void> {
    const next = (userId ?? '').trim() || GUEST_SCOPE
    if (next === scope.value) return

    scope.value = next
    directory.value = []
    configs.value = []
    activeProviderId.value = ''
    loaded.value = false
    if (next) await loadConfigs()
  }

  function getConfig(providerId: string): ProviderConfig | undefined {
    return configs.value.find((config) => config.providerId === providerId)
  }

  function providerOf(providerId: string): ModelProvider | undefined {
    return providers.value.find((provider) => provider.id === providerId)
  }

  function baseUrlFor(providerId: string): string {
    const override = getConfig(providerId)?.baseUrl
    return override || providerOf(providerId)?.baseUrl || ''
  }

  function isCustomProvider(providerId: string): boolean {
    const config = getConfig(providerId)
    return Boolean(config?.providerName) && !directory.value.some((p) => p.id === providerId)
  }

  /** Masked display value; the plaintext key never leaves the server. */
  function maskKey(last4: string): string {
    return `••••••••${last4 || '****'}`
  }

  /**
   * Save one provider. `apiKey` undefined keeps the stored key; an empty string
   * removes it. The server enforces model/endpoint validation.
   */
  async function updateProviderConfig(input: {
    providerId: string
    apiKey?: string
    activeModel: string
    temperature: number
    maxTokens: number
    baseUrl?: string
    providerName?: string
  }): Promise<void> {
    const response = await saveModelConfig({
      providerId: input.providerId,
      apiKey: input.apiKey,
      model: input.activeModel,
      providerName: input.providerName,
      baseUrl: input.baseUrl,
      temperature: input.temperature,
      maxTokens: input.maxTokens,
    })

    const saved = (response as any)?.config
    if (saved) {
      const config = toProviderConfig(saved)
      const index = configs.value.findIndex((entry) => entry.providerId === config.providerId)
      if (index >= 0) configs.value[index] = config
      else configs.value.push(config)
    }
    const active = (response as any)?.activeProviderId
    if (typeof active === 'string') activeProviderId.value = active
  }

  /** Declares a provider the built-in directory does not know about. */
  async function addProvider(input: { name: string; baseUrl: string }): Promise<string | null> {
    const name = input.name.trim()
    if (!name) return null

    const base = slugify(name) || `custom-${Date.now().toString(36)}`
    let id = base
    let suffix = 2
    while (providers.value.some((provider) => provider.id === id)) {
      id = `${base}-${suffix}`
      suffix += 1
    }

    await saveModelConfig({
      providerId: id,
      providerName: name,
      baseUrl: input.baseUrl.trim(),
      model: '',
      temperature: 0.7,
      maxTokens: 4096,
    })
    await loadConfigs()
    return id
  }

  async function removeProvider(providerId: string): Promise<boolean> {
    if (!isCustomProvider(providerId)) return false
    await deleteModelConfig(providerId)
    configs.value = configs.value.filter((config) => config.providerId !== providerId)
    if (activeProviderId.value === providerId) activeProviderId.value = ''
    return true
  }

  async function clearProviderKey(providerId: string): Promise<void> {
    await deleteModelKey(providerId)
    const config = getConfig(providerId)
    if (config) {
      config.hasKey = false
      config.keyLast4 = ''
    }
    if (activeProviderId.value === providerId) activeProviderId.value = ''
  }

  async function setActiveProvider(providerId: string): Promise<void> {
    await setActiveModel(providerId)
    activeProviderId.value = providerId
  }

  return {
    directory,
    providers,
    configs,
    activeProviderId,
    loaded,
    loading,
    configuredProviders,
    hasAnyConfigured,
    activeConfig,
    activeProvider,
    activeModelName,
    loadConfigs,
    onUserChanged,
    getConfig,
    providerOf,
    baseUrlFor,
    isCustomProvider,
    maskKey,
    updateProviderConfig,
    addProvider,
    removeProvider,
    clearProviderKey,
    setActiveProvider,
  }
})
