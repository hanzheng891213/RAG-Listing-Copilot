/**
 * Small in-isolate failure counter.
 *
 * Cloudflare's free plan does not include a WAF rate-limiting rule, and a D1
 * write on every failed login would burn the daily write budget. This counter
 * is per isolate: it stops scripted guessing from one Worker instance but is not
 * a global guarantee. The durable backstop is the password cost + the fact that
 * registration requires an admin to grant permissions afterwards.
 */

interface Entry {
  count: number
  resetAt: number
}

const MAX_KEYS = 5_000
const store = new Map<string, Entry>()

function prune(now: number): void {
  if (store.size <= MAX_KEYS) return
  for (const [key, entry] of store) {
    if (entry.resetAt <= now) store.delete(key)
  }
  // Still too large: drop the oldest insertions (Map preserves insertion order).
  for (const key of store.keys()) {
    if (store.size <= MAX_KEYS) break
    store.delete(key)
  }
}

export function isRateLimited(key: string, limit: number, now = Date.now()): boolean {
  const entry = store.get(key)
  if (!entry) return false
  if (entry.resetAt <= now) {
    store.delete(key)
    return false
  }
  return entry.count >= limit
}

export function recordFailure(key: string, windowMs: number, now = Date.now()): void {
  const entry = store.get(key)
  if (!entry || entry.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs })
  } else {
    entry.count += 1
  }
  prune(now)
}

export function clearFailures(key: string): void {
  store.delete(key)
}

/** Test hook. */
export function resetRateLimiter(): void {
  store.clear()
}
