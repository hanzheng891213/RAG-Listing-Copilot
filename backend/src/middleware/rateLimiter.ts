import type { Request, Response, NextFunction } from 'express'

interface RateLimitOptions {
  windowMs: number
  max: number
}

interface RateLimitEntry {
  count: number
  resetAt: number
}

const store = new Map<string, RateLimitEntry>()

// Periodic cleanup of expired entries (every 5 minutes)
const CLEANUP_INTERVAL = 5 * 60_000
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of store) {
    if (entry.resetAt <= now) store.delete(key)
  }
}, CLEANUP_INTERVAL).unref()

export function rateLimiter(options: RateLimitOptions) {
  const { windowMs, max } = options

  return (req: Request, res: Response, next: NextFunction): void => {
    // Use IP + path as key; fall back to X-Forwarded-For if behind proxy
    const ip = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim()
      || req.socket.remoteAddress
      || 'unknown'
    const key = `${ip}:${req.path}`
    const now = Date.now()

    let entry = store.get(key)
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs }
      store.set(key, entry)
    }

    entry.count++

    // Set rate limit headers
    const remaining = Math.max(0, max - entry.count)
    res.setHeader('X-RateLimit-Limit', max)
    res.setHeader('X-RateLimit-Remaining', remaining)
    res.setHeader('X-RateLimit-Reset', Math.ceil(entry.resetAt / 1000))

    if (entry.count > max) {
      res.status(429).json({
        error: 'Too many requests. Please slow down.',
        code: 'ERR_RATE_LIMITED',
        retryAfter: Math.ceil((entry.resetAt - now) / 1000),
      })
      return
    }

    // Auto-clean one-entry-per-second in high-traffic scenarios
    if (store.size > 10_000) {
      const oldestKey = store.keys().next().value
      if (oldestKey) store.delete(oldestKey)
    }

    next()
  }
}
