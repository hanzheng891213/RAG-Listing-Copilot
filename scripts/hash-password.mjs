#!/usr/bin/env node
/**
 * Generates one PBKDF2-SHA256 record in the format the backend expects:
 *
 *   pbkdf2$sha256$<iterations>$<salt-b64>$<hash-b64>
 *
 * Use it to seed an account (migrations) or to reset a password by hand.
 * Iterations must stay in sync with backend/src/services/auth/password.ts.
 *
 *   node scripts/hash-password.mjs 'a-strong-password'
 */

import { webcrypto } from 'node:crypto'

const ITERATIONS = 60_000
const password = process.argv[2]

if (!password) {
  console.error("Usage: node scripts/hash-password.mjs '<password>'")
  process.exit(1)
}

const salt = webcrypto.getRandomValues(new Uint8Array(16))
const key = await webcrypto.subtle.importKey(
  'raw',
  new TextEncoder().encode(password),
  'PBKDF2',
  false,
  ['deriveBits'],
)
const bits = await webcrypto.subtle.deriveBits(
  { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
  key,
  256,
)

const b64 = (bytes) => Buffer.from(bytes).toString('base64')
console.log(`pbkdf2$sha256$${ITERATIONS}$${b64(salt)}$${b64(new Uint8Array(bits))}`)
