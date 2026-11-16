/**
 * Express authentication middleware.
 *
 * The JWT only proves identity. Role and page permissions are re-read from the
 * account store on every request, so revoking a permission takes effect on the
 * next call instead of waiting for a seven-day token to expire. That costs one
 * indexed lookup (D1 row read) per authenticated request — acceptable at this
 * app's request volume, and far cheaper than a stale seven-day admin token.
 */

import { type NextFunction, type Request, type Response } from 'express'
import { toPublicUser, type PermissionKey, type PublicUser, type User } from '../types/auth.js'
import { getUserService, SchemaMissingError } from '../services/auth/userService.js'
import {
  MissingSecretError,
  readBearerToken,
  resolveJwtSecret,
  verifyToken,
} from '../services/auth/token.js'

export interface AuthedRequest extends Request {
  authUser?: PublicUser
  userRecord?: User
}

export function extractToken(req: Request): string | null {
  return readBearerToken(req.headers.authorization)
}

function fail(res: Response, status: number, code: string, message: string): void {
  res.status(status).json({ error: message, code })
}

export async function requireAuth(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const token = extractToken(req)
    if (!token) {
      fail(res, 401, 'ERR_AUTH_REQUIRED', 'Authentication required')
      return
    }

    const payload = verifyToken(token, resolveJwtSecret())
    if (!payload) {
      fail(res, 401, 'ERR_INVALID_TOKEN', 'Invalid or expired token')
      return
    }

    const user = await getUserService().findById(payload.userId)
    if (!user) {
      fail(res, 401, 'ERR_INVALID_TOKEN', 'Invalid or expired token')
      return
    }
    if (user.disabled) {
      fail(res, 403, 'ERR_ACCOUNT_DISABLED', 'This account has been disabled')
      return
    }

    req.userRecord = user
    req.authUser = toPublicUser(user)
    // Backwards-compatible alias: older controllers read req.user.role.
    ;(req as any).user = req.authUser
    next()
  } catch (err) {
    if (err instanceof MissingSecretError) {
      fail(res, 503, 'ERR_JWT_SECRET_MISSING', 'Server auth is not configured')
      return
    }
    if (err instanceof SchemaMissingError) {
      fail(res, 503, 'ERR_DB_SCHEMA', err.message)
      return
    }
    console.error('[auth] requireAuth failed:', err)
    fail(res, 500, 'ERR_AUTH_FAILED', 'Authentication failed')
  }
}

/** Admin bypasses page permissions by design (and can never lock itself out). */
export function hasPermission(user: PublicUser | undefined, permission: PermissionKey): boolean {
  if (!user) return false
  if (user.role === 'admin') return true
  return user.permissions.includes(permission)
}

export function requirePermission(permission: PermissionKey) {
  return (req: AuthedRequest, res: Response, next: NextFunction): void => {
    if (!req.authUser) {
      fail(res, 401, 'ERR_AUTH_REQUIRED', 'Authentication required')
      return
    }
    if (!hasPermission(req.authUser, permission)) {
      fail(res, 403, 'ERR_PERMISSION_DENIED', 'You do not have permission to use this page')
      return
    }
    next()
  }
}

/** True when the account holds at least one of the listed permissions. */
export function requireAnyPermission(permissions: PermissionKey[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction): void => {
    if (!req.authUser) {
      fail(res, 401, 'ERR_AUTH_REQUIRED', 'Authentication required')
      return
    }
    if (req.authUser.role === 'admin') {
      next()
      return
    }
    if (!permissions.some((permission) => req.authUser!.permissions.includes(permission))) {
      fail(res, 403, 'ERR_PERMISSION_DENIED', 'You do not have permission to use this page')
      return
    }
    next()
  }
}

export function requireAdmin(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
): void {
  const user = req.authUser ?? ((req as any).user as PublicUser | undefined)
  if (!user) {
    fail(res, 401, 'ERR_AUTH_REQUIRED', 'Authentication required')
    return
  }
  if (user.role !== 'admin') {
    fail(res, 403, 'ERR_ADMIN_REQUIRED', 'Admin access required')
    return
  }
  next()
}
