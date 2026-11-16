/**
 * AES-GCM encryption for per-user provider API keys.
 *
 * Keys are encrypted at rest in D1 with a Worker secret (`CONFIG_ENC_KEY`), so a
 * database dump or a D1 console view does not expose them. The plaintext key is
 * never returned by the API: clients only see `hasKey` and the last four
 * characters.
 *
 * This does not protect against a compromised Worker runtime (it must decrypt to
 * call the provider). It does remove the previous design's exposure — keys sat
 * in localStorage where any XSS or browser extension could read them.
 */

const IV_BYTES = 12

export class ConfigKeyMissingError extends Error {
  readonly code = 'ERR_CONFIG_KEY_MISSING'

  constructor() {
    super('CONFIG_ENC_KEY is not configured')
    this.name = 'ConfigKeyMissingError'
  }
}

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function secretOf(env?: { CONFIG_ENC_KEY?: string }): string {
  const secret = env?.CONFIG_ENC_KEY || process.env.CONFIG_ENC_KEY
  if (!secret || secret.trim().length < 16) throw new ConfigKeyMissingError()
  return secret
}

async function aesKey(env?: { CONFIG_ENC_KEY?: string }): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(secretOf(env)),
  )
  return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

export interface EncryptedValue {
  cipher: string
  iv: string
}

export async function encryptSecret(
  plaintext: string,
  env?: { CONFIG_ENC_KEY?: string },
): Promise<EncryptedValue> {
  const key = await aesKey(env)
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as unknown as BufferSource },
    key,
    new TextEncoder().encode(plaintext),
  )
  return {
    cipher: toBase64(new Uint8Array(cipher)),
    iv: toBase64(iv),
  }
}

export async function decryptSecret(
  value: EncryptedValue,
  env?: { CONFIG_ENC_KEY?: string },
): Promise<string> {
  if (!value.cipher || !value.iv) return ''
  const key = await aesKey(env)
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(value.iv) as unknown as BufferSource },
    key,
    fromBase64(value.cipher) as unknown as BufferSource,
  )
  return new TextDecoder().decode(plain)
}

/** Last four characters, for the masked display. Never enough to use the key. */
export function keyHint(apiKey: string): string {
  const trimmed = (apiKey ?? '').trim()
  return trimmed.length <= 4 ? '****' : trimmed.slice(-4)
}
