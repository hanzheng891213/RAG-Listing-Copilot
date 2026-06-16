import type { ModelProvider, ModelInfo, ProviderConfig, UsageRecord, UsageStats } from '../../types/model.js'
import { v4 as uuid } from 'uuid'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.resolve(__dirname, '../../../data')
const CONFIG_FILE = path.join(DATA_DIR, 'provider-configs.json')

function maskKey(key: string): string {
  if (!key) return ''
  if (key.length <= 12) return key.slice(0, 4) + '****'
  return key.slice(0, 7) + '****' + key.slice(-4)
}

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

// Snapshot default model IDs before any custom models are added
const DEFAULT_MODEL_IDS: Record<string, Set<string>> = {}
for (const p of BUILTIN_PROVIDERS) {
  DEFAULT_MODEL_IDS[p.id] = new Set(p.models.map((m) => m.id))
}

const PRICING: Record<string, { input: number; output: number }> = {
  deepseek: { input: 0.14, output: 0.28 },
  qwen: { input: 0.08, output: 0.16 },
  doubao: { input: 0.08, output: 0.16 },
custom: { input: 0, output: 0 },
}

const defaultConfig = (id: string): ProviderConfig => ({
  providerId: id,
  apiKey: '',
  activeModel: BUILTIN_PROVIDERS.find((p) => p.id === id)?.models[0]?.id || '',
  temperature: 0.7,
  maxTokens: 4096,
})

class ModelService {
  private configs = new Map<string, ProviderConfig>()
  private usage: UsageRecord[] = []

  constructor() {
    for (const p of BUILTIN_PROVIDERS) {
      this.configs.set(p.id, defaultConfig(p.id))
    }
    this.loadFromFile()
  }

  private loadFromFile(): void {
    try {
      if (!fs.existsSync(CONFIG_FILE)) return
      const raw = fs.readFileSync(CONFIG_FILE, 'utf-8')
      const data = JSON.parse(raw)
      if (data.configs) {
        for (const [id, cfg] of Object.entries(data.configs)) {
          const c = cfg as ProviderConfig
          if (this.configs.has(id)) {
            this.configs.set(id, { ...defaultConfig(id), ...c })
          }
        }
        console.log('[ModelService] Loaded configs from file')
      }
      // Restore custom models
      if (data.customModels) {
        for (const [providerId, models] of Object.entries(data.customModels)) {
          const provider = BUILTIN_PROVIDERS.find((p) => p.id === providerId)
          if (provider && Array.isArray(models)) {
            for (const m of models as ModelInfo[]) {
              if (!provider.models.find((x) => x.id === m.id)) {
                provider.models.push(m)
              }
            }
          }
        }
        console.log('[ModelService] Restored custom models')
      }
      if (data.usage && Array.isArray(data.usage)) {
        this.usage = data.usage
      }
    } catch (err) {
      console.error('[ModelService] Failed to load configs:', err)
    }
  }

  private saveToFile(): void {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true })
      }
      // Collect custom models (not in the original default set)
      const customModels: Record<string, ModelInfo[]> = {}
      for (const p of BUILTIN_PROVIDERS) {
        const defaults = DEFAULT_MODEL_IDS[p.id]
        if (!defaults) continue
        const custom = p.models.filter((m) => !defaults.has(m.id))
        if (custom.length > 0) {
          customModels[p.id] = custom
        }
      }
      const data: any = {
        configs: Object.fromEntries(this.configs),
        usage: this.usage.slice(-1000),
      }
      if (Object.keys(customModels).length > 0) {
        data.customModels = customModels
      }
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2), 'utf-8')
    } catch (err) {
      console.error('[ModelService] Failed to save configs:', err)
    }
  }

  getBuiltinProviders(): ModelProvider[] {
    return BUILTIN_PROVIDERS
  }

  getProviderConfig(providerId: string): (ProviderConfig & { maskedKey: string }) | undefined {
    const cfg = this.configs.get(providerId)
    if (!cfg) return undefined
    return { ...cfg, apiKey: maskKey(cfg.apiKey), maskedKey: maskKey(cfg.apiKey) }
  }

  getAllProviderConfigs(): (ProviderConfig & { maskedKey: string })[] {
    return Array.from(this.configs.values()).map((c) => ({
      ...c,
      apiKey: maskKey(c.apiKey),
      maskedKey: maskKey(c.apiKey),
    }))
  }

  updateProviderConfig(providerId: string, update: Partial<ProviderConfig & { customModels?: ModelInfo[] }>): ProviderConfig | null {
    const existing = this.configs.get(providerId)
    if (!existing) return null

    if (update.apiKey !== undefined && !update.apiKey.startsWith('sk-****')) {
      existing.apiKey = update.apiKey
    }
    if (update.activeModel !== undefined) existing.activeModel = update.activeModel
    if (update.temperature !== undefined) existing.temperature = update.temperature
    if (update.maxTokens !== undefined) existing.maxTokens = update.maxTokens

    // Add custom models
    if (update.customModels && Array.isArray(update.customModels)) {
      const provider = BUILTIN_PROVIDERS.find((p) => p.id === providerId)
      if (provider) {
        for (const m of update.customModels) {
          if (!provider.models.find((x) => x.id === m.id)) {
            provider.models.push(m)
          }
        }
      }
    }

    this.configs.set(providerId, existing)
    this.saveToFile()
    return this.getProviderConfig(providerId)!
  }

  clearProviderKey(providerId: string): boolean {
    const existing = this.configs.get(providerId)
    if (!existing) return false
    existing.apiKey = ''
    this.configs.set(providerId, existing)
    this.saveToFile()
    return true
  }

  getActiveConfig(providerId?: string): ProviderConfig | null {
    if (providerId) {
      const cfg = this.configs.get(providerId)
      if (cfg?.apiKey) return cfg
    }
    for (const [, cfg] of this.configs) {
      if (cfg.apiKey && cfg.providerId !== 'custom') return cfg
    }
    return null
  }

  /**
   * Call a provider's chat/completions API with the given messages and configuration.
   * Returns the parsed API response body.
   */
  async callProviderAPI(
    providerId: string | undefined,
    messages: Array<{ role: string; content: string }>,
    options?: { temperature?: number; max_tokens?: number },
  ): Promise<{ choices: Array<{ message: { content: string } }>; usage?: { prompt_tokens: number; completion_tokens: number } } | null> {
    const config = this.getActiveConfig(providerId)
    if (!config) return null

    const provider = BUILTIN_PROVIDERS.find((p) => p.id === config.providerId)
    if (!provider) return null

    const response = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.activeModel,
        messages,
        temperature: options?.temperature ?? config.temperature,
        max_tokens: options?.max_tokens ?? config.maxTokens,
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      console.error(`[modelService] Provider "${config.providerId}" error:`, response.status, errText)
      return null
    }

    const data = await response.json() as {
      choices: Array<{ message: { content: string } }>
      usage?: { prompt_tokens: number; completion_tokens: number }
    }

    if (data.usage) {
      this.recordUsage(config.providerId, config.activeModel, data.usage.prompt_tokens, data.usage.completion_tokens)
    }

    return data
  }

  /**
   * Call a provider's chat/completions API with streaming.
   * Returns an async generator yielding partial content chunks.
   */
  async *callProviderAPIStream(
    providerId: string | undefined,
    messages: Array<{ role: string; content: string }>,
    options?: { temperature?: number; max_tokens?: number },
  ): AsyncGenerator<string, void, unknown> {
    const config = this.getActiveConfig(providerId)
    if (!config) return

    const provider = BUILTIN_PROVIDERS.find((p) => p.id === config.providerId)
    if (!provider) return

    const response = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.activeModel,
        messages,
        temperature: options?.temperature ?? config.temperature,
        max_tokens: options?.max_tokens ?? config.maxTokens,
        stream: true,
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      console.error(`[modelService] Provider "${config.providerId}" stream error:`, response.status, errText)
      return
    }

    const reader = response.body?.getReader()
    if (!reader) return

    const decoder = new TextDecoder()
    let buffer = ''

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
          } catch {
            // skip unparseable chunks
          }
        }
      }
    } finally {
      reader.releaseLock()
    }
  }

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

    if (this.usage.length % 10 === 0) {
      this.saveToFile()
    }
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
