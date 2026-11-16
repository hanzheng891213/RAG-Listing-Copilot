/**
 * Per-user model configuration.
 *
 * Every row is scoped by `user_id`, so switching accounts restores that
 * person's own provider, model and key. API keys are encrypted with AES-GCM
 * (see configCrypto.ts) and are never sent back to the browser — the client
 * sees `hasKey` + the last four characters only.
 *
 * There is deliberately no default model: a provider row is unusable until the
 * user types the model id from the provider's own documentation.
 */

import { modelService } from './modelService.js'
import {
  ConfigKeyMissingError,
  decryptSecret,
  encryptSecret,
  keyHint,
} from './configCrypto.js'

const MODEL_CONFIGS_TABLE = 'user_model_configs'
const PROVIDER_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/
const MODEL_MAX_LENGTH = 128
const API_KEY_MAX_LENGTH = 512

export interface PublicModelConfig {
  providerId: string
  providerName: string
  baseUrl: string
  model: string
  temperature: number
  maxTokens: number
  hasKey: boolean
  keyLast4: string
  updatedAt: string
}

export interface ModelConfigInput {
  /** undefined = keep the stored key; null/'' = remove it. */
  apiKey?: string | null
  model?: string
  providerName?: string
  baseUrl?: string
  temperature?: number
  maxTokens?: number
}

export interface ResolvedModel {
  providerId: string
  apiKey: string
  model: string
  baseUrl: string
  temperature: number
  maxTokens: number
}

interface StoredConfig {
  userId: string
  providerId: string
  providerName: string
  baseUrl: string
  model: string
  apiKeyCipher: string
  apiKeyIv: string
  keyLast4: string
  temperature: number
  maxTokens: number
  updatedAt: string
}

export class ConfigError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'ConfigError'
  }
}

function nowIso(): string {
  return new Date().toISOString()
}

function isMissingTable(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err)
  return /no such table/i.test(message)
}

function isPrivateHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (!host) return true
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    return true
  }
  if (host === '::1' || host === '::' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80')) {
    return true
  }

  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (!ipv4) return false
  const [a, b] = [Number(ipv4[1]), Number(ipv4[2])]
  if (a === 10 || a === 127 || a === 0) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  return false
}

/**
 * Rejects non-HTTPS and private-network endpoints. Without this a user could
 * point a custom provider at an internal address and turn the server into an
 * SSRF proxy. Plain HTTP is allowed only for a local relay during development.
 */
export function normalizeBaseUrl(raw: string): string {
  const value = (raw ?? '').trim()
  if (!value) return ''

  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new ConfigError(400, 'ERR_INVALID_BASE_URL', 'Endpoint must be a valid URL')
  }

  if (url.username || url.password) {
    throw new ConfigError(400, 'ERR_INVALID_BASE_URL', 'Endpoint must not contain credentials')
  }

  const loopback = ['localhost', '127.0.0.1', '::1'].includes(url.hostname.replace(/^\[|\]$/g, ''))
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) {
    throw new ConfigError(400, 'ERR_INVALID_BASE_URL', 'Endpoint must use HTTPS')
  }
  // Local relays are useful in development, but letting a user point the server
  // at an arbitrary private address is SSRF. It is opt-in per environment and
  // must never be enabled on the public Worker.
  const allowLocal = process.env.ALLOW_LOCAL_PROVIDER === 'true'
  if (isPrivateHost(url.hostname) && !(allowLocal && loopback)) {
    throw new ConfigError(400, 'ERR_INVALID_BASE_URL', 'Endpoint must not point to a private address')
  }
  if (value.length > 500) {
    throw new ConfigError(400, 'ERR_INVALID_BASE_URL', 'Endpoint is too long')
  }
  return value.replace(/\/+$/, '')
}

/**
 * A model name is required to *use* a provider, not to store a draft row. The
 * custom-provider flow creates the row first and asks for the model in the same
 * editor, and the UI blocks saving a key without a model.
 */
function normalizeModel(raw: string): string {
  const model = (raw ?? '').trim()
  if (!model) return ''
  if (model.length > MODEL_MAX_LENGTH) {
    throw new ConfigError(400, 'ERR_MODEL_INVALID', 'Model name is too long')
  }
  if (/[\u0000-\u001f\u007f]/.test(model)) {
    throw new ConfigError(400, 'ERR_MODEL_INVALID', 'Model name contains control characters')
  }
  return model
}

function normalizeProviderId(providerId: string): string {
  if (!PROVIDER_ID_PATTERN.test(providerId)) {
    throw new ConfigError(400, 'ERR_PROVIDER_INVALID', 'Provider id is invalid')
  }
  return providerId
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(Math.max(n, min), max)
}

function toPublic(config: StoredConfig): PublicModelConfig {
  return {
    providerId: config.providerId,
    providerName: config.providerName,
    baseUrl: config.baseUrl,
    model: config.model,
    temperature: config.temperature,
    maxTokens: config.maxTokens,
    hasKey: Boolean(config.apiKeyCipher),
    keyLast4: config.keyLast4,
    updatedAt: config.updatedAt,
  }
}

function rowToStored(row: any): StoredConfig {
  return {
    userId: String(row.user_id),
    providerId: String(row.provider_id),
    providerName: String(row.provider_name ?? ''),
    baseUrl: String(row.base_url ?? ''),
    model: String(row.model ?? ''),
    apiKeyCipher: String(row.api_key_cipher ?? ''),
    apiKeyIv: String(row.api_key_iv ?? ''),
    keyLast4: String(row.key_last4 ?? ''),
    temperature: Number(row.temperature ?? 0.7),
    maxTokens: Number(row.max_tokens ?? 4096),
    updatedAt: String(row.updated_at ?? ''),
  }
}

export class ModelConfigService {
  private db: any = null
  private memory = new Map<string, StoredConfig>()
  private activeMemory = new Map<string, string>()

  bindDatabase(db: any): void {
    this.db = db ?? null
  }

  private isBuiltin(providerId: string): boolean {
    return modelService.getBuiltinProviders().some((provider) => provider.id === providerId)
  }

  async list(userId: string): Promise<PublicModelConfig[]> {
    if (this.db) {
      try {
        const result = await this.db
          .prepare(
            `SELECT * FROM ${MODEL_CONFIGS_TABLE}
              WHERE user_id = ? ORDER BY updated_at DESC`,
          )
          .bind(userId)
          .all()
        return (result?.results ?? []).map((row: any) => toPublic(rowToStored(row)))
      } catch (err) {
        if (isMissingTable(err)) {
          throw new ConfigError(
            503,
            'ERR_DB_SCHEMA',
            'The user_model_configs table is missing. Run the D1 migrations.',
          )
        }
        throw err
      }
    }

    return [...this.memory.values()]
      .filter((config) => config.userId === userId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map(toPublic)
  }

  async findByProvider(userId: string, providerId: string): Promise<StoredConfig | null> {
    if (this.db) {
      try {
        const row = await this.db
          .prepare(
            `SELECT * FROM ${MODEL_CONFIGS_TABLE} WHERE user_id = ? AND provider_id = ?`,
          )
          .bind(userId, providerId)
          .first()
        return row ? rowToStored(row) : null
      } catch (err) {
        if (isMissingTable(err)) {
          throw new ConfigError(
            503,
            'ERR_DB_SCHEMA',
            'The user_model_configs table is missing. Run the D1 migrations.',
          )
        }
        throw err
      }
    }
    return this.memory.get(`${userId}:${providerId}`) ?? null
  }

  async upsert(
    userId: string,
    rawProviderId: string,
    input: ModelConfigInput,
    env?: { CONFIG_ENC_KEY?: string },
  ): Promise<PublicModelConfig> {
    const providerId = normalizeProviderId(rawProviderId)
    const existing = await this.findByProvider(userId, providerId)
    const builtin = this.isBuiltin(providerId)

    const providerName = builtin
      ? ''
      : (input.providerName ?? existing?.providerName ?? '').trim()
    if (!builtin && (!providerName || providerName.length > 60)) {
      throw new ConfigError(400, 'ERR_PROVIDER_NAME_REQUIRED', 'Provider name is required')
    }

    const baseUrl = input.baseUrl !== undefined
      ? normalizeBaseUrl(input.baseUrl)
      : existing?.baseUrl ?? ''
    if (!builtin && !baseUrl) {
      throw new ConfigError(400, 'ERR_BASE_URL_REQUIRED', 'Endpoint is required for a custom provider')
    }

    const model = normalizeModel(input.model ?? existing?.model ?? '')
    const temperature = clampNumber(input.temperature, 0, 2, existing?.temperature ?? 0.7)
    const maxTokens = Math.round(clampNumber(input.maxTokens, 256, 32768, existing?.maxTokens ?? 4096))

    let cipher = existing?.apiKeyCipher ?? ''
    let iv = existing?.apiKeyIv ?? ''
    let last4 = existing?.keyLast4 ?? ''

    if (input.apiKey !== undefined) {
      const apiKey = (input.apiKey ?? '').trim()
      if (!apiKey) {
        cipher = ''
        iv = ''
        last4 = ''
      } else {
        if (apiKey.length > API_KEY_MAX_LENGTH) {
          throw new ConfigError(400, 'ERR_API_KEY_INVALID', 'API key is too long')
        }
        if (/[\u0000-\u001f\u007f]/.test(apiKey)) {
          throw new ConfigError(400, 'ERR_API_KEY_INVALID', 'API key contains control characters')
        }
        const encrypted = await encryptSecret(apiKey, env)
        cipher = encrypted.cipher
        iv = encrypted.iv
        last4 = keyHint(apiKey)
      }
    }

    const next: StoredConfig = {
      userId,
      providerId,
      providerName,
      baseUrl,
      model,
      apiKeyCipher: cipher,
      apiKeyIv: iv,
      keyLast4: last4,
      temperature,
      maxTokens,
      updatedAt: nowIso(),
    }

    if (this.db) {
      await this.db
        .prepare(
          `INSERT INTO ${MODEL_CONFIGS_TABLE}
             (user_id, provider_id, provider_name, base_url, model,
              api_key_cipher, api_key_iv, key_last4, temperature, max_tokens, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(user_id, provider_id) DO UPDATE SET
             provider_name = excluded.provider_name,
             base_url = excluded.base_url,
             model = excluded.model,
             api_key_cipher = excluded.api_key_cipher,
             api_key_iv = excluded.api_key_iv,
             key_last4 = excluded.key_last4,
             temperature = excluded.temperature,
             max_tokens = excluded.max_tokens,
             updated_at = excluded.updated_at`,
        )
        .bind(
          userId,
          providerId,
          providerName,
          baseUrl,
          model,
          cipher,
          iv,
          last4,
          temperature,
          maxTokens,
          next.updatedAt,
        )
        .run()
    } else {
      this.memory.set(`${userId}:${providerId}`, next)
    }

    // A config that is ready to use becomes active when nothing else is.
    const active = await this.getActiveProviderId(userId)
    if (!active && cipher) await this.setActive(userId, providerId)

    return toPublic(next)
  }

  async clearKey(userId: string, providerId: string): Promise<void> {
    const existing = await this.findByProvider(userId, providerId)
    if (!existing) return
    const next: StoredConfig = {
      ...existing,
      apiKeyCipher: '',
      apiKeyIv: '',
      keyLast4: '',
      updatedAt: nowIso(),
    }
    if (this.db) {
      await this.db
        .prepare(
          `UPDATE ${MODEL_CONFIGS_TABLE}
              SET api_key_cipher = '', api_key_iv = '', key_last4 = '', updated_at = ?
            WHERE user_id = ? AND provider_id = ?`,
        )
        .bind(next.updatedAt, userId, providerId)
        .run()
    } else {
      this.memory.set(`${userId}:${providerId}`, next)
    }
    if ((await this.getActiveProviderId(userId)) === providerId) {
      await this.clearActive(userId)
    }
  }

  async remove(userId: string, providerId: string): Promise<void> {
    if (this.db) {
      await this.db
        .prepare(`DELETE FROM ${MODEL_CONFIGS_TABLE} WHERE user_id = ? AND provider_id = ?`)
        .bind(userId, providerId)
        .run()
    } else {
      this.memory.delete(`${userId}:${providerId}`)
    }
    if ((await this.getActiveProviderId(userId)) === providerId) {
      await this.clearActive(userId)
    }
  }

  async getActiveProviderId(userId: string): Promise<string> {
    if (this.db) {
      try {
        const row = await this.db
          .prepare('SELECT active_provider_id FROM users WHERE id = ?')
          .bind(userId)
          .first()
        return String(row?.active_provider_id ?? '')
      } catch (err) {
        if (isMissingTable(err)) return ''
        throw err
      }
    }
    return this.activeMemory.get(userId) ?? ''
  }

  async setActive(userId: string, providerId: string): Promise<void> {
    const config = await this.findByProvider(userId, providerId)
    if (!config) {
      throw new ConfigError(404, 'ERR_CONFIG_NOT_FOUND', 'Configure the provider before selecting it')
    }
    if (!config.apiKeyCipher) {
      throw new ConfigError(400, 'ERR_NO_API_KEY', 'Add an API key before selecting this provider')
    }
    await this.writeActive(userId, providerId)
  }

  private async clearActive(userId: string): Promise<void> {
    await this.writeActive(userId, '')
  }

  private async writeActive(userId: string, providerId: string): Promise<void> {
    if (this.db) {
      await this.db
        .prepare('UPDATE users SET active_provider_id = ?, updated_at = ? WHERE id = ?')
        .bind(providerId, nowIso(), userId)
        .run()
      return
    }
    this.activeMemory.set(userId, providerId)
  }

  /**
   * Decrypt the key the server should use for this request. The browser never
   * sends a key: it names a provider, and the server resolves model + key.
   */
  async resolve(
    userId: string,
    providerId?: string,
    env?: { CONFIG_ENC_KEY?: string },
  ): Promise<ResolvedModel | null> {
    const configs: StoredConfig[] = []
    if (this.db) {
      const result = await this.db
        .prepare(`SELECT * FROM ${MODEL_CONFIGS_TABLE} WHERE user_id = ?`)
        .bind(userId)
        .all()
      for (const row of result?.results ?? []) configs.push(rowToStored(row))
    } else {
      for (const config of this.memory.values()) {
        if (config.userId === userId) configs.push(config)
      }
    }

    const activeId = await this.getActiveProviderId(userId)
    const chosen =
      (providerId
        ? configs.find((config) => config.providerId === providerId)
        : configs.find((config) => config.providerId === activeId)) ??
      configs.find((config) => Boolean(config.apiKeyCipher))

    if (!chosen || !chosen.apiKeyCipher) return null
    if (!chosen.model) return null

    const apiKey = await decryptSecret(
      { cipher: chosen.apiKeyCipher, iv: chosen.apiKeyIv },
      env,
    )
    if (!apiKey) return null

    const builtin = modelService.getBuiltinProviders().find((p) => p.id === chosen.providerId)
    const baseUrl = chosen.baseUrl || builtin?.baseUrl || ''
    if (!baseUrl) return null

    return {
      providerId: chosen.providerId,
      apiKey,
      model: chosen.model,
      baseUrl,
      temperature: chosen.temperature,
      maxTokens: chosen.maxTokens,
    }
  }
}

let instance: ModelConfigService | null = null

export function getModelConfigService(): ModelConfigService {
  if (!instance) instance = new ModelConfigService()
  return instance
}

export { ConfigKeyMissingError }
