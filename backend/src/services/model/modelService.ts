import type { ModelProvider, ModelInfo, UsageRecord, UsageStats, UsageBreakdown } from '../../types/model.js'
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

/**
 * Price per 1M tokens in RMB, keyed by `${providerId}:${modelId}`.
 *
 * Providers do not expose their prices over the API, so this table is
 * maintained by hand — check the provider's pricing page and update it when
 * rates change. Anything not listed here falls back to PROVIDER_PRICING.
 *
 * The rate is applied when the record is written and the resulting cost is
 * stored on the row, so editing this table never rewrites past usage.
 */
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'deepseek:deepseek-v4-flash': { input: 1, output: 2 },
  'deepseek:deepseek-reasoner': { input: 4, output: 16 },
  'qwen:qwen-plus': { input: 0.8, output: 2 },
  'qwen:qwen-max': { input: 2.4, output: 9.6 },
}

/** Per-provider fallback for models without an explicit entry. */
const PROVIDER_PRICING: Record<string, { input: number; output: number }> = {
  deepseek: { input: 1, output: 2 },
  qwen: { input: 0.8, output: 2 },
  doubao: { input: 0.8, output: 2 },
  custom: { input: 0, output: 0 },
}

function priceFor(providerId: string, modelId: string): { input: number; output: number } {
  return (
    MODEL_PRICING[`${providerId}:${modelId}`] ??
    PROVIDER_PRICING[providerId] ??
    PROVIDER_PRICING.custom
  )
}

/**
 * D1 binding for durable usage storage, set per request by the Worker entry
 * point. Without it (Express dev) usage stays in memory for the process.
 */
let d1Binding: any = null

export function initModelService(env: any): void {
  d1Binding = env?.KNOWLEDGE_DB ?? null
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
    options?: { model?: string; temperature?: number; max_tokens?: number; disableThinking?: boolean },
  ): Promise<{ choices: Array<{ message: { content: string } }>; usage?: { prompt_tokens: number; completion_tokens: number } } | null> {
    const provider = BUILTIN_PROVIDERS.find((p) => p.id === providerId)
    if (!provider || !apiKey) return null

    // The resolved id is what gets recorded — falling back so usage is still
    // attributable when the caller left the model unspecified.
    const resolvedModel = options?.model || provider.models[0]?.id || 'default'

    const payload: Record<string, unknown> = {
      model: resolvedModel,
      messages,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.max_tokens ?? 4096,
    }
    // 推理模型（如 DSV4）会把 max_tokens 大量消耗在 reasoning 上导致输出截断，
    // 结构化任务直接禁用 thinking 得到即时的纯 JSON 输出
    if (options?.disableThinking) payload.thinking = { type: 'disabled' }

    const response = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
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
      await this.recordUsage(
        providerId,
        resolvedModel,
        data.usage.prompt_tokens,
        data.usage.completion_tokens,
      )
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
    options?: { model?: string; temperature?: number; max_tokens?: number; disableThinking?: boolean },
  ): AsyncGenerator<string, void, unknown> {
    const provider = BUILTIN_PROVIDERS.find((p) => p.id === providerId)
    if (!provider || !apiKey) return

    const resolvedModel = options?.model || provider.models[0]?.id || 'default'

    const payload: Record<string, unknown> = {
      model: resolvedModel,
      messages,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.max_tokens ?? 4096,
      stream: true,
      // OpenAI-compatible APIs only report token usage in a streamed response
      // when this is requested. Without it the final chunk carries no `usage`,
      // so the main generation path recorded nothing at all.
      stream_options: { include_usage: true },
    }
    if (options?.disableThinking) payload.thinking = { type: 'disabled' }

    const response = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
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
        await this.recordUsage(
          providerId,
          resolvedModel,
          streamUsage.prompt_tokens,
          streamUsage.completion_tokens,
        )
      }
    }
  }

  // ── Usage tracking ───────────────────────────────────────────────────

  /**
   * Persist one API call's usage. Never throws — a bookkeeping failure must not
   * take down the generation that produced it.
   */
  async recordUsage(
    providerId: string,
    modelId: string,
    promptTokens: number,
    completionTokens: number,
  ): Promise<void> {
    const pricing = priceFor(providerId, modelId)
    const cost =
      (promptTokens / 1_000_000) * pricing.input +
      (completionTokens / 1_000_000) * pricing.output

    const record: UsageRecord = {
      id: uuid(),
      date: new Date().toISOString(),
      providerId,
      modelId,
      promptTokens,
      completionTokens,
      cost,
    }

    if (d1Binding) {
      try {
        await d1Binding
          .prepare(
            `INSERT INTO usage_records (id, created_at, provider_id, model_id, prompt_tokens, completion_tokens, cost)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            record.id,
            record.date,
            record.providerId,
            record.modelId,
            record.promptTokens,
            record.completionTokens,
            record.cost,
          )
          .run()
        return
      } catch (err) {
        console.error('[modelService] Failed to persist usage, keeping it in memory:', err)
      }
    }

    this.usage.push(record)
  }

  async getUsageStats(days = 30): Promise<UsageStats> {
    const cutoff = new Date(Date.now() - days * 86_400_000).toISOString()

    interface Row {
      date: string
      providerId: string
      modelId: string
      promptTokens: number
      completionTokens: number
      cost: number
    }

    let rows: Row[]
    if (d1Binding) {
      const result = await d1Binding
        .prepare(
          `SELECT created_at, provider_id, model_id, prompt_tokens, completion_tokens, cost
           FROM usage_records WHERE created_at >= ? ORDER BY created_at`,
        )
        .bind(cutoff)
        .all()
      rows = (result.results ?? []).map((r: any) => ({
        date: r.created_at,
        providerId: r.provider_id,
        modelId: r.model_id ?? '',
        promptTokens: r.prompt_tokens ?? 0,
        completionTokens: r.completion_tokens ?? 0,
        cost: r.cost ?? 0,
      }))
    } else {
      rows = this.usage.filter((r) => r.date >= cutoff)
    }

    const providerNames = new Map(BUILTIN_PROVIDERS.map((p) => [p.id, p.name]))
    const modelNames = new Map(
      BUILTIN_PROVIDERS.flatMap((p) => p.models.map((m) => [`${p.id}:${m.id}`, m.name])),
    )

    interface Bucket {
      providerId: string
      modelId: string
      cost: number
      promptTokens: number
      completionTokens: number
      calls: number
    }
    const newBucket = (providerId: string, modelId = ''): Bucket => ({
      providerId,
      modelId,
      cost: 0,
      promptTokens: 0,
      completionTokens: 0,
      calls: 0,
    })

    const providerBuckets = new Map<string, Bucket>()
    const modelBuckets = new Map<string, Bucket>()
    const dailyMap = new Map<string, { tokens: number; cost: number }>()

    let totalCost = 0
    let totalPromptTokens = 0
    let totalCompletionTokens = 0

    for (const r of rows) {
      totalCost += r.cost
      totalPromptTokens += r.promptTokens
      totalCompletionTokens += r.completionTokens

      const provider = providerBuckets.get(r.providerId) ?? newBucket(r.providerId)
      provider.cost += r.cost
      provider.promptTokens += r.promptTokens
      provider.completionTokens += r.completionTokens
      provider.calls += 1
      providerBuckets.set(r.providerId, provider)

      const modelKey = `${r.providerId}:${r.modelId}`
      const model = modelBuckets.get(modelKey) ?? newBucket(r.providerId, r.modelId)
      model.cost += r.cost
      model.promptTokens += r.promptTokens
      model.completionTokens += r.completionTokens
      model.calls += 1
      modelBuckets.set(modelKey, model)

      const day = r.date.slice(0, 10)
      const dailyEntry = dailyMap.get(day) ?? { tokens: 0, cost: 0 }
      dailyEntry.tokens += r.promptTokens + r.completionTokens
      dailyEntry.cost += r.cost
      dailyMap.set(day, dailyEntry)
    }

    const round = (n: number) => Math.round(n * 10000) / 10000
    const toBreakdown = (b: Bucket, key: string, name: string): UsageBreakdown => ({
      key,
      name,
      providerId: b.providerId,
      modelId: b.modelId,
      cost: round(b.cost),
      promptTokens: b.promptTokens,
      completionTokens: b.completionTokens,
      tokens: b.promptTokens + b.completionTokens,
      calls: b.calls,
    })

    const byProvider = [...providerBuckets.values()]
      .map((b) => toBreakdown(b, b.providerId, providerNames.get(b.providerId) || b.providerId))
      .sort((a, b) => b.cost - a.cost)

    const byModel = [...modelBuckets.entries()]
      .map(([key, b]) => {
        const providerName = providerNames.get(b.providerId) || b.providerId
        const modelName = modelNames.get(key) || b.modelId || 'unknown model'
        return toBreakdown(b, key, `${providerName} · ${modelName}`)
      })
      .sort((a, b) => b.cost - a.cost)

    const daily = [...dailyMap.entries()]
      .map(([date, v]) => ({ date, tokens: v.tokens, cost: round(v.cost) }))
      .sort((a, b) => a.date.localeCompare(b.date))

    return {
      totalCost: round(totalCost),
      totalTokens: totalPromptTokens + totalCompletionTokens,
      totalPromptTokens,
      totalCompletionTokens,
      totalCalls: rows.length,
      byProvider,
      byModel,
      daily,
    }
  }
}

export const modelService = new ModelService()
