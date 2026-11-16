import client from './client'

/**
 * A model service provider.
 *
 * Model catalogues are deliberately not surfaced: provider-side model names age
 * quickly and the shipped directory is always behind. The manager keeps one
 * free-form model name per provider instead, with no default.
 */
export interface ModelProvider {
  id: string
  name: string
  baseUrl: string
  signupUrl: string
}

/**
 * The caller's stored configuration for one provider.
 *
 * There is no plaintext key here by design: the server only returns `hasKey`
 * and the last four characters. `apiKey` is write-only and only sent when the
 * user types a new key.
 */
export interface ProviderConfig {
  providerId: string
  providerName?: string
  /** Model name sent as `model`; typed by the user from the provider's docs. */
  activeModel: string
  temperature: number
  maxTokens: number
  /** Endpoint override; empty means "use the directory value". */
  baseUrl?: string
  hasKey: boolean
  keyLast4: string
  updatedAt?: string
}

export interface ModelConfigsResponse {
  providers: ModelProvider[]
  configs: ProviderConfig[]
  activeProviderId: string
}

export interface SaveModelConfigPayload {
  providerId: string
  /** Omit to keep the stored key; empty string removes it. */
  apiKey?: string
  model: string
  providerName?: string
  baseUrl?: string
  temperature?: number
  maxTokens?: number
}

interface RawProviderConfig {
  providerId: string
  providerName?: string
  baseUrl?: string
  model?: string
  temperature?: number
  maxTokens?: number
  hasKey?: boolean
  keyLast4?: string
  updatedAt?: string
}

export function toProviderConfig(raw: RawProviderConfig): ProviderConfig {
  return {
    providerId: String(raw?.providerId ?? ''),
    providerName: raw?.providerName ? String(raw.providerName) : undefined,
    activeModel: String(raw?.model ?? ''),
    temperature: Number.isFinite(Number(raw?.temperature)) ? Number(raw.temperature) : 0.7,
    maxTokens: Number.isFinite(Number(raw?.maxTokens)) ? Number(raw.maxTokens) : 4096,
    baseUrl: raw?.baseUrl ? String(raw.baseUrl) : '',
    hasKey: Boolean(raw?.hasKey),
    keyLast4: String(raw?.keyLast4 ?? ''),
    updatedAt: raw?.updatedAt ? String(raw.updatedAt) : '',
  }
}

/**
 * One request returns the provider directory, this user's configs and the
 * active provider. The Model Manager page used to make two calls.
 */
export async function getModelConfigs(): Promise<ModelConfigsResponse> {
  const body = await client.get('/models/configs') as any
  return {
    providers: Array.isArray(body?.providers) ? body.providers : [],
    configs: Array.isArray(body?.configs) ? body.configs.map(toProviderConfig) : [],
    activeProviderId: String(body?.activeProviderId ?? ''),
  }
}

export function saveModelConfig(payload: SaveModelConfigPayload): Promise<{ config: ProviderConfig }> {
  const body: Record<string, unknown> = {
    model: payload.model,
    providerName: payload.providerName,
    baseUrl: payload.baseUrl,
    temperature: payload.temperature,
    maxTokens: payload.maxTokens,
  }
  if (payload.apiKey !== undefined) body.apiKey = payload.apiKey
  return client.put(`/models/configs/${encodeURIComponent(payload.providerId)}`, body) as any
}

export function deleteModelConfig(providerId: string): Promise<{ ok: boolean }> {
  return client.delete(`/models/configs/${encodeURIComponent(providerId)}`) as any
}

export function deleteModelKey(providerId: string): Promise<{ ok: boolean }> {
  return client.delete(`/models/configs/${encodeURIComponent(providerId)}/key`) as any
}

export function setActiveModel(providerId: string): Promise<{ activeProviderId: string }> {
  return client.post('/models/active', { providerId }) as any
}

// Kept for older callers; the configs endpoint is preferred.
export function getProviders(): Promise<{ providers: ModelProvider[] }> {
  return client.get('/models/providers') as any
}

// Get usage stats (server-side tracked from API calls)
export function getUsageStats(days?: number): Promise<UsageStats> {
  return client.get('/models/usage/stats', { params: { days } }) as any
}

export interface UsageBreakdown {
  key: string
  name: string
  providerId: string
  modelId: string
  cost: number
  promptTokens: number
  completionTokens: number
  tokens: number
  calls: number
}

export interface UsageStats {
  totalCost: number
  totalTokens: number
  totalPromptTokens: number
  totalCompletionTokens: number
  totalCalls: number
  byProvider: UsageBreakdown[]
  /** Usage split per model — several models can share one provider. */
  byModel: UsageBreakdown[]
  daily: { date: string; tokens: number; cost: number }[]
}

/**
 * Usage stats are rendered directly with numeric methods, so a malformed or
 * empty payload used to throw inside the render function (`totalCost` is not a
 * number → `.toFixed` on undefined). Every field is coerced here instead.
 */
export function emptyUsageStats(): UsageStats {
  return {
    totalCost: 0,
    totalTokens: 0,
    totalPromptTokens: 0,
    totalCompletionTokens: 0,
    totalCalls: 0,
    byProvider: [],
    byModel: [],
    daily: [],
  }
}

function toNumber(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

export function normaliseUsageStats(raw: unknown): UsageStats {
  const source = (raw ?? {}) as Record<string, unknown>
  const breakdown = (value: unknown): UsageBreakdown[] =>
    (Array.isArray(value) ? value : []).map((entry) => {
      const item = (entry ?? {}) as Record<string, unknown>
      return {
        key: String(item.key ?? ''),
        name: String(item.name ?? item.key ?? ''),
        providerId: String(item.providerId ?? ''),
        modelId: String(item.modelId ?? ''),
        cost: toNumber(item.cost),
        promptTokens: toNumber(item.promptTokens),
        completionTokens: toNumber(item.completionTokens),
        tokens: toNumber(item.tokens),
        calls: toNumber(item.calls),
      }
    })

  return {
    totalCost: toNumber(source.totalCost),
    totalTokens: toNumber(source.totalTokens),
    totalPromptTokens: toNumber(source.totalPromptTokens),
    totalCompletionTokens: toNumber(source.totalCompletionTokens),
    totalCalls: toNumber(source.totalCalls),
    byProvider: breakdown(source.byProvider),
    byModel: breakdown(source.byModel),
    daily: (Array.isArray(source.daily) ? source.daily : []).map((entry) => {
      const item = (entry ?? {}) as Record<string, unknown>
      return {
        date: String(item.date ?? ''),
        tokens: toNumber(item.tokens),
        cost: toNumber(item.cost),
      }
    }),
  }
}
