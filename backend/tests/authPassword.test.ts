import test from 'node:test'
import assert from 'node:assert/strict'
import {
  hashPassword,
  validatePassword,
  validateUsername,
  verifyPassword,
} from '../src/services/auth/password.ts'

test('PBKDF2 hash verifies the right password and rejects the wrong one', async () => {
  const hash = await hashPassword('correct horse 42')
  assert.match(hash, /^pbkdf2\$sha256\$60000\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/)
  assert.equal(await verifyPassword('correct horse 42', hash), true)
  assert.equal(await verifyPassword('correct horse 43', hash), false)
})

test('two hashes of the same password use different salts', async () => {
  const a = await hashPassword('same-password-1')
  const b = await hashPassword('same-password-1')
  assert.notEqual(a, b)
  assert.equal(await verifyPassword('same-password-1', a), true)
  assert.equal(await verifyPassword('same-password-1', b), true)
})

test('malformed or tampered hashes fail closed', async () => {
  assert.equal(await verifyPassword('x', ''), false)
  assert.equal(await verifyPassword('x', 'bcrypt$whatever'), false)
  assert.equal(await verifyPassword('x', 'pbkdf2$sha256$999999999$AAAA$AAAA'), false)

  const hash = await hashPassword('tamper-me-1')
  const parts = hash.split('$')
  parts[4] = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='
  assert.equal(await verifyPassword('tamper-me-1', parts.join('$')), false)
})

test('password policy requires 10+ chars, a letter and a digit', () => {
  assert.equal(validatePassword('short1')?.code, 'ERR_PASSWORD_TOO_SHORT')
  assert.equal(validatePassword('allletters')?.code, 'ERR_PASSWORD_WEAK')
  assert.equal(validatePassword('1234567890')?.code, 'ERR_PASSWORD_WEAK')
  assert.equal(validatePassword('goodpass123')?.code, undefined)
  assert.equal(validatePassword(' padded12345 ')?.code, 'ERR_PASSWORD_WHITESPACE')
})

test('username policy rejects spaces, bad characters and short names', () => {
  assert.equal(validateUsername('ab')?.code, 'ERR_USERNAME_LENGTH')
  assert.equal(validateUsername('bad name')?.code, 'ERR_USERNAME_CHARS')
  assert.equal(validateUsername('.hidden')?.code, 'ERR_USERNAME_CHARS')
  assert.equal(validateUsername('O_O@visitor.com')?.code, undefined)
  assert.equal(validateUsername('hanzheng891213@gmail.com')?.code, undefined)
})

test(
  'the seeded admin hash still matches the owner password',
  { skip: !process.env.SEED_ADMIN_PASSWORD },
  async () => {
    // The password is supplied at test time (SEED_ADMIN_PASSWORD=... npm test),
    // never committed: the old build leaked it and the repository history still
    // contains it, so it must not be repeated here.
    const { SEED_USERS } = await import('../src/services/auth/seedUsers.ts')
    const admin = SEED_USERS.find((user) => user.role === 'admin')
    assert.ok(admin)
    assert.equal(
      await verifyPassword(process.env.SEED_ADMIN_PASSWORD!, admin!.passwordHash),
      true,
    )
    assert.equal(await verifyPassword('wrong-password', admin!.passwordHash), false)
  },
)
