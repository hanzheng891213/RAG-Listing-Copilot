import type { ModelProvider, ModelInfo, UsageRecord, UsageStats } from '../../types/model.js'
import { v4 as uuid } from 'uuid'

// ─── Built-in provider definitions (no api keys here!) ────────────────
const BUILTIN_PROVIDERS: ModelProvider[] = [
  {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    signupUrl: 'https://platform.deepseek.com/api_keys',
    models: [
      { id: 'deepseek-v4-flash', name: 'DeepSeek-V4 Flash' },
      { id: 'deepseek-reasoner', name: 'DeepSeek-R1' },
    ],
  },
  {
    id: 'qwen',
    name: '通义千问',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    signupUrl: 'https://tongyi.aliyun.com',
    models: [
      { id: 'qwen3.5-35b-a3b', name: 'qwen3.5-35b-a3b' },
      { id: 'qwen-plus', name: 'Qwen Plus' },
      { id: 'qwen-max', name: 'Qwen Max' },
    ],
  },
  {
    id: 'doubao',
    name: '豆包',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    signupUrl: 'https://console.volcengine.com/ark/region:ark+cn-beijing/endpoint',
    models: [
      { id: 'doubao-seed-2-0-mini-260428', name: 'Doubao Seed 2-0-260428 Mini' },
      { id: 'doubao-pro-256k', name: 'Doubao Pro 256K' },
    ],
  },
  {
    id: 'custom',
    name: '自定义',
    baseUrl: '',
    signupUrl: '',
    models: [{ id: 'custom-model', name: 'Custom Model' }],
  },
]

const PRICING: Record<string, { input: number; output: number }> = {
  deepseek: { input: 0.14, output: 0.28 },
  qwen: { input: 0.08, output: 0.16 },
  doubao: { input: 0.08, output: 0.16 },
  custom: { input: 0, output: 0 },
}

class ModelService {
  private usage: UsageRecord[] = []

  constructor() {
    // Usage tracking is in-memory only (no file persistence in Workers)
  }

  getBuiltinProviders(): ModelProvider[] {
    return BUILTIN_PROVIDERS
  }

  /**
   * Get a provider's base URL by ID.
   */
  getProviderBaseUrl(providerId: string): string | undefined {
    return BUILTIN_PROVIDERS.find((p) => p.id === providerId)?.baseUrl
  }

  // ── AI API calls (apiKey passed in, NOT stored) ──────────────────────

  /**
   * Call a provider's chat/completions API.
   * apiKey is passed by the caller and NEVER persisted.
   */
  async callProviderAPI(
    providerId: string,
    apiKey: string,
    messages: Array<{ role: string; content: string }>,
    options?: { model?: string; temperature?: number; max_tokens?: number },
  ): Promise<{ choices: Array<{ message: { content: string } }>; usage?: { prompt_tokens: number; completion_tokens: number } } | null> {
    const provider = BUILTIN_PROVIDERS.find((p) => p.id === providerId)
    if (!provider || !apiKey) return null

    const response = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: options?.model || provider.models[0]?.id || 'default',
        messages,
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.max_tokens ?? 4096,
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      console.error(`[modelService] Provider "${providerId}" error:`, response.status, errText)
      return null
    }

    const data = await response.json() as {
      choices: Array<{ message: { content: string } }>
      usage?: { prompt_tokens: number; completion_tokens: number }
    }

    if (data.usage) {
      this.recordUsage(providerId, options?.model || '', data.usage.prompt_tokens, data.usage.completion_tokens)
    }

    return data
  }

  /**
   * Call a provider's chat/completions API with streaming.
   * apiKey is passed by the caller and NEVER persisted.
   * Returns an async generator yielding partial content chunks.
   */
  async *callProviderAPIStream(
    providerId: string,
    apiKey: string,
    messages: Array<{ role: string; content: string }>,
    options?: { model?: string; temperature?: number; max_tokens?: number },
  ): AsyncGenerator<string, void, unknown> {
    const provider = BUILTIN_PROVIDERS.find((p) => p.id === providerId)
    if (!provider || !apiKey) return

    const response = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: options?.model || provider.models[0]?.id || 'default',
        messages,
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.max_tokens ?? 4096,
        stream: true,
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      console.error(`[modelService] Provider "${providerId}" stream error:`, response.status, errText)
      return
    }

    const reader = response.body?.getReader()
    if (!reader) return

    const decoder = new TextDecoder()
    let buffer = ''
    let streamUsage: { prompt_tokens: number; completion_tokens: number } | null = null

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || !trimmed.startsWith('data: ')) continue
          const data = trimmed.slice(6)
          if (data === '[DONE]') return

          try {
            const parsed = JSON.parse(data)
            const content = parsed.choices?.[0]?.delta?.content || ''
            if (content) yield content
            // capture usage from final streaming chunk (OpenAI-compatible APIs)
            if (parsed.usage) {
              streamUsage = {
                prompt_tokens: parsed.usage.prompt_tokens || 0,
                completion_tokens: parsed.usage.completion_tokens || 0,
              }
            }
          } catch {
            // skip unparseable chunks
          }
        }
      }
    } finally {
      reader.releaseLock()
      if (streamUsage) {
        this.recordUsage(providerId, options?.model || '', streamUsage.prompt_tokens, streamUsage.completion_tokens)
      }
    }
  }

  // ── Usage tracking ───────────────────────────────────────────────────

  recordUsage(providerId: string, modelId: string, promptTokens: number, completionTokens: number): void {
    const pricing = PRICING[providerId] || PRICING.custom
    const cost =
      (promptTokens / 1_000_000) * pricing.input +
      (completionTokens / 1_000_000) * pricing.output

    this.usage.push({
      id: uuid(),
      date: new Date().toISOString(),
      providerId,
      modelId,
      promptTokens,
      completionTokens,
      cost,
    })
  }

  getUsageStats(days = 30): UsageStats {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - days)
    const filtered = this.usage.filter((r) => new Date(r.date) >= cutoff)

    const totalCost = filtered.reduce((s, r) => s + r.cost, 0)
    const totalTokens = filtered.reduce((s, r) => s + r.promptTokens + r.completionTokens, 0)
    const totalCalls = filtered.length

    const providerMap = new Map<string, { cost: number; tokens: number }>()
    const providerNames = new Map(BUILTIN_PROVIDERS.map((p) => [p.id, p.name]))

    for (const r of filtered) {
      const prev = providerMap.get(r.providerId) || { cost: 0, tokens: 0 }
      prev.cost += r.cost
      prev.tokens += r.promptTokens + r.completionTokens
      providerMap.set(r.providerId, prev)
    }

    const byProvider = Array.from(providerMap.entries()).map(([providerId, v]) => ({
      providerId,
      providerName: providerNames.get(providerId) || providerId,
      cost: Math.round(v.cost * 10000) / 10000,
      tokens: v.tokens,
    }))

    const dailyMap = new Map<string, { tokens: number; cost: number }>()
    for (const r of filtered) {
      const day = r.date.slice(0, 10)
      const prev = dailyMap.get(day) || { tokens: 0, cost: 0 }
      prev.tokens += r.promptTokens + r.completionTokens
      prev.cost += r.cost
      dailyMap.set(day, prev)
    }

    const daily = Array.from(dailyMap.entries())
      .map(([date, v]) => ({ date, tokens: v.tokens, cost: Math.round(v.cost * 10000) / 10000 }))
      .sort((a, b) => a.date.localeCompare(b.date))

    return {
      totalCost: Math.round(totalCost * 10000) / 10000,
      totalTokens,
      totalCalls,
      byProvider,
      daily,
    }
  }
}

export const modelService = new ModelService()
