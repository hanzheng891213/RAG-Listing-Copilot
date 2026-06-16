import client from './client'

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

export interface UsageStats {
  totalCost: number
  totalTokens: number
  totalCalls: number
  byProvider: { providerId: string; providerName: string; cost: number; tokens: number }[]
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
