export interface LLMProvider {
  id: number
  name: string
  api_base: string
  api_key_encrypted?: string
  default_model: string
  is_enabled: boolean
  extra_config?: Record<string, unknown>
}

export interface HealthStatus {
  status: 'ok' | 'degraded' | 'down'
  version: string
  uptime_seconds: number
}
