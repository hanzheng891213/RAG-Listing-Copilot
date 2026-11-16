import test from 'node:test'
import assert from 'node:assert/strict'
import {
  decryptSecret,
  encryptSecret,
  keyHint,
} from '../src/services/model/configCrypto.ts'

const env = { CONFIG_ENC_KEY: 'test-only-32-byte-secret-value!!' }

test('AES-GCM round-trips a provider key', async () => {
  const encrypted = await encryptSecret('sk-super-secret', env)
  assert.ok(encrypted.cipher.length > 0)
  assert.ok(encrypted.iv.length > 0)
  assert.equal(encrypted.cipher.includes('sk-super-secret'), false)
  assert.equal(await decryptSecret(encrypted, env), 'sk-super-secret')
})

test('a different encryption key cannot decrypt the ciphertext', async () => {
  const encrypted = await encryptSecret('sk-super-secret', env)
  await assert.rejects(
    decryptSecret(encrypted, { CONFIG_ENC_KEY: 'a-completely-different-secret' }),
  )
})

test('keyHint only exposes the last four characters', () => {
  assert.equal(keyHint('sk-abcdefgh1234'), '1234')
  assert.equal(keyHint('abc'), '****')
  assert.equal(keyHint(''), '****')
})

test('missing CONFIG_ENC_KEY fails closed', async () => {
  const saved = process.env.CONFIG_ENC_KEY
  delete process.env.CONFIG_ENC_KEY
  try {
    await assert.rejects(
      encryptSecret('sk-x', {}),
      (error: any) => error?.code === 'ERR_CONFIG_KEY_MISSING',
    )
  } finally {
    if (saved !== undefined) process.env.CONFIG_ENC_KEY = saved
  }
})
