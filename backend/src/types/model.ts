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

export interface UsageStats {
  totalCost: number
  totalTokens: number
  totalCalls: number
  byProvider: { providerId: string; providerName: string; cost: number; tokens: number }[]
  daily: { date: string; tokens: number; cost: number }[]
}
