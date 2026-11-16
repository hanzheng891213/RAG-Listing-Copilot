/**
 * JWT signing/verification with an environment-supplied secret.
 *
 * The previous build fell back to a hardcoded development secret both in the
 * Worker and in Express. That let anyone mint `role: "admin"` tokens. There is
 * deliberately no fallback now: a missing secret is a configuration error.
 */

import jwt from 'jsonwebtoken'
import type { JwtPayload, User } from '../../types/auth.js'

const TOKEN_TTL = '7d'

export class MissingSecretError extends Error {
  code = 'ERR_JWT_SECRET_MISSING'

  constructor() {
    super('JWT_SECRET is not configured')
    this.name = 'MissingSecretError'
  }
}

export function resolveJwtSecret(env?: { JWT_SECRET?: string }): string {
  const secret = env?.JWT_SECRET || process.env.JWT_SECRET
  if (!secret || secret.trim().length < 16) {
    throw new MissingSecretError()
  }
  return secret
}

export function signToken(user: Pick<User, 'id' | 'username' | 'role'>, secret: string): string {
  const payload: JwtPayload = {
    userId: user.id,
    username: user.username,
    role: user.role,
  }
  return jwt.sign(payload, secret, { expiresIn: TOKEN_TTL })
}

export function verifyToken(token: string, secret: string): JwtPayload | null {
  try {
    return jwt.verify(token, secret) as JwtPayload
  } catch {
    return null
  }
}

export function readBearerToken(header: string | null | undefined): string | null {
  if (!header?.startsWith('Bearer ')) return null
  const token = header.slice(7).trim()
  return token || null
}
