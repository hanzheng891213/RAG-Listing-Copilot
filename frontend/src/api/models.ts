import client from './client'

/**
 * A model service provider.
 *
 * Model catalogues are deliberately not surfaced any more: provider-side model
 * names age quickly and the shipped directory is always behind. The manager
 * keeps one free-form model name per provider instead, with no default.
 */
export interface ModelProvider {
  id: string
  name: string
  baseUrl: string
  signupUrl: string
}

export interface ProviderConfig {
  providerId: string
  apiKey: string
  /** Model name sent as `model`; typed by the user from the provider's docs. */
  activeModel: string
  temperature: number
  maxTokens: number
  /** Endpoint override; empty means "use the directory value". */
  baseUrl?: string
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

export interface ProvidersResponse {
  providers: ModelProvider[]
}

// Get available providers (NO api keys returned — keys are stored in localStorage only)
export function getProviders(): Promise<ProvidersResponse> {
  return client.get('/models/providers') as any
}

// Get usage stats (server-side tracked from API calls)
export function getUsageStats(days?: number): Promise<UsageStats> {
  return client.get('/models/usage/stats', { params: { days } }) as any
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
