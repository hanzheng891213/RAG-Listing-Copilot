import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { Platform } from './types/index.js'
import {
  ALL_PERMISSIONS,
  isPermissionKey,
  toPublicUser,
  type PermissionKey,
  type PublicUser,
  type User,
} from './types/auth.js'
import { parserService } from './services/parser/parserService.js'
import { deepseekService } from './services/deepseek/deepseekService.js'
import { ragService } from './services/rag/ragService.js'
import { modelService, initModelService } from './services/model/modelService.js'
import {
  ConfigError,
  getModelConfigService,
} from './services/model/modelConfigService.js'
import { ConfigKeyMissingError } from './services/model/configCrypto.js'
import { getKnowledgeService, resetKnowledgeService } from './services/knowledge/knowledgeService.js'
import { getProductService } from './services/products/productService.js'
import { computeFinanceSummary } from './services/products/finance.js'
import { getUserService, SchemaMissingError } from './services/auth/userService.js'
import { AuthError, authenticateUser, registerUser } from './services/auth/authService.js'
import {
  MissingSecretError,
  readBearerToken,
  resolveJwtSecret,
  signToken,
  verifyToken,
} from './services/auth/token.js'
import { clearFailures, isRateLimited, recordFailure } from './services/auth/rateLimit.js'
import { extractListingFields, normalizeListingFields, parseFinalJson, streamDemoSse, type NormalizedListing } from './utils/listingStream.js'

type Bindings = {
  KNOWLEDGE_INDEX: any
  KNOWLEDGE_DB: any
  AI: any
  JWT_SECRET?: string
  CONFIG_ENC_KEY?: string
  ALLOWED_ORIGINS?: string
}

const app = new Hono<{ Bindings: Bindings }>()

// ─── CORS ──────────────────────────────────────────────────────────
// Bearer tokens (not cookies) mean CORS is not the CSRF boundary, but an
// explicit allowlist still keeps third-party pages from reading API responses.
// Set ALLOWED_ORIGINS="https://your-domain" in the Worker environment.
app.use('*', cors({
  origin: (origin, c) => {
    // No Origin header = same-origin/non-browser request.
    if (!origin) return '*'
    const allowed = (c.env?.ALLOWED_ORIGINS || '')
      .split(',')
      .map((value: string) => value.trim())
      .filter(Boolean)
    // Default is same-origin only: return null so no CORS header is emitted.
    // Cross-origin deployments must set ALLOWED_ORIGINS explicitly.
    if (allowed.length === 0) return null
    return allowed.includes(origin) ? origin : null
  },
  allowHeaders: ['Authorization', 'X-Active-Provider', 'Content-Type'],
  allowMethods: ['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  maxAge: 86400,
}))

// Authenticated JSON must not be reused from a browser cache across account or
// permission changes. SSE routes override this with their own no-cache header.
app.use('/api/*', async (c, next) => {
  c.header('Cache-Control', 'no-store')
  await next()
})

// ─── Knowledge Service (lazy init with bindings) ───────────────────
function initKnowledgeService(c: any) {
  const env = c.env ?? {}
  return getKnowledgeService({
    aiBinding: env.AI,
    vectorizeBinding: env.KNOWLEDGE_INDEX,
    d1Binding: env.KNOWLEDGE_DB,
  })
}

/**
 * Retrieves the platform rules matching this product, then builds the
 * generation prompt around them. Retrieval failing only costs grounding — the
 * prompt builder falls back to its built-in rule list.
 */
async function buildGroundedPrompt(
  c: any,
  productData: any,
  platform: any,
  template: any,
  language: any,
): Promise<string> {
  const ks = initKnowledgeService(c)
  const knowledge = await ks.buildPromptContext(
    deepseekService.buildRetrievalQuery(productData),
    // Retrieval is English-first on purpose: Chinese rule bodies in the prompt
    // pull the model's answer language away from the requested one.
    { platform },
  )
  console.log(
    `[Generate] Knowledge: rules=${knowledge.rules.length} style=${knowledge.style.length} chars (platform=${platform})`,
  )
  return deepseekService.buildPromptForProvider(productData, platform, template, language, knowledge)
}

// ─── Auth helpers ──────────────────────────────────────────────────
const LOGIN_WINDOW_MS = 15 * 60_000
const LOGIN_MAX_FAILURES = 8
const REGISTER_WINDOW_MS = 60 * 60_000
const REGISTER_MAX_ATTEMPTS = 5

function clientIp(c: any): string {
  return (
    c.req.header('CF-Connecting-IP') ||
    c.req.header('X-Forwarded-For')?.split(',')[0]?.trim() ||
    'unknown'
  )
}

interface AuthContext {
  user: PublicUser
  record: User
}

/**
 * Resolve the caller from the bearer token, then re-read the account. The token
 * carries identity only; role/permission changes apply on the next request.
 */
async function getAuth(c: any): Promise<AuthContext | null> {
  const token = readBearerToken(c.req.header('Authorization'))
  if (!token) return null
  const payload = verifyToken(token, resolveJwtSecret(c.env))
  if (!payload) return null
  const record = await getUserService().findById(payload.userId)
  if (!record || record.disabled) return null
  return { user: toPublicUser(record), record }
}

function can(user: PublicUser, permission: PermissionKey): boolean {
  return user.role === 'admin' || user.permissions.includes(permission)
}

/** Shared mapping so the Worker returns the same codes as Express. */
function authFailure(c: any, err: unknown): Response | null {
  if (err instanceof AuthError) {
    return c.json({ error: err.message, code: err.code }, err.status as any)
  }
  if (err instanceof MissingSecretError) {
    return c.json({ error: 'Server auth is not configured', code: 'ERR_JWT_SECRET_MISSING' }, 503)
  }
  if (err instanceof SchemaMissingError) {
    return c.json({ error: err.message, code: 'ERR_DB_SCHEMA' }, 503)
  }
  return null
}

/** Model output → the four listing fields, tolerating code fences. */
function parseListing(content?: string): NormalizedListing {
  return normalizeListingFields(parseFinalJson(content || '') ?? {})
}

/**
 * Full identity for a request, or null when unauthenticated. Row-level write
 * permissions need the user id, not just "is this an admin".
 */
async function readActor(
  c: any,
): Promise<{ userId: string; userName: string; isAdmin: boolean } | null> {
  const auth = await getAuth(c)
  if (!auth) return null
  return {
    userId: auth.user.id,
    userName: auth.user.username,
    isAdmin: auth.user.role === 'admin',
  }
}

// ════════════════════════════════════════════════════════════════════
// Health & Info
// ════════════════════════════════════════════════════════════════════
app.get('/', (c) => {
  return c.json({ name: 'RAG Listing Copilot API', version: '1.0.0', health: '/health' })
})

app.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// ════════════════════════════════════════════════════════════════════
// Auth routes
// ════════════════════════════════════════════════════════════════════
app.post('/api/auth/register', async (c) => {
  const rateKey = `register:${clientIp(c)}`
  if (isRateLimited(rateKey, REGISTER_MAX_ATTEMPTS)) {
    return c.json(
      { error: 'Too many registration attempts. Try again later.', code: 'ERR_TOO_MANY_ATTEMPTS' },
      429,
    )
  }

  try {
    const body = await c.req.json().catch(() => ({}))
    if (!body?.username || !body?.password) {
      recordFailure(rateKey, REGISTER_WINDOW_MS)
      return c.json(
        { error: 'Username and password are required', code: 'ERR_MISSING_CREDENTIALS' },
        400,
      )
    }

    const user = await registerUser({ username: body.username, password: body.password })
    clearFailures(rateKey)
    return c.json(
      {
        token: signToken(user, resolveJwtSecret(c.env)),
        user: toPublicUser(user),
      },
      201,
    )
  } catch (err) {
    recordFailure(rateKey, REGISTER_WINDOW_MS)
    const handled = authFailure(c, err)
    if (handled) return handled
    console.error('[auth] register failed:', err)
    return c.json({ error: 'Registration failed', code: 'ERR_REGISTER_FAILED' }, 500)
  }
})

app.post('/api/auth/login', async (c) => {
  try {
    const { username, password } = await c.req.json().catch(() => ({}))
    const rateKey = `login:${clientIp(c)}:${String(username ?? '').trim().toLowerCase()}`
    if (isRateLimited(rateKey, LOGIN_MAX_FAILURES)) {
      return c.json(
        { error: 'Too many failed attempts. Try again in a few minutes.', code: 'ERR_TOO_MANY_ATTEMPTS' },
        429,
      )
    }

    if (!username || !password) {
      recordFailure(rateKey, LOGIN_WINDOW_MS)
      return c.json({ error: 'Username and password are required', code: 'ERR_MISSING_CREDENTIALS' }, 400)
    }

    try {
      const user = await authenticateUser(String(username), String(password))
      clearFailures(rateKey)
      return c.json({
        token: signToken(user, resolveJwtSecret(c.env)),
        user: toPublicUser(user),
      })
    } catch (err) {
      recordFailure(rateKey, LOGIN_WINDOW_MS)
      throw err
    }
  } catch (err) {
    const handled = authFailure(c, err)
    if (handled) return handled
    console.error('[auth] login failed:', err)
    return c.json({ error: 'Login failed', code: 'ERR_LOGIN_FAILED' }, 500)
  }
})

app.get('/api/auth/me', async (c) => {
  try {
    const auth = await getAuth(c)
    if (!auth) {
      return c.json({ error: 'Authentication required', code: 'ERR_AUTH_REQUIRED' }, 401)
    }
    return c.json(auth.user)
  } catch (err) {
    const handled = authFailure(c, err)
    if (handled) return handled
    throw err
  }
})

app.get('/api/auth/users', async (c) => {
  try {
    const auth = await getAuth(c)
    if (!auth) return c.json({ error: 'Authentication required', code: 'ERR_AUTH_REQUIRED' }, 401)
    if (auth.user.role !== 'admin') {
      return c.json({ error: 'Admin access required', code: 'ERR_ADMIN_REQUIRED' }, 403)
    }

    const users = await getUserService().list()
    return c.json({ users: users.map(toPublicUser) })
  } catch (err) {
    const handled = authFailure(c, err)
    if (handled) return handled
    throw err
  }
})

app.patch('/api/auth/users/:id', async (c) => {
  try {
    const auth = await getAuth(c)
    if (!auth) return c.json({ error: 'Authentication required', code: 'ERR_AUTH_REQUIRED' }, 401)
    if (auth.user.role !== 'admin') {
      return c.json({ error: 'Admin access required', code: 'ERR_ADMIN_REQUIRED' }, 403)
    }

    const targetId = c.req.param('id')
    if (targetId === auth.user.id) {
      return c.json(
        { error: 'You cannot change your own role or disable your own account', code: 'ERR_CANNOT_MODIFY_SELF' },
        400,
      )
    }

    const body = await c.req.json().catch(() => ({}))
    const users = getUserService()
    const target = await users.findById(targetId)
    if (!target) {
      return c.json({ error: 'User not found', code: 'ERR_USER_NOT_FOUND' }, 404)
    }

    if (body?.role !== undefined && body.role !== 'admin' && body.role !== 'user') {
      return c.json({ error: 'Invalid role', code: 'ERR_INVALID_ROLE' }, 400)
    }
    if (body?.disabled !== undefined && typeof body.disabled !== 'boolean') {
      return c.json({ error: 'Invalid disabled flag', code: 'ERR_INVALID_DISABLED' }, 400)
    }

    const nextRole = body?.role ?? target.role
    const nextDisabled = body?.disabled ?? target.disabled
    const losesAdmin =
      target.role === 'admin' && !target.disabled && (nextRole !== 'admin' || nextDisabled)
    if (losesAdmin && (await users.countActiveAdmins()) <= 1) {
      return c.json(
        { error: 'At least one active administrator must remain', code: 'ERR_LAST_ADMIN' },
        400,
      )
    }

    let permissions: PermissionKey[] | undefined
    if (body?.permissions !== undefined) {
      if (!Array.isArray(body.permissions) || !body.permissions.every(isPermissionKey)) {
        return c.json({ error: 'Invalid permissions payload', code: 'ERR_INVALID_PERMISSIONS' }, 400)
      }
      permissions = body.permissions
    }

    const updated = await users.update(targetId, {
      role: body?.role,
      permissions,
      disabled: body?.disabled,
    })
    if (!updated) {
      return c.json({ error: 'User not found', code: 'ERR_USER_NOT_FOUND' }, 404)
    }
    return c.json({ user: toPublicUser(updated) })
  } catch (err) {
    const handled = authFailure(c, err)
    if (handled) return handled
    console.error('[auth] update user failed:', err)
    return c.json({ error: 'Failed to update user', code: 'ERR_USER_UPDATE' }, 500)
  }
})

// ════════════════════════════════════════════════════════════════════
// Model routes
// ════════════════════════════════════════════════════════════════════
function modelConfigFailure(c: any, err: unknown): Response | null {
  if (err instanceof ConfigError) {
    return c.json({ error: err.message, code: err.code }, err.status as any)
  }
  if (err instanceof ConfigKeyMissingError) {
    return c.json(
      {
        error: 'Server configuration is incomplete: CONFIG_ENC_KEY is not set',
        code: 'ERR_CONFIG_KEY_MISSING',
      },
      503,
    )
  }
  if (err instanceof SchemaMissingError) {
    return c.json({ error: err.message, code: 'ERR_DB_SCHEMA' }, 503)
  }
  return null
}

function providerDirectory(configs: Array<{ providerId: string; providerName: string; baseUrl: string }>) {
  const builtins = modelService.getBuiltinProviders()
  const known = new Set(builtins.map((p) => p.id))
  const custom = configs
    .filter((config) => config.providerName && !known.has(config.providerId))
    .map((config) => ({
      id: config.providerId,
      name: config.providerName,
      baseUrl: config.baseUrl,
      signupUrl: '',
    }))
  return [...builtins, ...custom]
}

// One request returns directory + configs + active provider, so the Model
// Manager page does not need two round trips on the free plan.
app.get('/api/models/configs', async (c) => {
  try {
    const auth = await getAuth(c)
    if (!auth) return c.json({ error: 'Authentication required', code: 'ERR_AUTH_REQUIRED' }, 401)

    const service = getModelConfigService()
    const configs = await service.list(auth.user.id)
    const activeProviderId = await service.getActiveProviderId(auth.user.id)
    return c.json({ providers: providerDirectory(configs), configs, activeProviderId })
  } catch (err) {
    const handled = modelConfigFailure(c, err)
    if (handled) return handled
    console.error('[Models] configs failed:', err)
    return c.json({ error: 'Failed to load model configs', code: 'ERR_MODEL_CONFIGS' }, 500)
  }
})

app.get('/api/models/providers', (c) => {
  return c.json({ providers: modelService.getBuiltinProviders() })
})

app.put('/api/models/configs/:providerId', async (c) => {
  try {
    const auth = await getAuth(c)
    if (!auth) return c.json({ error: 'Authentication required', code: 'ERR_AUTH_REQUIRED' }, 401)

    const body = await c.req.json().catch(() => ({}))
    const service = getModelConfigService()
    const config = await service.upsert(
      auth.user.id,
      c.req.param('providerId'),
      {
        apiKey: body?.apiKey,
        model: body?.model,
        providerName: body?.providerName,
        baseUrl: body?.baseUrl,
        temperature: body?.temperature,
        maxTokens: body?.maxTokens,
      },
      c.env,
    )
    const activeProviderId = await service.getActiveProviderId(auth.user.id)
    return c.json({ config, activeProviderId })
  } catch (err) {
    const handled = modelConfigFailure(c, err)
    if (handled) return handled
    console.error('[Models] save config failed:', err)
    return c.json({ error: 'Failed to save model config', code: 'ERR_MODEL_CONFIG_SAVE' }, 500)
  }
})

app.delete('/api/models/configs/:providerId/key', async (c) => {
  try {
    const auth = await getAuth(c)
    if (!auth) return c.json({ error: 'Authentication required', code: 'ERR_AUTH_REQUIRED' }, 401)

    await getModelConfigService().clearKey(auth.user.id, c.req.param('providerId'))
    return c.json({ ok: true })
  } catch (err) {
    const handled = modelConfigFailure(c, err)
    if (handled) return handled
    console.error('[Models] clear key failed:', err)
    return c.json({ error: 'Failed to delete API key', code: 'ERR_MODEL_KEY_DELETE' }, 500)
  }
})

app.delete('/api/models/configs/:providerId', async (c) => {
  try {
    const auth = await getAuth(c)
    if (!auth) return c.json({ error: 'Authentication required', code: 'ERR_AUTH_REQUIRED' }, 401)

    await getModelConfigService().remove(auth.user.id, c.req.param('providerId'))
    return c.json({ ok: true })
  } catch (err) {
    const handled = modelConfigFailure(c, err)
    if (handled) return handled
    console.error('[Models] delete config failed:', err)
    return c.json({ error: 'Failed to delete model config', code: 'ERR_MODEL_CONFIG_DELETE' }, 500)
  }
})

app.post('/api/models/active', async (c) => {
  try {
    const auth = await getAuth(c)
    if (!auth) return c.json({ error: 'Authentication required', code: 'ERR_AUTH_REQUIRED' }, 401)

    const body = await c.req.json().catch(() => ({}))
    const providerId = String(body?.providerId ?? '')
    await getModelConfigService().setActive(auth.user.id, providerId)
    return c.json({ activeProviderId: providerId })
  } catch (err) {
    const handled = modelConfigFailure(c, err)
    if (handled) return handled
    console.error('[Models] set active failed:', err)
    return c.json({ error: 'Failed to select provider', code: 'ERR_MODEL_ACTIVE' }, 500)
  }
})

app.get('/api/models/usage/stats', async (c) => {
  try {
    const auth = await getAuth(c)
    if (!auth) return c.json({ error: 'Authentication required', code: 'ERR_AUTH_REQUIRED' }, 401)

    const days = parseInt(c.req.query('days') || '30')
    const stats = await modelService.getUsageStats(days)
    return c.json(stats)
  } catch (error) {
    console.error('Usage stats error:', error)
    return c.json({ error: 'Failed to load usage stats', code: 'ERR_USAGE_STATS' }, 500)
  }
})

// ════════════════════════════════════════════════════════════════════
// API routes
// ════════════════════════════════════════════════════════════════════

// GET /api/upload-supplier - endpoint-existence probe for the frontend.
// Registered as GET on purpose: Hono has no app.head(), and app.on('HEAD', …)
// creates a route that never matches, because Hono routes HEAD requests to GET
// handlers. A GET route therefore answers both HEAD and GET.
app.get('/api/upload-supplier', (c) => c.body(null, 204))

// POST /api/upload-supplier - Upload and parse supplier file
app.post('/api/upload-supplier', async (c) => {
  try {
    const auth = await getAuth(c)
    if (!auth) return c.json({ error: 'Authentication required', code: 'ERR_AUTH_REQUIRED' }, 401)
    if (!can(auth.user, 'productGrid')) {
      return c.json({ error: 'You do not have permission to use this page', code: 'ERR_PERMISSION_DENIED' }, 403)
    }

    const formData = await c.req.parseBody()
    const file = formData['file'] as File | undefined

    if (!file) {
      return c.json({ error: 'No file uploaded', code: 'ERR_NO_FILE' }, 400)
    }

    const extension = file.name.split('.').pop()?.toLowerCase()
    const buffer = await file.arrayBuffer()
    let result

    if (extension === 'csv' || extension === 'txt') {
      const text = new TextDecoder().decode(buffer)
      result = parserService.parseCSV(text)
    } else if (extension === 'xlsx' || extension === 'xls') {
      result = parserService.parseExcel(buffer)
    } else {
      return c.json({ error: `Unsupported format: .${extension}`, code: 'ERR_UNSUPPORTED_FORMAT' }, 400)
    }

    return c.json(result)
  } catch (error) {
    console.error('Upload error:', error)
    return c.json({ error: 'Failed to parse file', code: 'ERR_PARSE_FILE' }, 500)
  }
})

// POST /api/parse-supplier - Parse supplier info from JSON
app.post('/api/parse-supplier', async (c) => {
  try {
    const auth = await getAuth(c)
    if (!auth) return c.json({ error: 'Authentication required', code: 'ERR_AUTH_REQUIRED' }, 401)
    if (!can(auth.user, 'productGrid') && !can(auth.user, 'listingGenerator')) {
      return c.json({ error: 'You do not have permission to use this page', code: 'ERR_PERMISSION_DENIED' }, 403)
    }

    const { data } = await c.req.json()
    return c.json({ products: Array.isArray(data) ? data : [data] })
  } catch (error) {
    console.error('Parse error:', error)
    return c.json({ error: 'Failed to parse supplier data', code: 'ERR_PARSE_SUPPLIER' }, 500)
  }
})

// POST /api/generate-listing - Generate listing
app.post('/api/generate-listing', async (c) => {
  try {
    const auth = await getAuth(c)
    if (!auth) return c.json({ error: 'Authentication required', code: 'ERR_AUTH_REQUIRED' }, 401)
    if (!can(auth.user, 'listingGenerator')) {
      return c.json({ error: 'You do not have permission to use this page', code: 'ERR_PERMISSION_DENIED' }, 403)
    }

    const body = await c.req.json()
    const { productId, platform, template, productData, providerId, language } = body

    if (!productData) {
      return c.json({ error: 'productData is required', code: 'ERR_MISSING_PRODUCT_DATA' }, 400)
    }

    // The server owns model, temperature and max tokens. A client cannot raise
    // its own token budget or swap the model by editing the request.
    const resolved = await getModelConfigService().resolve(auth.user.id, providerId, c.env)

    if (!resolved) {
      if (auth.user.role !== 'admin') {
        console.log('[API] No model configured — demo listing')
        const demoListing = await deepseekService.generateListing(
          productData,
          (platform as Platform) || 'amazon',
          template || 'standard',
          undefined,
          language,
        )
        return c.json(demoListing)
      }
      return c.json(
        { error: 'API key is required. Please configure it in Model Manager.', code: 'ERR_NO_API_KEY' },
        400,
      )
    }

    const prompt = await buildGroundedPrompt(c, productData, platform, template, language)
    const options = {
      model: resolved.model,
      temperature: resolved.temperature,
      max_tokens: resolved.maxTokens,
      baseUrl: resolved.baseUrl,
      disableThinking: resolved.providerId === 'deepseek' || /deepseek/i.test(resolved.baseUrl),
    }

    const data = await modelService.callProviderAPI(
      resolved.providerId,
      resolved.apiKey,
      deepseekService.buildMessages(prompt, language),
      options,
    )

    if (!data) {
      return c.json({ error: 'AI API error. Please check your API key and model configuration.', code: 'ERR_AI_API' }, 502)
    }

    let listing = parseListing(data.choices?.[0]?.message?.content)

    // One corrective retry: a listing written in the wrong language is not
    // something the table can hold, and a second, stricter call is cheaper
    // than shipping it.
    if (deepseekService.hasLanguageDrift(listing, language)) {
      console.warn(
        `[API] Language drift (target=${language || 'english'}) — retrying once: "${listing.title.slice(0, 60)}"`,
      )
      const retry = await modelService.callProviderAPI(
        resolved.providerId,
        resolved.apiKey,
        deepseekService.buildMessages(prompt, language, { languageRetry: true }),
        // Low temperature: the retry must not rewrite the content, only the language.
        { ...options, temperature: 0.2 },
      )
      const repaired = retry ? parseListing(retry.choices?.[0]?.message?.content) : null
      if (repaired && (repaired.title || repaired.description)) {
        listing = repaired
      }
      if (deepseekService.hasLanguageDrift(listing, language)) {
        console.warn('[API] Language retry did not produce the target language')
      }
    }

    const ks = initKnowledgeService(c)
    const complianceResults = await ks.checkCompliance(
      [listing.title, ...listing.bulletPoints, listing.description].join(' '),
      platform,
    )

    return c.json({
      id: 'gen-' + Date.now(),
      productId,
      title: listing.title,
      bulletPoints: listing.bulletPoints,
      description: listing.description,
      keywords: listing.keywords,
      seoScore: 85,
      complianceResults,
      platform: platform || 'amazon',
      template: template || 'standard',
      version: 1,
      createdAt: new Date().toISOString(),
      isDemo: false,
    })
  } catch (error) {
    const handled = modelConfigFailure(c, error)
    if (handled) return handled
    console.error('Generate error:', error)
    return c.json({ error: 'Failed to generate listing', code: 'ERR_GENERATE_LISTING' }, 500)
  }
})

// POST /api/chat-listing - AI chat (SSE streaming)
app.post('/api/chat-listing', async (c) => {
  try {
    const auth = await getAuth(c)
    if (!auth) return c.json({ error: 'Authentication required', code: 'ERR_AUTH_REQUIRED' }, 401)
    if (!can(auth.user, 'listingGenerator')) {
      return c.json({ error: 'You do not have permission to use this page', code: 'ERR_PERMISSION_DENIED' }, 403)
    }

    const { messages, listingContext, providerId } = await c.req.json()

    if (!messages || !Array.isArray(messages)) {
      return c.json({ error: 'messages array is required', code: 'ERR_MISSING_MESSAGES' }, 400)
    }

    const resolved = await getModelConfigService().resolve(auth.user.id, providerId, c.env)
    if (!resolved) {
      return c.json({ error: 'API key is required.', code: 'ERR_NO_API_KEY' }, 400)
    }

    const systemMsg = listingContext
      ? `You are an e-commerce listing optimization assistant. The user is working on the following listing:\n\nTitle: ${listingContext.title || 'N/A'}\nPlatform: ${listingContext.platform || 'N/A'}\nBullet Points: ${(listingContext.bulletPoints || []).join(' | ')}\nDescription: ${listingContext.description || 'N/A'}\nKeywords: ${(listingContext.keywords || []).join(', ')}\nSEO Score: ${listingContext.seoScore || 'N/A'}\n\nHelp the user refine and improve this listing. Be concise and specific. When suggesting changes, quote the original text and show the improved version.`
      : 'You are an e-commerce listing optimization assistant. Help the user create and refine product listings. Be concise and specific.'

    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of modelService.callProviderAPIStream(
            resolved.providerId,
            resolved.apiKey,
            [
              { role: 'system', content: systemMsg },
              ...messages,
            ],
            {
              model: resolved.model,
              temperature: resolved.temperature,
              max_tokens: resolved.maxTokens,
              baseUrl: resolved.baseUrl,
            },
          )) {
            controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ type: 'chunk', content: chunk })}\n\n`))
          }

          controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`))
        } catch (err) {
          console.error('[SSE Chat] Stream error:', err)
          controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ type: 'error', message: 'Stream error' })}\n\n`))
        } finally {
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    })
  } catch (error) {
    console.error('Chat error:', error)
    return c.json({ error: 'Failed to process chat message', code: 'ERR_CHAT_FAILED' }, 500)
  }
})

// POST /api/chat-listing/apply - turn one optimisation direction into a full
// listing patch. Chat replies are prose; "apply" needs structured fields, so
// this is a separate, deterministic (low-temperature, JSON-only) call.
app.post('/api/chat-listing/apply', async (c) => {
  try {
    const auth = await getAuth(c)
    if (!auth) return c.json({ error: 'Authentication required', code: 'ERR_AUTH_REQUIRED' }, 401)
    if (!can(auth.user, 'listingGenerator')) {
      return c.json({ error: 'You do not have permission to use this page', code: 'ERR_PERMISSION_DENIED' }, 403)
    }

    const { direction, suggestion, listing, providerId } = await c.req.json()

    if (!direction || typeof direction !== 'string') {
      return c.json({ error: 'direction is required', code: 'ERR_MISSING_DIRECTION' }, 400)
    }
    if (!listing || typeof listing !== 'object') {
      return c.json({ error: 'listing is required', code: 'ERR_MISSING_LISTING' }, 400)
    }

    const resolved = await getModelConfigService().resolve(auth.user.id, providerId, c.env)
    if (!resolved) {
      return c.json({ error: 'API key is required.', code: 'ERR_NO_API_KEY' }, 400)
    }

    const current = {
      title: listing.title || '',
      bulletPoints: Array.isArray(listing.bulletPoints) ? listing.bulletPoints : [],
      description: listing.description || '',
      keywords: Array.isArray(listing.keywords) ? listing.keywords : [],
    }

    const systemMsg =
      'You are a senior e-commerce listing editor. Apply one optimisation direction to the current listing and return the complete updated listing.\n\n' +
      'Rules:\n' +
      '1. Change only the fields the direction requires; copy every untouched field verbatim.\n' +
      '2. Keep the original language of the listing unless the direction explicitly asks for another one.\n' +
      '3. bulletPoints must remain an array of exactly 5 strings; keywords must be an array of 5-10 strings.\n' +
      '4. Output STRICT JSON only - no markdown fences, no commentary.\n' +
      'JSON shape: {"title":"...","bulletPoints":["..."],"description":"...","keywords":["..."]}'

    const userMsg =
      `Current listing:\n${JSON.stringify(current, null, 2)}\n\n` +
      `Optimisation direction:\n${direction}\n` +
      (suggestion ? `\nThe assistant proposed these changes (apply them, do not repeat them):\n${suggestion}\n` : '') +
      '\nReturn the full updated listing as strict JSON.'

    const data = await modelService.callProviderAPI(
      resolved.providerId,
      resolved.apiKey,
      [
        { role: 'system', content: systemMsg },
        { role: 'user', content: userMsg },
      ],
      {
        model: resolved.model,
        // Structured rewrite: low temperature keeps untouched fields stable.
        temperature: 0.3,
        max_tokens: resolved.maxTokens,
        baseUrl: resolved.baseUrl,
        disableThinking:
          resolved.providerId === 'deepseek' || /deepseek/i.test(resolved.baseUrl),
      },
    )

    if (!data) {
      return c.json(
        { error: 'AI API error. Please check your API key and model configuration.', code: 'ERR_AI_API' },
        502,
      )
    }

    const text = data.choices?.[0]?.message?.content || ''
    const parsed = parseFinalJson(text)
    if (!parsed) {
      return c.json(
        { error: 'AI did not return a valid listing patch', code: 'ERR_APPLY_PARSE' },
        502,
      )
    }

    return c.json({ patch: normalizeListingFields(parsed) })
  } catch (error) {
    console.error('Chat apply error:', error)
    return c.json({ error: 'Failed to apply the suggestion', code: 'ERR_CHAT_FAILED' }, 500)
  }
})

// POST /api/check-compliance - Check compliance (RAG enhanced)
app.post('/api/check-compliance', async (c) => {
  try {
    const auth = await getAuth(c)
    if (!auth) return c.json({ error: 'Authentication required', code: 'ERR_AUTH_REQUIRED' }, 401)
    if (!can(auth.user, 'listingGenerator') && !can(auth.user, 'knowledgeBase')) {
      return c.json({ error: 'You do not have permission to use this page', code: 'ERR_PERMISSION_DENIED' }, 403)
    }

    const { text, platform } = await c.req.json()
    const ks = initKnowledgeService(c)
    const results = await ks.checkCompliance(text || '', platform)
    return c.json(results)
  } catch (error) {
    console.error('Compliance error:', error)
    return c.json({ error: 'Failed to check compliance', code: 'ERR_COMPLIANCE_CHECK' }, 500)
  }
})

// GET /api/templates - Get templates
app.get('/api/templates', (c) => {
  const platform = c.req.query('platform')
  const templates = [
    { id: 'standard', name: 'Standard Product Template', platforms: ['amazon', 'ebay', 'shopify', 'etsy'] },
    { id: 'enhanced', name: 'Enhanced A+ Content', platforms: ['amazon'] },
    { id: 'seo-optimized', name: 'SEO Optimized', platforms: ['shopify', 'etsy'] },
  ].filter((t) => !platform || t.platforms.includes(platform))
  return c.json({ templates })
})

// ════════════════════════════════════════════════════════════════════
// Knowledge Base routes (RAG)
// ════════════════════════════════════════════════════════════════════

// GET /api/knowledge/search - Semantic search
app.get('/api/knowledge/search', async (c) => {
  try {
    const auth = await getAuth(c)
    if (!auth) return c.json({ error: 'Authentication required', code: 'ERR_AUTH_REQUIRED' }, 401)
    if (!can(auth.user, 'knowledgeBase')) {
      return c.json({ error: 'You do not have permission to use this page', code: 'ERR_PERMISSION_DENIED' }, 403)
    }
    const query = c.req.query('query') || ''
    const platform = c.req.query('platform') || undefined
    const ks = initKnowledgeService(c)
    const results = await ks.searchKnowledge(query, { platform })
    return c.json({ results })
  } catch (error) {
    console.error('Knowledge search error:', error)
    return c.json({ error: 'Search failed', code: 'ERR_KNOWLEDGE_SEARCH' }, 500)
  }
})

// GET /api/knowledge/documents - List documents
app.get('/api/knowledge/documents', async (c) => {
  try {
    const auth = await getAuth(c)
    if (!auth) return c.json({ error: 'Authentication required', code: 'ERR_AUTH_REQUIRED' }, 401)
    if (!can(auth.user, 'knowledgeBase')) {
      return c.json({ error: 'You do not have permission to use this page', code: 'ERR_PERMISSION_DENIED' }, 403)
    }
    const category = c.req.query('category') || undefined
    const platform = c.req.query('platform') || undefined
    const ks = initKnowledgeService(c)
    const documents = await ks.listDocuments(category, platform)
    return c.json({ documents })
  } catch (error) {
    console.error('List documents error:', error)
    return c.json({ error: 'Failed to list documents', code: 'ERR_KNOWLEDGE_LIST' }, 500)
  }
})

// GET /api/knowledge/documents/:id - Get single document
app.get('/api/knowledge/documents/:id', async (c) => {
  try {
    const auth = await getAuth(c)
    if (!auth) return c.json({ error: 'Authentication required', code: 'ERR_AUTH_REQUIRED' }, 401)
    if (!can(auth.user, 'knowledgeBase')) {
      return c.json({ error: 'You do not have permission to use this page', code: 'ERR_PERMISSION_DENIED' }, 403)
    }
    const id = c.req.param('id')
    const ks = initKnowledgeService(c)
    const doc = await ks.getDocument(id)
    if (!doc) return c.json({ error: 'Document not found', code: 'ERR_NOT_FOUND' }, 404)
    return c.json({ document: doc })
  } catch (error) {
    console.error('Get document error:', error)
    return c.json({ error: 'Failed to get document', code: 'ERR_KNOWLEDGE_GET' }, 500)
  }
})

// POST /api/knowledge/upload - Upload & ingest document
app.post('/api/knowledge/upload', async (c) => {
  try {
    const auth = await getAuth(c)
    if (!auth) return c.json({ error: 'Authentication required', code: 'ERR_AUTH_REQUIRED' }, 401)
    if (auth.user.role !== 'admin') {
      return c.json({ error: 'Admin access required', code: 'ERR_ADMIN_REQUIRED' }, 403)
    }

    const formData = await c.req.parseBody()
    const file = formData['file'] as File | undefined
    const title = (formData['title'] as string) || file?.name || 'Untitled'
    const category = (formData['category'] as string) || 'platform_rules'
    const platform = (formData['platform'] as string) || undefined
    const tagsStr = (formData['tags'] as string) || '[]'

    let content: string
    if (file) {
      const extension = file.name.split('.').pop()?.toLowerCase()
      const buffer = await file.arrayBuffer()
      if (extension === 'txt' || extension === 'md') {
        content = new TextDecoder().decode(buffer)
      } else if (extension === 'pdf') {
        content = new TextDecoder().decode(buffer)
      } else if (extension === 'docx') {
        return c.json({ error: `Parsing .docx files is not supported in this environment`, code: 'ERR_PARSE_DOC' }, 400)
      } else {
        return c.json({ error: `Unsupported file type: .${extension}`, code: 'ERR_UNSUPPORTED_FORMAT' }, 400)
      }
    } else if (formData['content']) {
      content = formData['content'] as string
    } else {
      return c.json({ error: 'No file or content provided', code: 'ERR_NO_CONTENT' }, 400)
    }

    let tags: string[] = []
    try { tags = JSON.parse(tagsStr) } catch { tags = tagsStr.split(',').map((t: string) => t.trim()).filter(Boolean) }

    const ks = initKnowledgeService(c)
    const doc = await ks.ingestDocument(content, {
      title,
      category: category as any,
      platform: platform as any,
      tags,
      fileType: file?.name?.split('.').pop() ?? 'txt',
      fileSize: file?.size ?? Buffer.byteLength(content, 'utf8'),
    })

    return c.json({ document: doc }, 201)
  } catch (error) {
    console.error('Knowledge upload error:', error)
    return c.json({ error: 'Failed to upload document', code: 'ERR_KNOWLEDGE_UPLOAD' }, 500)
  }
})

// DELETE /api/knowledge/documents/:id - Delete document
app.delete('/api/knowledge/documents/:id', async (c) => {
  try {
    const auth = await getAuth(c)
    if (!auth) return c.json({ error: 'Authentication required', code: 'ERR_AUTH_REQUIRED' }, 401)
    if (auth.user.role !== 'admin') {
      return c.json({ error: 'Admin access required', code: 'ERR_ADMIN_REQUIRED' }, 403)
    }

    const id = c.req.param('id')
    const ks = initKnowledgeService(c)
    await ks.deleteDocument(id)
    return c.json({ success: true })
  } catch (error) {
    console.error('Delete document error:', error)
    return c.json({ error: 'Failed to delete document', code: 'ERR_KNOWLEDGE_DELETE' }, 500)
  }
})

// GET /api/knowledge/stats - Knowledge base statistics
app.get('/api/knowledge/stats', async (c) => {
  try {
    const auth = await getAuth(c)
    if (!auth) return c.json({ error: 'Authentication required', code: 'ERR_AUTH_REQUIRED' }, 401)
    if (!can(auth.user, 'knowledgeBase')) {
      return c.json({ error: 'You do not have permission to use this page', code: 'ERR_PERMISSION_DENIED' }, 403)
    }
    const ks = initKnowledgeService(c)
    const stats = await ks.getStats()
    return c.json(stats)
  } catch (error) {
    console.error('Knowledge stats error:', error)
    return c.json({ error: 'Failed to get stats', code: 'ERR_KNOWLEDGE_STATS' }, 500)
  }
})

// POST /api/knowledge/seed - Ingest the bundled platform policy documents
app.post('/api/knowledge/seed', async (c) => {
  try {
    const auth = await getAuth(c)
    if (!auth) return c.json({ error: 'Authentication required', code: 'ERR_AUTH_REQUIRED' }, 401)
    if (auth.user.role !== 'admin') {
      return c.json({ error: 'Admin access required', code: 'ERR_ADMIN_REQUIRED' }, 403)
    }

    const { seedKnowledgeBase, DEFAULT_SEED_BATCH } = await import('./services/knowledge/seed.js')
    // Batched: one request can't ingest the whole backlog without exhausting
    // the subrequest budget. Repeat with ?limit= while `remaining` is non-zero.
    const requested = parseInt(c.req.query('limit') ?? '', 10)
    const limit = Number.isFinite(requested) && requested > 0 ? requested : DEFAULT_SEED_BATCH
    const result = await seedKnowledgeBase(initKnowledgeService(c), { limit })
    return c.json({ success: true, ...result })
  } catch (error) {
    console.error('Knowledge seed error:', error)
    return c.json({ error: 'Seed failed', code: 'ERR_KNOWLEDGE_SEED' }, 500)
  }
})

// ════════════════════════════════════════════════════════════════════
// Product grid routes (Excel-like editor)
// ════════════════════════════════════════════════════════════════════

// GET /api/products - paged list for the grid. Auth is required: the table is
// internal supplier data, and the previous public read exposed every owner's
// rows to anonymous callers.
app.get('/api/products', async (c) => {
  try {
    const auth = await getAuth(c)
    if (!auth) return c.json({ error: 'Authentication required', code: 'ERR_AUTH_REQUIRED' }, 401)
    if (!can(auth.user, 'productGrid') && !can(auth.user, 'listingGenerator')) {
      return c.json({ error: 'You do not have permission to use this page', code: 'ERR_PERMISSION_DENIED' }, 403)
    }

    const page = Math.max(parseInt(c.req.query('page') || '1', 10) || 1, 1)
    const requested = parseInt(c.req.query('pageSize') || '100', 10) || 100
    const pageSize = Math.min(Math.max(requested, 1), 500)
    const query = c.req.query('q') || ''

    const svc = getProductService(c.env?.KNOWLEDGE_DB)
    const result = await svc.list({ page, pageSize, query })
    return c.json(result)
  } catch (error) {
    console.error('Product list error:', error)
    return c.json({ error: 'Failed to load products', code: 'ERR_PRODUCT_LIST' }, 500)
  }
})

// POST /api/products/batch - upsert + idempotent delete, one request per save.
// Anything that is not a whole valid row is rejected rather than partially
// written, so the client's baseline can never drift from the server.
app.post('/api/products/batch', async (c) => {
  const auth = await getAuth(c)
  if (!auth) {
    return c.json({ error: 'Authentication required', code: 'ERR_AUTH_REQUIRED' }, 401)
  }
  if (!can(auth.user, 'productGrid')) {
    return c.json({ error: 'You do not have permission to use this page', code: 'ERR_PERMISSION_DENIED' }, 403)
  }
  const actor = {
    userId: auth.user.id,
    userName: auth.user.username,
    isAdmin: auth.user.role === 'admin',
  }

  try {
    const body = await c.req.json().catch(() => ({}))
    const items = Array.isArray(body?.items) ? body.items : []
    const deletedIds = Array.isArray(body?.deletedIds)
      ? body.deletedIds.filter((id: unknown): id is string => typeof id === 'string')
      : []

    if (items.length === 0 && deletedIds.length === 0) {
      return c.json({ error: 'Nothing to save', code: 'ERR_EMPTY_BATCH' }, 400)
    }

    const svc = getProductService(c.env?.KNOWLEDGE_DB)
    const result = await svc.saveBatch({ actor, items, deletedIds })
    return c.json(result)
  } catch (error) {
    console.error('Product batch error:', error)
    const message = error instanceof Error ? error.message : 'Batch save failed'
    const status = /too many|invalid|must be/i.test(message) ? 400 : 500
    return c.json({ error: message, code: 'ERR_PRODUCT_BATCH' }, status)
  }
})

// GET /api/finance/summary — one row scan, aggregated server-side. The finance
// page is a single request no matter how many products the table holds.
app.get('/api/finance/summary', async (c) => {
  try {
    const auth = await getAuth(c)
    if (!auth) return c.json({ error: 'Authentication required', code: 'ERR_AUTH_REQUIRED' }, 401)
    if (!can(auth.user, 'finance')) {
      return c.json({ error: 'You do not have permission to use this page', code: 'ERR_PERMISSION_DENIED' }, 403)
    }

    const rows = await getProductService(c.env?.KNOWLEDGE_DB).financeRows(5000)
    return c.json(computeFinanceSummary(rows))
  } catch (error) {
    console.error('Finance summary error:', error)
    return c.json({ error: 'Failed to compute finance summary', code: 'ERR_FINANCE_SUMMARY' }, 500)
  }
})

// POST /api/export-listing - Export listing
app.post('/api/export-listing', async (c) => {
  try {
    const { listing, format } = await c.req.json()

    if (format === 'csv') {
      const csv = [
        'Title,Bullet Points,Description,Keywords,SEO Score',
        `"${listing.title}","${listing.bulletPoints.join(' | ')}","${listing.description.replace(/"/g, '""')}","${listing.keywords.join(', ')}",${listing.seoScore}`,
      ].join('\n')
      return new Response(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': 'attachment; filename="listing.csv"',
        },
      })
    }

    return c.json(listing)
  } catch (error) {
    console.error('Export error:', error)
    return c.json({ error: 'Failed to export listing', code: 'ERR_EXPORT' }, 500)
  }
})

// POST /api/generate-listing/stream - Streaming generate (SSE)
app.post('/api/generate-listing/stream', async (c) => {
  try {
    const auth = await getAuth(c)
    if (!auth) return c.json({ error: 'Authentication required', code: 'ERR_AUTH_REQUIRED' }, 401)
    if (!can(auth.user, 'listingGenerator')) {
      return c.json({ error: 'You do not have permission to use this page', code: 'ERR_PERMISSION_DENIED' }, 403)
    }

    const body = await c.req.json()
    const { productId, platform, template, productData, providerId, language } = body

    if (!productData) {
      return c.json({ error: 'productData is required', code: 'ERR_MISSING_PRODUCT_DATA' }, 400)
    }

    const sseHeaders = {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    }

    const resolved = await getModelConfigService().resolve(auth.user.id, providerId, c.env)

    if (!resolved) {
      if (auth.user.role === 'admin') {
        return c.json({ error: 'API key is required', code: 'ERR_NO_API_KEY' }, 400)
      }
      // No key configured: stream demo data (the frontend expects SSE).
      const stream = new ReadableStream({
        async start(controller) {
          const enc = new TextEncoder()
          await streamDemoSse((line) => controller.enqueue(enc.encode(line)), {
            productId,
            platform,
            template,
          })
          controller.close()
        },
      })
      return new Response(stream, { headers: sseHeaders })
    }

    const prompt = await buildGroundedPrompt(c, productData, platform, template, language)
    const provider = resolved.providerId
    const streamOptions = {
      model: resolved.model,
      temperature: resolved.temperature,
      max_tokens: resolved.maxTokens,
      baseUrl: resolved.baseUrl,
      disableThinking: provider === 'deepseek' || /deepseek/i.test(resolved.baseUrl),
    }

    // SSE streaming response: extract fields incrementally as the model generates.
    // String fields (title/description) stream live; array fields (bulletPoints/keywords)
    // are sent once when complete to avoid the frontend typewriter restarting.
    const stream = new ReadableStream({
      async start(controller) {
        const enc = new TextEncoder()
        const sse = (obj: unknown) =>
          controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`))

        let accumulated = ''
        const sent = new Map<string, unknown>()

        try {
          for await (const chunk of modelService.callProviderAPIStream(
            provider,
            resolved.apiKey,
            deepseekService.buildMessages(prompt, language),
            streamOptions,
          )) {
            accumulated += chunk
            const fields = extractListingFields(accumulated)
            for (const [field, value] of Object.entries(fields)) {
              if (field === 'bulletPoints' || field === 'keywords') {
                if (!sent.has(field)) {
                  sent.set(field, value)
                  sse({ type: 'field', field, value })
                }
              } else {
                if (sent.get(field) !== value) {
                  sent.set(field, value)
                  sse({ type: 'field', field, value })
                }
              }
            }
          }

          const parsed = parseFinalJson(accumulated)
          if (parsed) {
            let norm = normalizeListingFields(parsed)

            // The stream already pushed whatever the model wrote to the client, so
            // a wrong-language answer is repaired with one non-streaming call and
            // the corrected fields are re-sent before `done` — the client takes
            // `done` as the final listing, and the corrected values overwrite the
            // partials.
            if (deepseekService.hasLanguageDrift(norm, language)) {
              console.warn(
                `[SSE] Language drift (target=${language || 'english'}) — repairing: "${norm.title.slice(0, 60)}"`,
              )
              const retry = await modelService.callProviderAPI(
                provider,
                resolved.apiKey,
                deepseekService.buildMessages(prompt, language, { languageRetry: true }),
                {
                  ...streamOptions,
                  temperature: 0.2,
                },
              )
              const repaired = retry ? parseListing(retry.choices?.[0]?.message?.content) : null
              if (repaired && (repaired.title || repaired.description)) {
                norm = repaired
                for (const [field, value] of Object.entries(norm)) {
                  sse({ type: 'field', field, value })
                }
              }
              if (deepseekService.hasLanguageDrift(norm, language)) {
                console.warn('[SSE] Language repair did not produce the target language')
              }
            }

            const ks = initKnowledgeService(c)
            const complianceResults = await ks.checkCompliance(
              [norm.title, ...norm.bulletPoints, norm.description].join(' '),
              platform,
            )

            sse({
              type: 'done',
              listing: {
                id: 'gen-' + Date.now(),
                productId,
                title: norm.title,
                bulletPoints: norm.bulletPoints,
                description: norm.description,
                keywords: norm.keywords,
                seoScore: 85,
                platform: platform || 'amazon',
                template: template || 'standard',
                version: 1,
                createdAt: new Date().toISOString(),
                isDemo: false,
              },
              complianceResults,
            })
          } else {
            sse({ type: 'error', message: 'Failed to parse AI output' })
          }
        } catch (err) {
          console.error('[SSE] Stream error:', err)
          sse({ type: 'error', message: 'Stream error' })
        } finally {
          controller.close()
        }
      },
    })

    return new Response(stream, { headers: sseHeaders })
  } catch (error) {
    console.error('Stream generate error:', error)
    return c.json({ error: 'Failed to stream generate listing', code: 'ERR_STREAM_GENERATE' }, 500)
  }
})

// POST /api/client-error - Ingest frontend error reports (no auth: errors
// can happen before login). Fire-and-forget from the frontend; logged here.
app.post('/api/client-error', async (c) => {
  let body: Record<string, unknown> = {}
  try {
    body = await c.req.json()
  } catch {
    // ignore malformed body
  }
  const { message, stack, source, route, url, userAgent } = body
  if (!message) {
    return c.json({ error: 'message required' }, 400)
  }
  console.error(
    `[ClientError] ${source || 'app'} | ${route || url || ''} | ${message}\n${stack || ''} UA=${userAgent || ''}`,
  )
  return c.body(null, 204)
})

// ════════════════════════════════════════════════════════════════════
// Error handler
// ════════════════════════════════════════════════════════════════════
app.onError((err, c) => {
  if (err instanceof MissingSecretError) {
    return c.json({ error: 'Server auth is not configured', code: 'ERR_JWT_SECRET_MISSING' }, 503)
  }
  if (err instanceof SchemaMissingError) {
    return c.json({ error: err.message, code: 'ERR_DB_SCHEMA' }, 503)
  }
  if (err instanceof ConfigKeyMissingError) {
    return c.json(
      { error: 'Server configuration is incomplete: CONFIG_ENC_KEY is not set', code: 'ERR_CONFIG_KEY_MISSING' },
      503,
    )
  }
  console.error('[Worker] Unhandled error:', err)
  return c.json({ error: 'Internal server error', code: 'ERR_INTERNAL' }, 500)
})

// Worker + Assets: only handle API/health routes; everything else is static assets
export default {
  fetch: (request: Request, env: any, ctx: any) => {
    const url = new URL(request.url)
    if (url.pathname.startsWith('/api') || url.pathname === '/health' || url.pathname === '/') {
      // Bindings are per-request in a Worker; the services hold onto the D1
      // handle so usage, accounts and model configs use the same database.
      initModelService(env)
      getUserService().bindDatabase(env?.KNOWLEDGE_DB)
      getModelConfigService().bindDatabase(env?.KNOWLEDGE_DB)
      return app.fetch(request, env, ctx)
    }
    return env.ASSETS.fetch(request)
  },
}
