import { Router, type Request, type Response } from 'express'
import {
  isPermissionKey,
  toPublicUser,
  type PermissionKey,
  type UserUpdate,
} from '../types/auth.js'
import { AuthError, authenticateUser, registerUser } from '../services/auth/authService.js'
import { resolveJwtSecret, signToken } from '../services/auth/token.js'
import { getUserService, SchemaMissingError } from '../services/auth/userService.js'
import { clearFailures, isRateLimited, recordFailure } from '../services/auth/rateLimit.js'
import { requireAdmin, requireAuth, type AuthedRequest } from '../middleware/authMiddleware.js'

/**
 * POST /api/auth/register — real, server-side registration.
 *
 * The account is written to D1 with zero page permissions. An administrator
 * grants access afterwards from the permission page, which is what makes the
 * "new user pending approval" state meaningful instead of cosmetic.
 *
 * POST /api/auth/login — PBKDF2 verification against the stored hash.
 *
 * GET  /api/auth/me — current identity + permissions (one indexed read).
 * GET  /api/auth/users — admin directory.
 * PATCH /api/auth/users/:id — admin: role, page permissions, disabled flag.
 */

const router = Router()

const LOGIN_WINDOW_MS = 15 * 60_000
const LOGIN_MAX_FAILURES = 8
const REGISTER_WINDOW_MS = 60 * 60_000
const REGISTER_MAX_ATTEMPTS = 5

function clientIp(req: Request): string {
  return req.ip || req.socket.remoteAddress || 'unknown'
}

function authFailure(res: Response, err: unknown): boolean {
  if (err instanceof AuthError) {
    res.status(err.status).json({ error: err.message, code: err.code })
    return true
  }
  if (err instanceof SchemaMissingError) {
    res.status(503).json({ error: err.message, code: err.code })
    return true
  }
  return false
}

router.post('/register', async (req: Request, res: Response) => {
  const ip = clientIp(req)
  const rateKey = `register:${ip}`
  if (isRateLimited(rateKey, REGISTER_MAX_ATTEMPTS)) {
    res.status(429).json({
      error: 'Too many registration attempts. Try again later.',
      code: 'ERR_TOO_MANY_ATTEMPTS',
    })
    return
  }

  try {
    const { username, password } = req.body ?? {}
    if (!username || !password) {
      recordFailure(rateKey, REGISTER_WINDOW_MS)
      res.status(400).json({ error: 'Username and password are required', code: 'ERR_MISSING_CREDENTIALS' })
      return
    }

    const user = await registerUser({ username, password })
    clearFailures(rateKey)
    res.status(201).json({
      token: signToken(user, resolveJwtSecret()),
      user: toPublicUser(user),
    })
  } catch (err) {
    recordFailure(rateKey, REGISTER_WINDOW_MS)
    if (authFailure(res, err)) return
    console.error('[auth] register failed:', err)
    res.status(500).json({ error: 'Registration failed', code: 'ERR_REGISTER_FAILED' })
  }
})

router.post('/login', async (req: Request, res: Response) => {
  const { username, password } = req.body ?? {}
  const rateKey = `login:${clientIp(req)}:${String(username ?? '').trim().toLowerCase()}`
  if (isRateLimited(rateKey, LOGIN_MAX_FAILURES)) {
    res.status(429).json({
      error: 'Too many failed attempts. Try again in a few minutes.',
      code: 'ERR_TOO_MANY_ATTEMPTS',
    })
    return
  }

  try {
    if (!username || !password) {
      recordFailure(rateKey, LOGIN_WINDOW_MS)
      res.status(400).json({ error: 'Username and password are required', code: 'ERR_MISSING_CREDENTIALS' })
      return
    }

    const user = await authenticateUser(String(username), String(password))
    clearFailures(rateKey)
    res.json({
      token: signToken(user, resolveJwtSecret()),
      user: toPublicUser(user),
    })
  } catch (err) {
    recordFailure(rateKey, LOGIN_WINDOW_MS)
    if (authFailure(res, err)) return
    console.error('[auth] login failed:', err)
    res.status(500).json({ error: 'Login failed', code: 'ERR_LOGIN_FAILED' })
  }
})

router.get('/me', requireAuth, (req: AuthedRequest, res: Response) => {
  res.json(req.authUser)
})

router.get('/users', requireAuth, requireAdmin, async (_req: Request, res: Response) => {
  try {
    const users = await getUserService().list()
    res.json({ users: users.map(toPublicUser) })
  } catch (err) {
    if (authFailure(res, err)) return
    console.error('[auth] list users failed:', err)
    res.status(500).json({ error: 'Failed to load users', code: 'ERR_USER_LIST' })
  }
})

router.patch('/users/:id', requireAuth, requireAdmin, async (req: AuthedRequest, res: Response) => {
  try {
    const targetId = String(req.params.id)
    const actor = req.authUser!
    const body = (req.body ?? {}) as UserUpdate & { permissions?: unknown }

    if (targetId === actor.id) {
      res.status(400).json({
        error: 'You cannot change your own role or disable your own account',
        code: 'ERR_CANNOT_MODIFY_SELF',
      })
      return
    }

    const users = getUserService()
    const target = await users.findById(targetId)
    if (!target) {
      res.status(404).json({ error: 'User not found', code: 'ERR_USER_NOT_FOUND' })
      return
    }

    if (body.role !== undefined && body.role !== 'admin' && body.role !== 'user') {
      res.status(400).json({ error: 'Invalid role', code: 'ERR_INVALID_ROLE' })
      return
    }
    if (body.disabled !== undefined && typeof body.disabled !== 'boolean') {
      res.status(400).json({ error: 'Invalid disabled flag', code: 'ERR_INVALID_DISABLED' })
      return
    }

    const nextRole = body.role ?? target.role
    const nextDisabled = body.disabled ?? target.disabled
    const losesAdmin = target.role === 'admin' && !target.disabled && (nextRole !== 'admin' || nextDisabled)

    if (losesAdmin && (await users.countActiveAdmins()) <= 1) {
      res.status(400).json({
        error: 'At least one active administrator must remain',
        code: 'ERR_LAST_ADMIN',
      })
      return
    }

    let permissions: PermissionKey[] | undefined
    if (body.permissions !== undefined) {
      if (!Array.isArray(body.permissions) || !body.permissions.every(isPermissionKey)) {
        res.status(400).json({ error: 'Invalid permissions payload', code: 'ERR_INVALID_PERMISSIONS' })
        return
      }
      permissions = body.permissions
    }

    const updated = await users.update(targetId, {
      role: body.role,
      permissions,
      disabled: body.disabled,
    })
    if (!updated) {
      res.status(404).json({ error: 'User not found', code: 'ERR_USER_NOT_FOUND' })
      return
    }
    res.json({ user: toPublicUser(updated) })
  } catch (err) {
    if (authFailure(res, err)) return
    console.error('[auth] update user failed:', err)
    res.status(500).json({ error: 'Failed to update user', code: 'ERR_USER_UPDATE' })
  }
})

export default router
