/**
 * Password hashing and credential validation.
 *
 * Uses PBKDF2-SHA256 through WebCrypto, which exists on both the Cloudflare
 * Worker and Node 18+. bcryptjs was removed because its pure-JS cost-10 compare
 * is well over the Workers Free plan's 10 ms CPU budget.
 *
 * Iteration count is deliberately bounded: 60000 PBKDF2-SHA256 rounds cost
 * roughly 8 ms on Node and are the practical ceiling for a 10 ms CPU budget.
 * A stored hash carries its own iteration count, so raising ITERATIONS later
 * keeps old hashes verifiable (verifyPassword re-derives with the stored value).
 */

const ITERATIONS = 60_000
const KEY_BITS = 256
const SALT_BYTES = 16

export const PASSWORD_MIN_LENGTH = 10
export const PASSWORD_MAX_LENGTH = 128
export const USERNAME_MIN_LENGTH = 3
export const USERNAME_MAX_LENGTH = 64

/** Only the characters the existing seed accounts and normal emails use. */
const USERNAME_PATTERN = /^[A-Za-z0-9._%+@-]+$/

const COMMON_PASSWORDS = new Set([
  '1234567890',
  '12345678901',
  '123456789012',
  'password123',
  'password1234',
  'qwerty12345',
  'qwertyuiop',
  'admin12345',
  'letmein123',
  'iloveyou123',
  'abc12345678',
  '1111111111',
  '0000000000',
])

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

function subtle(): SubtleCrypto {
  const crypto = globalThis.crypto
  if (!crypto?.subtle) {
    throw new Error('WebCrypto is unavailable in this runtime')
  }
  return crypto.subtle
}

async function derive(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> {
  const key = await subtle().importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await subtle().deriveBits(
    { name: 'PBKDF2', salt: salt as unknown as BufferSource, iterations, hash: 'SHA-256' },
    key,
    KEY_BITS,
  )
  return new Uint8Array(bits)
}

/** Constant-time compare; avoids leaking the first mismatching byte. */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

/** `pbkdf2$sha256$<iterations>$<salt-b64>$<hash-b64>` */
export async function hashPassword(password: string): Promise<string> {
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  const hash = await derive(password, salt, ITERATIONS)
  return `pbkdf2$sha256$${ITERATIONS}$${toBase64(salt)}$${toBase64(hash)}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = (stored ?? '').split('$')
  if (parts.length !== 5 || parts[0] !== 'pbkdf2' || parts[1] !== 'sha256') return false

  const iterations = Number(parts[2])
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > 1_000_000) return false

  let salt: Uint8Array
  let expected: Uint8Array
  try {
    salt = fromBase64(parts[3])
    expected = fromBase64(parts[4])
  } catch {
    return false
  }
  if (salt.length === 0 || expected.length === 0) return false

  const actual = await derive(password, salt, iterations)
  return timingSafeEqual(actual, expected)
}

export interface ValidationFailure {
  code: string
  message: string
}

export function validateUsername(raw: string): ValidationFailure | null {
  const username = (raw ?? '').trim()
  if (username.length < USERNAME_MIN_LENGTH || username.length > USERNAME_MAX_LENGTH) {
    return {
      code: 'ERR_USERNAME_LENGTH',
      message: `Username must be ${USERNAME_MIN_LENGTH}-${USERNAME_MAX_LENGTH} characters`,
    }
  }
  if (!USERNAME_PATTERN.test(username)) {
    return {
      code: 'ERR_USERNAME_CHARS',
      message: 'Username may only contain letters, digits, . _ % + - @',
    }
  }
  if (username.startsWith('.') || username.endsWith('.')) {
    return { code: 'ERR_USERNAME_CHARS', message: 'Username may not start or end with a dot' }
  }
  return null
}

export function validatePassword(raw: string): ValidationFailure | null {
  const password = raw ?? ''
  if (password.length < PASSWORD_MIN_LENGTH) {
    return {
      code: 'ERR_PASSWORD_TOO_SHORT',
      message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters`,
    }
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return {
      code: 'ERR_PASSWORD_TOO_LONG',
      message: `Password must be at most ${PASSWORD_MAX_LENGTH} characters`,
    }
  }
  if (password.trim() !== password) {
    return { code: 'ERR_PASSWORD_WHITESPACE', message: 'Password may not start or end with spaces' }
  }
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return {
      code: 'ERR_PASSWORD_WEAK',
      message: 'Password must contain at least one letter and one digit',
    }
  }
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    return { code: 'ERR_PASSWORD_WEAK', message: 'Password is too common' }
  }
  return null
}
