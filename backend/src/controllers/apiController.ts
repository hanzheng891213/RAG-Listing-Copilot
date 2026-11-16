import { Router, type Request, type Response } from 'express'
import multer from 'multer'
import { parserService } from '../services/parser/parserService.js'
import { deepseekService } from '../services/deepseek/deepseekService.js'
import { ragService } from '../services/rag/ragService.js'
import { modelService } from '../services/model/modelService.js'
import { getKnowledgeService, type KnowledgeService } from '../services/knowledge/knowledgeService.js'
import { getModelConfigService } from '../services/model/modelConfigService.js'
import { ConfigError } from '../services/model/modelConfigService.js'
import { ConfigKeyMissingError } from '../services/model/configCrypto.js'
import { SchemaMissingError } from '../services/auth/userService.js'
import type { Platform } from '../types/index.js'
import type { AuthedRequest } from '../middleware/authMiddleware.js'
import { extractListingFields, normalizeListingFields, parseFinalJson, streamDemoSse, type NormalizedListing } from '../utils/listingStream.js'

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
})

const router = Router()

function getKs(): KnowledgeService {
  return getKnowledgeService() // Express: no Cloudflare bindings → local fallback
}

/**
 * Retrieves the platform rules matching this product, then builds the
 * generation prompt around them. Retrieval failing only costs grounding — the
 * prompt builder falls back to its built-in rule list.
 */
async function buildGroundedPrompt(
  productData: any,
  platform: any,
  template: any,
  language: any,
): Promise<string> {
  const knowledge = await getKs().buildPromptContext(
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

function actorOf(req: Request): { id: string; role: 'admin' | 'user'; permissions: string[] } {
  const user = (req as AuthedRequest).authUser
  return {
    id: user?.id ?? '',
    role: user?.role === 'admin' ? 'admin' : 'user',
    permissions: user?.permissions ?? [],
  }
}

function can(req: Request, permission: string): boolean {
  const actor = actorOf(req)
  return actor.role === 'admin' || actor.permissions.includes(permission)
}

function configFailure(res: Response, err: unknown): boolean {
  if (err instanceof ConfigError) {
    res.status(err.status).json({ error: err.message, code: err.code })
    return true
  }
  if (err instanceof ConfigKeyMissingError) {
    res.status(503).json({
      error: 'Server configuration is incomplete: CONFIG_ENC_KEY is not set',
      code: 'ERR_CONFIG_KEY_MISSING',
    })
    return true
  }
  if (err instanceof SchemaMissingError) {
    res.status(503).json({ error: err.message, code: 'ERR_DB_SCHEMA' })
    return true
  }
  return false
}

/** Model output → the four listing fields, tolerating code fences. */
function parseListing(content?: string): NormalizedListing {
  return normalizeListingFields(parseFinalJson(content || '') ?? {})
}

// GET /api/upload-supplier - endpoint-existence probe for the frontend.
// Express routes HEAD to GET handlers, so this answers both; without it the
// frontend's HEAD probe gets a 404 and aborts the upload.
router.get('/upload-supplier', (_req: Request, res: Response) => {
  res.status(204).end()
})

// POST /api/upload-supplier - Upload and parse supplier file
router.post('/upload-supplier', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded', code: 'ERR_NO_FILE' })
      return
    }

    const file = req.file
    const extension = file.originalname.split('.').pop()?.toLowerCase()
    let result

    if (extension === 'csv' || extension === 'txt') {
      result = parserService.parseCSV(file.buffer.toString('utf-8'))
    } else if (extension === 'xlsx' || extension === 'xls') {
      result = parserService.parseExcel(file.buffer)
    } else {
      res.status(400).json({ error: `Unsupported format: .${extension}`, code: 'ERR_UNSUPPORTED_FORMAT' })
      return
    }

    res.json(result)
  } catch (error) {
    console.error('Upload error:', error)
    res.status(500).json({ error: 'Failed to parse file', code: 'ERR_PARSE_FILE' })
  }
})

// POST /api/parse-supplier - Parse supplier info from JSON
router.post('/parse-supplier', (req: Request, res: Response) => {
  try {
    const { data } = req.body
    res.json({ products: Array.isArray(data) ? data : [data] })
  } catch (error) {
    console.error('Parse error:', error)
    res.status(500).json({ error: 'Failed to parse supplier data', code: 'ERR_PARSE_SUPPLIER' })
  }
})

// POST /api/generate-listing - Generate listing
// The API key never travels with the request: providerId selects the caller's
// encrypted config, and the server decrypts it for this call only.
router.post('/generate-listing', async (req: Request, res: Response) => {
  try {
    const actor = actorOf(req)
    if (!can(req, 'listingGenerator')) {
      res.status(403).json({ error: 'You do not have permission to use this page', code: 'ERR_PERMISSION_DENIED' })
      return
    }

    const { productId, platform, template, productData, providerId, language } = req.body

    if (!productData) {
      res.status(400).json({ error: 'productData is required', code: 'ERR_MISSING_PRODUCT_DATA' })
      return
    }

    const resolved = await getModelConfigService().resolve(actor.id, providerId)
    if (!resolved) {
      if (actor.role !== 'admin') {
        console.log('[API] No model configured — demo listing')
        const demoListing = await deepseekService.generateListing(
          productData,
          (platform as Platform) || 'amazon',
          template || 'standard',
          undefined,
          language,
        )
        res.json(demoListing)
        return
      }
      res.status(400).json({ error: 'API key is required. Please configure it in Model Manager.', code: 'ERR_NO_API_KEY' })
      return
    }

    const prompt = await buildGroundedPrompt(productData, platform, template, language)
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
      res.status(502).json({ error: 'AI API error. Please check your API key and model configuration.', code: 'ERR_AI_API' })
      return
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

    const ks = getKs()
    const complianceResults = await ks.checkCompliance(
      [listing.title, ...listing.bulletPoints, listing.description].join(' '),
      platform,
    )

    res.json({
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
    if (configFailure(res, error)) return
    console.error('Generate error:', error)
    res.status(500).json({ error: 'Failed to generate listing', code: 'ERR_GENERATE_LISTING' })
  }
})

// POST /api/chat-listing - AI chat (SSE streaming)
// The key is resolved from the caller's encrypted config; it is never sent in
// the request body or returned to the browser.
router.post('/chat-listing', async (req: Request, res: Response) => {
  if (!can(req, 'listingGenerator')) {
    res.status(403).json({ error: 'You do not have permission to use this page', code: 'ERR_PERMISSION_DENIED' })
    return
  }

  try {
    const actor = actorOf(req)
    const { messages, listingContext, providerId } = req.body

    if (!messages || !Array.isArray(messages)) {
      res.status(400).json({ error: 'messages array is required', code: 'ERR_MISSING_MESSAGES' })
      return
    }

    const resolved = await getModelConfigService().resolve(actor.id, providerId)
    if (!resolved) {
      res.status(400).json({ error: 'API key is required.', code: 'ERR_NO_API_KEY' })
      return
    }

    const systemMsg = listingContext
      ? `You are an e-commerce listing optimization assistant. The user is working on the following listing:\n\nTitle: ${listingContext.title || 'N/A'}\nPlatform: ${listingContext.platform || 'N/A'}\nBullet Points: ${(listingContext.bulletPoints || []).join(' | ')}\nDescription: ${listingContext.description || 'N/A'}\nKeywords: ${(listingContext.keywords || []).join(', ')}\nSEO Score: ${listingContext.seoScore || 'N/A'}\n\nHelp the user refine and improve this listing. Be concise and specific. When suggesting changes, quote the original text and show the improved version.`
      : 'You are an e-commerce listing optimization assistant. Help the user create and refine product listings. Be concise and specific.'

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')
    res.flushHeaders()

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
        res.write(`data: ${JSON.stringify({ type: 'chunk', content: chunk })}\n\n`)
      }

      res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`)
    } catch (err) {
      console.error('[SSE Chat] Stream error:', err)
      res.write(`data: ${JSON.stringify({ type: 'error', message: 'Stream error' })}\n\n`)
    } finally {
      res.end()
    }
  } catch (error) {
    if (configFailure(res, error)) return
    console.error('Chat error:', error)
    res.status(500).json({ error: 'Failed to process chat message', code: 'ERR_CHAT_FAILED' })
  }
})

// POST /api/chat-listing/apply - turn one optimisation direction into a full
// listing patch. Chat replies are prose; "apply" needs structured fields, so
// this is a separate, deterministic (low-temperature, JSON-only) call.
router.post('/chat-listing/apply', async (req: Request, res: Response) => {
  if (!can(req, 'listingGenerator')) {
    res.status(403).json({ error: 'You do not have permission to use this page', code: 'ERR_PERMISSION_DENIED' })
    return
  }

  try {
    const actor = actorOf(req)
    const { direction, suggestion, listing, providerId } = req.body

    if (!direction || typeof direction !== 'string') {
      res.status(400).json({ error: 'direction is required', code: 'ERR_MISSING_DIRECTION' })
      return
    }
    if (!listing || typeof listing !== 'object') {
      res.status(400).json({ error: 'listing is required', code: 'ERR_MISSING_LISTING' })
      return
    }

    const resolved = await getModelConfigService().resolve(actor.id, providerId)
    if (!resolved) {
      res.status(400).json({ error: 'API key is required.', code: 'ERR_NO_API_KEY' })
      return
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
      res.status(502).json({
        error: 'AI API error. Please check your API key and model configuration.',
        code: 'ERR_AI_API',
      })
      return
    }

    const text = data.choices?.[0]?.message?.content || ''
    const parsed = parseFinalJson(text)
    if (!parsed) {
      res.status(502).json({
        error: 'AI did not return a valid listing patch',
        code: 'ERR_APPLY_PARSE',
      })
      return
    }

    res.json({ patch: normalizeListingFields(parsed) })
  } catch (error) {
    if (configFailure(res, error)) return
    console.error('Chat apply error:', error)
    res.status(500).json({ error: 'Failed to apply the suggestion', code: 'ERR_CHAT_FAILED' })
  }
})

// POST /api/check-compliance - Check compliance (RAG enhanced)
router.post('/check-compliance', async (req: Request, res: Response) => {
  try {
    const { text, platform } = req.body
    const ks = getKs()
    const results = await ks.checkCompliance(text || '', platform)
    res.json(results)
  } catch (error) {
    console.error('Compliance error:', error)
    res.status(500).json({ error: 'Failed to check compliance', code: 'ERR_COMPLIANCE_CHECK' })
  }
})

// POST /api/generate-listing/stream - Streaming generate listing (SSE)
router.post('/generate-listing/stream', async (req: Request, res: Response) => {
  try {
    if (!can(req, 'listingGenerator')) {
      res.status(403).json({ error: 'You do not have permission to use this page', code: 'ERR_PERMISSION_DENIED' })
      return
    }

    const actor = actorOf(req)
    const { productId, platform, template, productData, providerId, language } = req.body

    if (!productData) {
      res.status(400).json({ error: 'productData is required', code: 'ERR_MISSING_PRODUCT_DATA' })
      return
    }

    const resolved = await getModelConfigService().resolve(actor.id, providerId)

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')
    res.flushHeaders()

    if (!resolved) {
      if (actor.role === 'admin') {
        res.write(`data: ${JSON.stringify({ type: 'error', message: 'API key is required. Please configure it in Model Manager.' })}\n\n`)
        res.end()
        return
      }
      // No key configured: stream demo data as SSE (the frontend expects SSE).
      await streamDemoSse((line) => res.write(line), {
        productId,
        platform,
        template,
      })
      res.end()
      return
    }

    const prompt = await buildGroundedPrompt(productData, platform, template, language)
    const provider = resolved.providerId
    const streamOptions = {
      model: resolved.model,
      temperature: resolved.temperature,
      max_tokens: resolved.maxTokens,
      baseUrl: resolved.baseUrl,
      disableThinking: provider === 'deepseek' || /deepseek/i.test(resolved.baseUrl),
    }

    const sse = (obj: unknown) => res.write(`data: ${JSON.stringify(obj)}\n\n`)

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

      // Final parse to get complete data
      const parsed = parseFinalJson(accumulated)
      if (parsed) {
        let norm = normalizeListingFields(parsed)

        // The stream already pushed whatever the model wrote to the client, so a
        // wrong-language answer is repaired with one non-streaming call and the
        // corrected fields are re-sent before `done` — the client takes `done`
        // as the final listing, and the corrected values overwrite the partials.
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

        const ks = getKs()
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
      res.end()
    }
  } catch (error) {
    if (configFailure(res, error)) return
    console.error('Stream generate error:', error)
    res.status(500).json({ error: 'Failed to stream generate listing', code: 'ERR_STREAM_GENERATE' })
  }
})

// GET /api/templates - Get templates
router.get('/templates', (req: Request, res: Response) => {
  const { platform } = req.query
  res.json({
    templates: [
      { id: 'standard', name: 'Standard Product Template', platforms: ['amazon', 'ebay', 'shopify', 'etsy'] },
      { id: 'enhanced', name: 'Enhanced A+ Content', platforms: ['amazon'] },
      { id: 'seo-optimized', name: 'SEO Optimized', platforms: ['shopify', 'etsy'] },
    ].filter((t) => !platform || t.platforms.includes(platform as string)),
  })
})

// ════════════════════════════════════════════════════════════════════
// Knowledge Base routes (RAG)
// ════════════════════════════════════════════════════════════════════

// GET /api/knowledge/search - Semantic search
router.get('/knowledge/search', async (req: Request, res: Response) => {
  try {
    const { query, platform } = req.query
    const ks = getKs()
    const results = await ks.searchKnowledge((query as string) || '', {
      platform: platform as string | undefined,
    })
    res.json({ results })
  } catch (error) {
    console.error('Knowledge search error:', error)
    res.status(500).json({ error: 'Search failed', code: 'ERR_KNOWLEDGE_SEARCH' })
  }
})

// GET /api/knowledge/documents - List documents
router.get('/knowledge/documents', async (req: Request, res: Response) => {
  try {
    const { category, platform } = req.query
    const ks = getKs()
    const documents = await ks.listDocuments(
      category as string | undefined,
      platform as string | undefined,
    )
    res.json({ documents })
  } catch (error) {
    console.error('List documents error:', error)
    res.status(500).json({ error: 'Failed to list documents', code: 'ERR_KNOWLEDGE_LIST' })
  }
})

// GET /api/knowledge/documents/:id - Get single document
router.get('/knowledge/documents/:id', async (req: Request, res: Response) => {
  try {
    const ks = getKs()
    const doc = await ks.getDocument(req.params.id as string)
    if (!doc) {
      res.status(404).json({ error: 'Document not found', code: 'ERR_NOT_FOUND' })
      return
    }
    res.json({ document: doc })
  } catch (error) {
    console.error('Get document error:', error)
    res.status(500).json({ error: 'Failed to get document', code: 'ERR_KNOWLEDGE_GET' })
  }
})

// POST /api/knowledge/upload - Upload & ingest document
router.post('/knowledge/upload', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const { title, category, platform, tags: tagsStr } = req.body
    let content: string

    if (req.file) {
      const extension = req.file.originalname.split('.').pop()?.toLowerCase()
      const buffer = req.file.buffer

      if (extension === 'txt' || extension === 'md') {
        content = buffer.toString('utf-8')
      } else if (extension === 'pdf') {
        try {
          const pdfParse = (await import('pdf-parse')).default
          const result = await pdfParse(buffer)
          content = result.text
        } catch {
          content = buffer.toString('utf-8')
        }
      } else if (extension === 'docx') {
        try {
          const mammoth = (await import('mammoth')).default
          const result = await mammoth.extractRawText({ buffer })
          content = result.value
        } catch {
          res.status(400).json({ error: `Failed to parse .${extension} file`, code: 'ERR_PARSE_DOC' })
          return
        }
      } else {
        res.status(400).json({ error: `Unsupported file type: .${extension}`, code: 'ERR_UNSUPPORTED_FORMAT' })
        return
      }
    } else if (req.body.content) {
      content = req.body.content
    } else {
      res.status(400).json({ error: 'No file or content provided', code: 'ERR_NO_CONTENT' })
      return
    }

    let tags: string[] = []
    try {
      tags = typeof tagsStr === 'string' ? JSON.parse(tagsStr) : (tagsStr || [])
    } catch {
      tags = (tagsStr || '').split(',').map((t: string) => t.trim()).filter(Boolean)
    }

    const ks = getKs()
    const doc = await ks.ingestDocument(content, {
      title: title || req.file?.originalname || 'Untitled',
      category: category || 'platform_rules',
      platform: platform || undefined,
      tags,
      fileType: req.file?.originalname?.split('.').pop() ?? 'txt',
      fileSize: req.file?.size ?? Buffer.byteLength(content, 'utf8'),
    })

    res.status(201).json({ document: doc })
  } catch (error) {
    console.error('Knowledge upload error:', error)
    res.status(500).json({ error: 'Failed to upload document', code: 'ERR_KNOWLEDGE_UPLOAD' })
  }
})

// DELETE /api/knowledge/documents/:id - Delete document
router.delete('/knowledge/documents/:id', async (req: Request, res: Response) => {
  try {
    const ks = getKs()
    await ks.deleteDocument(req.params.id as string)
    res.json({ success: true })
  } catch (error) {
    console.error('Delete document error:', error)
    res.status(500).json({ error: 'Failed to delete document', code: 'ERR_KNOWLEDGE_DELETE' })
  }
})

// GET /api/knowledge/stats - Knowledge base statistics
router.get('/knowledge/stats', async (req: Request, res: Response) => {
  try {
    const ks = getKs()
    const stats = await ks.getStats()
    res.json(stats)
  } catch (error) {
    console.error('Knowledge stats error:', error)
    res.status(500).json({ error: 'Failed to get stats', code: 'ERR_KNOWLEDGE_STATS' })
  }
})

// POST /api/export-listing - Export listing
router.post('/export-listing', (req: Request, res: Response) => {
  try {
    const { listing, format } = req.body

    if (format === 'csv') {
      const csv = [
        'Title,Bullet Points,Description,Keywords,SEO Score',
        `"${listing.title}","${listing.bulletPoints.join(' | ')}","${listing.description.replace(/"/g, '""')}","${listing.keywords.join(', ')}",${listing.seoScore}`,
      ].join('\n')
      res.setHeader('Content-Type', 'text/csv')
      res.setHeader('Content-Disposition', 'attachment; filename="listing.csv"')
      res.send(csv)
    } else {
      res.json(listing)
    }
  } catch (error) {
    console.error('Export error:', error)
    res.status(500).json({ error: 'Failed to export listing', code: 'ERR_EXPORT' })
  }
})

// POST /api/client-error - Ingest frontend error reports (no auth: errors
// can happen before login). Fire-and-forget from the frontend; logged here.
export function reportClientError(req: Request, res: Response) {
  const { message, stack, source, route, url, userAgent } = req.body || {}
  if (!message) {
    res.status(400).json({ error: 'message required' })
    return
  }
  console.error(
    `[ClientError] ${source || 'app'} | ${route || url || ''} | ${message}\n${stack || ''} UA=${userAgent || ''}`,
  )
  res.status(204).end()
}

export default router
