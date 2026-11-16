/**
 * Registration and login rules, shared by the Worker and Express routes.
 *
 * Registration is deliberately closed after creation: a new account gets no page
 * permissions until an administrator grants them. That makes "registration
 * succeeded" safe even when the username is visible to the whole team.
 */

import type { PermissionKey, User } from '../../types/auth.js'
import { hashPassword, validatePassword, validateUsername, verifyPassword } from './password.js'
import { getUserService, UsernameTakenError } from './userService.js'

export class AuthError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'AuthError'
  }
}

export interface RegisterInput {
  username: string
  password: string
  /** Defaults to []: an administrator grants access after registration. */
  permissions?: PermissionKey[]
}

export async function registerUser(input: RegisterInput): Promise<User> {
  const username = (input.username ?? '').trim()
  const usernameError = validateUsername(username)
  if (usernameError) throw new AuthError(400, usernameError.code, usernameError.message)

  const passwordError = validatePassword(input.password ?? '')
  if (passwordError) throw new AuthError(400, passwordError.code, passwordError.message)

  const users = getUserService()
  // Case-insensitive lookup first, so the common path returns a clean 409
  // instead of surfacing a D1 UNIQUE constraint message.
  const existing = await users.findByUsername(username)
  if (existing) throw new AuthError(409, 'ERR_USERNAME_TAKEN', 'Username is already registered')

  const passwordHash = await hashPassword(input.password)
  try {
    return await users.create({
      username,
      passwordHash,
      role: 'user',
      permissions: input.permissions ?? [],
    })
  } catch (err) {
    if (err instanceof UsernameTakenError) {
      throw new AuthError(409, 'ERR_USERNAME_TAKEN', 'Username is already registered')
    }
    throw err
  }
}

export async function authenticateUser(
  username: string,
  password: string,
): Promise<User> {
  const users = getUserService()
  const user = await users.findByUsername((username ?? '').trim())

  // Always run one verification, even for an unknown username, so a missing
  // account and a wrong password take the same path. The dummy hash is a real
  // PBKDF2 record for a value nobody can supply.
  const candidate = user?.passwordHash ?? DUMMY_HASH
  const matched = await verifyPassword(password ?? '', candidate)

  if (!user || !matched) {
    throw new AuthError(401, 'ERR_INVALID_CREDENTIALS', 'Invalid username or password')
  }
  if (user.disabled) {
    throw new AuthError(403, 'ERR_ACCOUNT_DISABLED', 'This account has been disabled')
  }
  return user
}

/**
 * PBKDF2 record for an unguessable value, used only to keep the failure path
 * timing-similar when the username does not exist.
 */
const DUMMY_HASH =
  'pbkdf2$sha256$60000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='
