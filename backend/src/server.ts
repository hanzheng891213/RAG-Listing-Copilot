import express from 'express'
import cors from 'cors'
import apiController from './controllers/apiController.js'
import authController from './controllers/authController.js'
import modelController from './controllers/modelController.js'
import { requireAuth, requireAdmin, checkApiUsage } from './middleware/authMiddleware.js'
import { rateLimiter } from './middleware/rateLimiter.js'
import { seedKnowledgeBase } from './services/knowledge/seed.js'

const app = express()
const PORT = process.env.PORT || 3001

// ── Security: CORS whitelist ──────────────────────────────────────────
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:5175,http://localhost:5176,http://localhost:3001')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (curl, server-to-server, etc.)
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true)
    } else {
      console.warn(`[CORS] Blocked origin: ${origin}`)
      callback(new Error('Not allowed by CORS'))
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Active-Provider'],
}))

// ── Security: hardening response headers ──────────────────────────────
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('X-XSS-Protection', '0') // modern browsers: turn off legacy
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  // Permissions-Policy: disable features not needed
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  // Content-Security-Policy (relaxed for frontend SPA)
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://api.deepseek.com",
  )
  next()
})

// ── Body parsing ──────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }))

// ── Rate limiting on all API routes ───────────────────────────────────
app.use('/api/upload-supplier', rateLimiter({ windowMs: 60_000, max: 10 }))
app.use('/api/generate-listing', rateLimiter({ windowMs: 60_000, max: 20 }))

// ── Routes ────────────────────────────────────────────────────────────
// Auth routes (no usage tracking)
app.use('/api/auth', authController)

// Model routes — require auth + admin
app.use('/api/models', requireAuth, requireAdmin, modelController)

// API routes — require auth and track usage
app.use('/api', rateLimiter({ windowMs: 60_000, max: 60 }), requireAuth, checkApiUsage, apiController)

// ── Health / Info ─────────────────────────────────────────────────────
app.get('/', (_req, res) => {
  res.json({ name: 'RAG Listing Copilot API', version: '1.0.0', health: '/health' })
})

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// ── Global error handler ──────────────────────────────────────────────
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  // CORS errors have no specific code property; check message
  if (err.message === 'Not allowed by CORS') {
    res.status(403).json({ error: 'Origin not allowed', code: 'ERR_CORS' })
    return
  }
  console.error('[Server] Unhandled error:', err)
  res.status(500).json({ error: 'Internal server error', code: 'ERR_INTERNAL' })
})

app.listen(PORT, async () => {
  console.log(`Server running on http://localhost:${PORT}`)
  console.log(`Allowed origins: ${ALLOWED_ORIGINS.join(', ') || '(none configured)'}`)
  console.log(`Health check: http://localhost:${PORT}/health`)

  // Seed knowledge base from local markdown files
  try {
    const count = await seedKnowledgeBase()
    if (count > 0) {
      console.log(`[Server] Knowledge base seeded with ${count} documents.`)
    }
  } catch (err) {
    console.warn('[Server] Knowledge base seeding failed (non-fatal):', err)
  }
})

export default app
