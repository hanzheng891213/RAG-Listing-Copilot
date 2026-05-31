import { type Request, type Response, type NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import type { JwtPayload } from '../types/auth.js'
import { userStore } from '../controllers/authController.js'

const JWT_SECRET = 'rag-copilot-jwt-secret-2026'

export function extractToken(req: Request): string | null {
  const authHeader = req.headers.authorization
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7)
  }
  return null
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload
  } catch {
    return null
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = extractToken(req)
  if (!token) {
    res.status(401).json({ error: 'Authentication required' })
    return
  }

  const payload = verifyToken(token)
  if (!payload) {
    res.status(401).json({ error: 'Invalid or expired token' })
    return
  }

  ;(req as any).user = payload
  next()
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const user = (req as any).user as JwtPayload | undefined
  if (!user || user.role !== 'admin') {
    res.status(403).json({ error: 'Admin access required' })
    return
  }
  next()
}

export function checkApiUsage(req: Request, res: Response, next: NextFunction): void {
  const user = (req as any).user as JwtPayload | undefined
  if (!user) {
    next()
    return
  }

  const storedUser = userStore.get(user.userId)
  if (!storedUser) {
    next()
    return
  }

  if (storedUser.role !== 'admin' && storedUser.apiCallCount >= 3) {
    res.status(403).json({ error: 'API call limit reached (3/3). Please contact administrator for increased access.' })
    return
  }

  // Track usage after successful response
  const originalJson = res.json.bind(res)
  res.json = function (body: any) {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      storedUser.apiCallCount++
    }
    return originalJson(body)
  }

  next()
}
