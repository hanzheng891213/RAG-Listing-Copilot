import { Router, type Request, type Response } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import type { User, JwtPayload, LoginRequest, AuthResponse } from '../types/auth.js'
import { requireAuth } from '../middleware/authMiddleware.js'

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET
  if (!secret) {
    console.warn(
      '\x1b[33m%s\x1b[0m',
      '[WARN] JWT_SECRET environment variable is not set. Using insecure default. ' +
      'Set JWT_SECRET in your .dev.vars or production environment.',
    )
  }
  return secret || 'rag-copilot-jwt-secret-2026-dev'
}

const JWT_SECRET = getJwtSecret()

// In-memory user store (will be replaced by Cloudflare D1 later)
export const userStore = new Map<string, User>()

function generateToken(user: User): string {
  const payload: JwtPayload = {
    userId: user.id,
    username: user.username,
    role: user.role,
  }
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' })
}

function sanitizeUser(user: User): Omit<User, 'passwordHash'> {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    apiCallCount: user.apiCallCount,
    createdAt: user.createdAt,
  }
}

// Hardcoded users — will migrate to Cloudflare D1
function initUsers() {
  if (userStore.size > 0) return

  const admin: User = {
    id: 'admin-001',
    username: 'hanzheng891213@gmail.com',
    passwordHash: '$2b$10$dp5qQpzSh5ZPun0Ae9B/kO8kseSeq4FjIeE1mjjFqgi0lCYSnPITS',
    role: 'admin',
    apiCallCount: 0,
    createdAt: '2026-05-31T00:00:00.000Z',
  }

  const visitor: User = {
    id: 'visitor-001',
    username: 'O_O@visitor.com',
    passwordHash: '$2b$10$PimQXuKDfzt4Hbf2Tmi6duXLdKlS6br8WXMpqSDpWpbMwxKpfCxmy',
    role: 'user',
    apiCallCount: 0,
    createdAt: '2026-05-31T00:00:00.000Z',
  }

  userStore.set(admin.id, admin)
  userStore.set(visitor.id, visitor)
  console.log('Users initialized: admin + visitor')
}

initUsers()

const router = Router()

// POST /api/auth/login
router.post('/login', (req: Request, res: Response) => {
  try {
    const { username, password } = req.body as LoginRequest

    if (!username || !password) {
      res.status(400).json({ error: 'Username and password are required', code: 'ERR_MISSING_CREDENTIALS' })
      return
    }

    const user = Array.from(userStore.values()).find(
      (u) => u.username.toLowerCase() === username.toLowerCase()
    )

    if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
      res.status(401).json({ error: 'Invalid username or password', code: 'ERR_INVALID_CREDENTIALS' })
      return
    }

    const response: AuthResponse = {
      token: generateToken(user),
      user: sanitizeUser(user),
    }

    res.json(response)
  } catch (error) {
    console.error('Login error:', error)
    res.status(500).json({ error: 'Login failed', code: 'ERR_LOGIN_FAILED' })
  }
})

// GET /api/auth/me
router.get('/me', requireAuth, (req: Request, res: Response) => {
  const payload = (req as any).user as JwtPayload
  const user = userStore.get(payload.userId)

  if (!user) {
    res.status(404).json({ error: 'User not found', code: 'ERR_USER_NOT_FOUND' })
    return
  }

  res.json(sanitizeUser(user))
})

export default router
