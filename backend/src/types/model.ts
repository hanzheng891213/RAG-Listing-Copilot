export interface ModelInfo {
  id: string
  name: string
}

export interface ModelProvider {
  id: string
  name: string
  baseUrl: string
  signupUrl: string
  models: ModelInfo[]
}

export interface ProviderConfig {
  providerId: string
  apiKey: string
  activeModel: string
  temperature: number
  maxTokens: number
}

export interface UsageRecord {
  id: string
  date: string
  providerId: string
  modelId: string
  promptTokens: number
  completionTokens: number
  cost: number
}

export interface UsageBreakdown {
  /** Stable key — providerId for byProvider, `${providerId}:${modelId}` for byModel. */
  key: string
  /** Display name, e.g. "DeepSeek" or "DeepSeek · deepseek-v4-flash". */
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
  /** Same usage split by model — several models can share one provider. */
  byModel: UsageBreakdown[]
  daily: { date: string; tokens: number; cost: number }[]
}
