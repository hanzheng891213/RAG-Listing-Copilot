import { Router, type Request, type Response } from 'express'
import multer from 'multer'
import { parserService } from '../services/parser/parserService.js'
import { deepseekService } from '../services/deepseek/deepseekService.js'
import { ragService } from '../services/rag/ragService.js'
import { modelService } from '../services/model/modelService.js'
import { getKnowledgeService, type KnowledgeService } from '../services/knowledge/knowledgeService.js'
import type { Platform } from '../types/index.js'
import type { JwtPayload } from '../types/auth.js'
import { extractListingFields, normalizeListingFields, parseFinalJson, streamDemoSse } from '../utils/listingStream.js'

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
    { platform },
  )
  console.log(`[Generate] Knowledge retrieval: ${knowledge.length} chars (platform=${platform})`)
  return deepseekService.buildPromptForProvider(productData, platform, template, language, knowledge)
}

function isAdmin(req: Request): boolean {
  return ((req as any).user as JwtPayload)?.role === 'admin'
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
// apiKey is passed from frontend per-request, NEVER stored on server
router.post('/generate-listing', async (req: Request, res: Response) => {
  try {
    const { productId, platform, template, productData, providerId, language, apiKey, model, temperature, maxTokens } = req.body

    if (!productData) {
      res.status(400).json({ error: 'productData is required', code: 'ERR_MISSING_PRODUCT_DATA' })
      return
    }

    // Visitors always get demo data
    if (!isAdmin(req)) {
      console.log('[API] Visitor generate — forcing demo mode')
      const demoListing = await deepseekService.generateListing(
        productData,
        (platform as Platform) || 'amazon',
        template || 'standard',
        undefined, // no apiKey → demo
        language,
      )
      res.json(demoListing)
      return
    }

    // Admin: apiKey must be provided by frontend (NOT stored on server)
    if (!apiKey) {
      res.status(400).json({ error: 'API key is required. Please configure it in Model Manager.', code: 'ERR_NO_API_KEY' })
      return
    }

    console.log('[API] Admin generate — provider:', providerId, 'model:', model)
    try {
      const prompt = await buildGroundedPrompt(productData, platform, template, language)

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
        { model, temperature, max_tokens: maxTokens, disableThinking: (providerId || 'deepseek') === 'deepseek' },
      )

      if (!data) {
        res.status(502).json({ error: 'AI API error. Please check your API key and model configuration.', code: 'ERR_AI_API' })
        return
      }

      const content = data.choices[0]?.message?.content || '{}'
      const parsed = JSON.parse(content)

      const ks = getKs()
      const complianceResults = await ks.checkCompliance(
        [parsed.title, ...parsed.bulletPoints, parsed.description].join(' '),
        platform,
      )

      res.json({
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
      res.status(500).json({ error: 'Failed to generate listing', code: 'ERR_GENERATE_LISTING' })
    }
  } catch (error) {
    console.error('Generate error:', error)
    res.status(500).json({ error: 'Failed to generate listing', code: 'ERR_GENERATE_LISTING' })
  }
})

// POST /api/chat-listing - AI chat (SSE streaming)
// apiKey is passed from frontend per-request, NEVER stored on server
router.post('/chat-listing', async (req: Request, res: Response) => {
  // Visitors cannot use chat
  if (!isAdmin(req)) {
    res.status(403).json({ error: 'Chat is only available for admin users', code: 'ERR_VISITOR_DENIED' })
    return
  }

  try {
    const { messages, listingContext, providerId, apiKey, model, temperature, maxTokens } = req.body

    if (!messages || !Array.isArray(messages)) {
      res.status(400).json({ error: 'messages array is required', code: 'ERR_MISSING_MESSAGES' })
      return
    }

    if (!apiKey) {
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
        providerId || 'deepseek',
        apiKey,
        [
          { role: 'system', content: systemMsg },
          ...messages,
        ],
        { model, temperature, max_tokens: maxTokens },
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
    console.error('Chat error:', error)
    res.status(500).json({ error: 'Failed to process chat message', code: 'ERR_CHAT_FAILED' })
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
// apiKey is passed from frontend per-request, NEVER stored on server
router.post('/generate-listing/stream', async (req: Request, res: Response) => {
  try {
    const { productId, platform, template, productData, providerId, language, apiKey, model, temperature, maxTokens } = req.body

    if (!productData) {
      res.status(400).json({ error: 'productData is required', code: 'ERR_MISSING_PRODUCT_DATA' })
      return
    }

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')
    res.flushHeaders()

    if (!isAdmin(req)) {
      // Non-admin: stream demo data as SSE (frontend expects SSE, not a plain JSON body)
      await streamDemoSse((line) => res.write(line), {
        productId,
        platform,
        template,
      })
      res.end()
      return
    }

    if (!apiKey) {
      res.write(`data: ${JSON.stringify({ type: 'error', message: 'API key is required. Please configure it in Model Manager.' })}\n\n`)
      res.end()
      return
    }

    const prompt = await buildGroundedPrompt(productData, platform, template, language)

    const systemMsg = language && language !== 'english'
      ? `You are a helpful e-commerce listing assistant. Respond in JSON format with: title, bulletPoints (array of 5 strings), description, keywords (array of strings). All content MUST be written in ${language}.`
      : 'You are a helpful e-commerce listing assistant. Respond in JSON format with: title, bulletPoints (array of 5 strings), description, keywords (array of strings).'

    const sse = (obj: unknown) => res.write(`data: ${JSON.stringify(obj)}\n\n`)

    let accumulated = ''
    const sent = new Map<string, unknown>()

    try {
      for await (const chunk of modelService.callProviderAPIStream(
        providerId || 'deepseek',
        apiKey,
        [
          { role: 'system', content: systemMsg },
          { role: 'user', content: prompt },
        ],
        { model, temperature, max_tokens: maxTokens, disableThinking: (providerId || 'deepseek') === 'deepseek' },
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
        const norm = normalizeListingFields(parsed)
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
