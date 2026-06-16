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
  configs: ProviderConfig[]
}

export function getProviders(): Promise<ProvidersResponse> {
  return client.get('/models/providers') as any
}

export function getProviderConfig(providerId: string): Promise<ProviderConfig> {
  return client.get(`/models/providers/${providerId}`) as any
}

export function updateProviderConfig(
  providerId: string,
  config: Partial<ProviderConfig & { customModels?: ModelInfo[] }>,
): Promise<ProviderConfig> {
  return client.put(`/models/providers/${providerId}`, config) as any
}

export function getUsageStats(days?: number): Promise<UsageStats> {
  return client.get('/models/usage/stats', { params: { days } }) as any
}
