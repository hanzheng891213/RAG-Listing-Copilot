import { Hono } from 'hono'
import { cors } from 'hono/cors'
import bcrypt from 'bcryptjs'
import jwtSign from 'jsonwebtoken'
import type { User, JwtPayload } from './types/auth.js'
import type { Platform } from './types/index.js'
import { parserService } from './services/parser/parserService.js'
import { deepseekService } from './services/deepseek/deepseekService.js'
import { ragService } from './services/rag/ragService.js'
import { modelService } from './services/model/modelService.js'
import { getKnowledgeService, resetKnowledgeService } from './services/knowledge/knowledgeService.js'

type Bindings = {
  KNOWLEDGE_INDEX: any
  KNOWLEDGE_DB: any
  AI: any
}

const app = new Hono<{ Bindings: Bindings }>()

// ─── CORS ──────────────────────────────────────────────────────────
app.use('*', cors())

// ─── JWT Secret ────────────────────────────────────────────────────
const JWT_SECRET = 'rag-copilot-jwt-secret-2026-dev'

// ─── Knowledge Service (lazy init with bindings) ───────────────────
function initKnowledgeService(c: any) {
  const env = c.env ?? {}
  return getKnowledgeService({
    aiBinding: env.AI,
    vectorizeBinding: env.KNOWLEDGE_INDEX,
    d1Binding: env.KNOWLEDGE_DB,
  })
}

// ─── In-memory user store ──────────────────────────────────────────
const userStore = new Map<string, User>()

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
}

initUsers()

// ─── Auth helpers ──────────────────────────────────────────────────
function generateToken(user: User): string {
  const payload: JwtPayload = {
    userId: user.id,
    username: user.username,
    role: user.role,
  }
  return jwtSign.sign(payload, JWT_SECRET, { expiresIn: '7d' })
}

function sanitizeUser(user: User) {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    apiCallCount: user.apiCallCount,
    createdAt: user.createdAt,
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
app.post('/api/auth/login', async (c) => {
  try {
    const { username, password } = await c.req.json()

    if (!username || !password) {
      return c.json({ error: 'Username and password are required', code: 'ERR_MISSING_CREDENTIALS' }, 400)
    }

    const user = Array.from(userStore.values()).find(
      (u) => u.username.toLowerCase() === username.toLowerCase()
    )

    if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
      return c.json({ error: 'Invalid username or password', code: 'ERR_INVALID_CREDENTIALS' }, 401)
    }

    return c.json({
      token: generateToken(user),
      user: sanitizeUser(user),
    })
  } catch (error) {
    console.error('Login error:', error)
    return c.json({ error: 'Login failed', code: 'ERR_LOGIN_FAILED' }, 500)
  }
})

app.get('/api/auth/me', async (c) => {
  const authHeader = c.req.header('Authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) {
    return c.json({ error: 'Authentication required', code: 'ERR_AUTH_REQUIRED' }, 401)
  }

  try {
    const payload = jwtSign.verify(token, JWT_SECRET) as JwtPayload
    const user = userStore.get(payload.userId)
    if (!user) {
      return c.json({ error: 'User not found', code: 'ERR_USER_NOT_FOUND' }, 404)
    }
    return c.json(sanitizeUser(user))
  } catch {
    return c.json({ error: 'Invalid or expired token', code: 'ERR_INVALID_TOKEN' }, 401)
  }
})

// ════════════════════════════════════════════════════════════════════
// Model routes
// ════════════════════════════════════════════════════════════════════
app.get('/api/models/providers', (c) => {
  const providers = modelService.getBuiltinProviders()
  return c.json({ providers })
})

app.get('/api/models/usage/stats', (c) => {
  const days = parseInt(c.req.query('days') || '30')
  const stats = modelService.getUsageStats(days)
  return c.json(stats)
})

// ════════════════════════════════════════════════════════════════════
// API routes
// ════════════════════════════════════════════════════════════════════

// POST /api/upload-supplier - Upload and parse supplier file
app.post('/api/upload-supplier', async (c) => {
  try {
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
    const body = await c.req.json()
    const { productId, platform, template, productData, providerId, language, apiKey, model, temperature, maxTokens } = body

    if (!productData) {
      return c.json({ error: 'productData is required', code: 'ERR_MISSING_PRODUCT_DATA' }, 400)
    }

    // Get user role from JWT if present
    const authHeader = c.req.header('Authorization')
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
    let isAdmin = false
    if (token) {
      try {
        const payload = jwtSign.verify(token, JWT_SECRET) as JwtPayload
        isAdmin = payload.role === 'admin'
      } catch { /* ignore */ }
    }

    // Non-admin: demo data
    if (!isAdmin) {
      console.log('[API] Visitor generate — forcing demo mode')
      const demoListing = await deepseekService.generateListing(
        productData,
        (platform as Platform) || 'amazon',
        template || 'standard',
        undefined,
      )
      return c.json(demoListing)
    }

    // Admin: apiKey required
    if (!apiKey) {
      return c.json({ error: 'API key is required. Please configure it in Model Manager.', code: 'ERR_NO_API_KEY' }, 400)
    }

    console.log('[API] Admin generate — provider:', providerId, 'model:', model)
    try {
      const prompt = deepseekService.buildPromptForProvider(productData, platform as Platform, template, language)

      const systemMsg = language && language !== 'english'
        ? `You are a helpful e-commerce listing assistant. Respond in JSON format with: title, bulletPoints (array of 5 strings), description, keywords (array of strings). All content MUST be written in ${language}.`
        : 'You are a helpful e-commerce listing assistant. Respond in JSON format with: title, bulletPoints (array of 5 strings), description, keywords (array of strings).'

      const data = await modelService.callProviderAPI(
        providerId || 'deepseek',
        apiKey,
        [
          { role: 'system', content: systemMsg },
          { role: 'user', content: prompt },
        ],
        { model, temperature, max_tokens: maxTokens },
      )

      if (!data) {
        return c.json({ error: 'AI API error. Please check your API key and model configuration.', code: 'ERR_AI_API' }, 502)
      }

      const content = data.choices[0]?.message?.content || '{}'
      const parsed = JSON.parse(content)

      const ks = initKnowledgeService(c)
      const complianceResults = await ks.checkCompliance(
        [parsed.title, ...parsed.bulletPoints, parsed.description].join(' '),
        platform,
      )

      return c.json({
        id: 'gen-' + Date.now(),
        productId,
        title: parsed.title,
        bulletPoints: parsed.bulletPoints,
        description: parsed.description,
        keywords: parsed.keywords,
        seoScore: 85,
        complianceResults,
        platform: platform || 'amazon',
        template: template || 'standard',
        version: 1,
        createdAt: new Date().toISOString(),
        isDemo: false,
      })
    } catch (err) {
      console.error('[API] Generate failed:', err)
      return c.json({ error: 'Failed to generate listing', code: 'ERR_GENERATE_LISTING' }, 500)
    }
  } catch (error) {
    console.error('Generate error:', error)
    return c.json({ error: 'Failed to generate listing', code: 'ERR_GENERATE_LISTING' }, 500)
  }
})

// POST /api/chat-listing - AI chat (SSE streaming)
app.post('/api/chat-listing', async (c) => {
  try {
    const { messages, listingContext, providerId, apiKey, model, temperature, maxTokens } = await c.req.json()

    if (!messages || !Array.isArray(messages)) {
      return c.json({ error: 'messages array is required', code: 'ERR_MISSING_MESSAGES' }, 400)
    }

    if (!apiKey) {
      return c.json({ error: 'API key is required.', code: 'ERR_NO_API_KEY' }, 400)
    }

    const systemMsg = listingContext
      ? `You are an e-commerce listing optimization assistant. The user is working on the following listing:\n\nTitle: ${listingContext.title || 'N/A'}\nPlatform: ${listingContext.platform || 'N/A'}\nBullet Points: ${(listingContext.bulletPoints || []).join(' | ')}\nDescription: ${listingContext.description || 'N/A'}\nKeywords: ${(listingContext.keywords || []).join(', ')}\nSEO Score: ${listingContext.seoScore || 'N/A'}\n\nHelp the user refine and improve this listing. Be concise and specific. When suggesting changes, quote the original text and show the improved version.`
      : 'You are an e-commerce listing optimization assistant. Help the user create and refine product listings. Be concise and specific.'

    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of modelService.callProviderAPIStream(
            providerId || 'deepseek',
            apiKey,
            [
              { role: 'system', content: systemMsg },
              ...messages,
            ],
            { model, temperature, max_tokens: maxTokens },
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

// POST /api/check-compliance - Check compliance (RAG enhanced)
app.post('/api/check-compliance', async (c) => {
  try {
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
        // Dynamic import for pdf-parse (not used in worker context currently)
        try {
          const pdfParse = (await import('pdf-parse')).default
          const result = await pdfParse(Buffer.from(buffer))
          content = result.text
        } catch {
          content = new TextDecoder().decode(buffer)
        }
      } else if (extension === 'docx') {
        try {
          const mammoth = (await import('mammoth')).default
          const result = await mammoth.extractRawText({ buffer: Buffer.from(buffer) })
          content = result.value
        } catch {
          return c.json({ error: `Failed to parse .${extension} file`, code: 'ERR_PARSE_DOC' }, 400)
        }
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
    const ks = initKnowledgeService(c)
    const stats = await ks.getStats()
    return c.json(stats)
  } catch (error) {
    console.error('Knowledge stats error:', error)
    return c.json({ error: 'Failed to get stats', code: 'ERR_KNOWLEDGE_STATS' }, 500)
  }
})

// POST /api/knowledge/seed - Seed knowledge base from local markdown files
app.post('/api/knowledge/seed', async (c) => {
  try {
    // Dynamic import for seed (uses fs, only works in wrangler dev / Express)
    const { seedKnowledgeBase } = await import('./services/knowledge/seed.js')
    const count = await seedKnowledgeBase()
    return c.json({ success: true, count })
  } catch (error) {
    console.error('Knowledge seed error:', error)
    return c.json({ error: 'Seed failed (only available in dev mode)', code: 'ERR_KNOWLEDGE_SEED' }, 500)
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
    const body = await c.req.json()
    const { productId, platform, template, productData, providerId, language, apiKey, model, temperature, maxTokens } = body

    if (!productData) {
      return c.json({ error: 'productData is required', code: 'ERR_MISSING_PRODUCT_DATA' }, 400)
    }

    // Get user role from JWT
    const authHeader = c.req.header('Authorization')
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
    let isAdmin = false
    if (token) {
      try {
        const payload = jwtSign.verify(token, JWT_SECRET) as JwtPayload
        isAdmin = payload.role === 'admin'
      } catch { /* ignore */ }
    }

    if (!isAdmin) {
      // Non-admin: return demo data
      return c.json({
        id: 'gen-' + Date.now(),
        productId,
        title: 'Demo Title',
        bulletPoints: ['Demo point 1', 'Demo point 2'],
        description: 'Demo description',
        keywords: ['demo'],
        seoScore: 85,
        complianceResults: [],
        platform: platform || 'amazon',
        template: template || 'standard',
        version: 1,
        createdAt: new Date().toISOString(),
        isDemo: true,
      })
    }

    if (!apiKey) {
      return c.json({ error: 'API key is required', code: 'ERR_NO_API_KEY' }, 400)
    }

    const prompt = deepseekService.buildPromptForProvider(productData, platform as Platform, template, language)

    const systemMsg = language && language !== 'english'
      ? `You are a helpful e-commerce listing assistant. Respond in JSON format with: title, bulletPoints (array of 5 strings), description, keywords (array of strings). All content MUST be written in ${language}.`
      : 'You are a helpful e-commerce listing assistant. Respond in JSON format with: title, bulletPoints (array of 5 strings), description, keywords (array of strings).'

    // SSE streaming response
    const stream = new ReadableStream({
      async start(controller) {
        let accumulated = ''
        let sentFields = new Set<string>()
        let lastParse: any = null

        function trySendFields() {
          try {
            const parsed = JSON.parse(accumulated)
            if (!parsed || typeof parsed !== 'object') return

            const fields: [string, string][] = [['title', 'string'], ['description', 'string']]
            const arrayFields: [string, string][] = [['bulletPoints', 'array'], ['keywords', 'array']]

            for (const [field] of fields) {
              if (!sentFields.has(field) && typeof parsed[field] === 'string' && parsed[field].length > 3) {
                sentFields.add(field)
                controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ type: 'field', field, value: parsed[field] })}\n\n`))
              }
            }

            for (const [field, type] of arrayFields) {
              if (!sentFields.has(field) && Array.isArray(parsed[field]) && parsed[field].length > 0) {
                sentFields.add(field)
                controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ type: 'field', field, value: parsed[field] })}\n\n`))
              }
            }

            lastParse = parsed
          } catch {
            // not yet valid JSON
          }
        }

        try {
          for await (const chunk of modelService.callProviderAPIStream(
            providerId || 'deepseek',
            apiKey,
            [
              { role: 'system', content: systemMsg },
              { role: 'user', content: prompt },
            ],
            { model, temperature, max_tokens: maxTokens },
          )) {
            accumulated += chunk
            trySendFields()
          }

          if (lastParse) {
            const ks = initKnowledgeService(c)
            const complianceResults = await ks.checkCompliance(
              [lastParse.title || '', ...(lastParse.bulletPoints || []), lastParse.description || ''].join(' '),
              platform,
            )

            controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({
              type: 'done',
              listing: {
                id: 'gen-' + Date.now(),
                productId,
                title: lastParse.title,
                bulletPoints: lastParse.bulletPoints,
                description: lastParse.description,
                keywords: lastParse.keywords,
                seoScore: 85,
                platform: platform || 'amazon',
                template: template || 'standard',
                version: 1,
                createdAt: new Date().toISOString(),
                isDemo: false,
              },
              complianceResults,
            })}\n\n`))
          } else {
            controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ type: 'error', message: 'Failed to parse AI output' })}\n\n`))
          }
        } catch (err) {
          console.error('[SSE] Stream error:', err)
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
    console.error('Stream generate error:', error)
    return c.json({ error: 'Failed to stream generate listing', code: 'ERR_STREAM_GENERATE' }, 500)
  }
})

// ════════════════════════════════════════════════════════════════════
// 404 handler
// ════════════════════════════════════════════════════════════════════
app.notFound((c) => {
  return c.json({ error: 'Not found', code: 'ERR_NOT_FOUND' }, 404)
})

// ════════════════════════════════════════════════════════════════════
// Error handler
// ════════════════════════════════════════════════════════════════════
app.onError((err, c) => {
  console.error('[Worker] Unhandled error:', err)
  return c.json({ error: 'Internal server error', code: 'ERR_INTERNAL' }, 500)
})

export default app
