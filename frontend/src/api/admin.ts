import client from './client'

export interface AdminSettings {
  deepseekApiKey: string
  modelName: string
  temperature: number
  maxTokens: number
}

export function getSettings(): Promise<AdminSettings> {
  return client.get('/admin/settings') as any
}

export function updateSettings(settings: Partial<AdminSettings>): Promise<{ message: string; settings: AdminSettings }> {
  return client.put('/admin/settings', settings) as any
}
