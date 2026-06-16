import { Router, type Request, type Response } from 'express'
import multer from 'multer'
import { parserService } from '../services/parser/parserService.js'
import { deepseekService } from '../services/deepseek/deepseekService.js'
import { ragService } from '../services/rag/ragService.js'
import { modelService } from '../services/model/modelService.js'
import type { Platform } from '../types/index.js'
import type { JwtPayload } from '../types/auth.js'

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
})

const router = Router()

function isAdmin(req: Request): boolean {
  return ((req as any).user as JwtPayload)?.role === 'admin'
}

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

// POST /api/generate-listing - Generate listing (multi-provider via modelService)
router.post('/generate-listing', async (req: Request, res: Response) => {
  try {
    const { productId, platform, template, productData, providerId, language } = req.body

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
      )
      res.json(demoListing)
      return
    }

    // Admin: use modelService for multi-provider support
    const config = modelService.getActiveConfig(providerId)

    if (!config) {
      res.status(400).json({ error: 'No AI provider configured. Please set up an API key in Model Manager.', code: 'ERR_NO_PROVIDER' })
      return
    }

    console.log('[API] Admin generate — provider:', config.providerId, 'model:', config.activeModel)
    try {
      const prompt = deepseekService.buildPromptForProvider(productData, platform as Platform, template, language)

      const systemMsg = language && language !== 'english'
        ? `You are a helpful e-commerce listing assistant. Respond in JSON format with: title, bulletPoints (array of 5 strings), description, keywords (array of strings). All content MUST be written in ${language}.`
        : 'You are a helpful e-commerce listing assistant. Respond in JSON format with: title, bulletPoints (array of 5 strings), description, keywords (array of strings).'

      const data = await modelService.callProviderAPI(providerId, [
        { role: 'system', content: systemMsg },
        { role: 'user', content: prompt },
      ])

      if (!data) {
        res.status(502).json({ error: 'AI API error', code: 'ERR_AI_API' })
        return
      }

      const content = data.choices[0]?.message?.content || '{}'
      const parsed = JSON.parse(content)

      const complianceResults = ragService.checkCompliance(
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

// POST /api/chat-listing - AI chat (admin only)
router.post('/chat-listing', async (req: Request, res: Response) => {
  // Visitors cannot use chat
  if (!isAdmin(req)) {
    res.status(403).json({ error: 'Chat is only available for admin users', code: 'ERR_VISITOR_DENIED' })
    return
  }

  try {
    const { messages, listingContext, providerId } = req.body

    if (!messages || !Array.isArray(messages)) {
      res.status(400).json({ error: 'messages array is required', code: 'ERR_MISSING_MESSAGES' })
      return
    }

    const config = modelService.getActiveConfig(providerId)
    if (!config) {
      res.status(400).json({ error: 'No AI provider configured. Please set up an API key in Model Manager.', code: 'ERR_NO_PROVIDER' })
      return
    }

    const systemMsg = listingContext
      ? `You are an e-commerce listing optimization assistant. The user is working on the following listing:\n\nTitle: ${listingContext.title || 'N/A'}\nPlatform: ${listingContext.platform || 'N/A'}\nBullet Points: ${(listingContext.bulletPoints || []).join(' | ')}\nDescription: ${listingContext.description || 'N/A'}\nKeywords: ${(listingContext.keywords || []).join(', ')}\nSEO Score: ${listingContext.seoScore || 'N/A'}\n\nHelp the user refine and improve this listing. Be concise and specific. When suggesting changes, quote the original text and show the improved version.`
      : 'You are an e-commerce listing optimization assistant. Help the user create and refine product listings. Be concise and specific.'

    const data = await modelService.callProviderAPI(providerId, [
      { role: 'system', content: systemMsg },
      ...messages,
    ])

    if (!data) {
      res.status(502).json({ error: 'AI API error', code: 'ERR_AI_API' })
      return
    }

    const reply = data.choices[0]?.message?.content || ''
    res.json({ reply, usage: data.usage })
  } catch (error) {
    console.error('Chat error:', error)
    res.status(500).json({ error: 'Failed to process chat message', code: 'ERR_CHAT_FAILED' })
  }
})

// POST /api/check-compliance - Check compliance
router.post('/check-compliance', (req: Request, res: Response) => {
  try {
    const { text, platform } = req.body
    const results = ragService.checkCompliance(text || '', platform)
    res.json(results)
  } catch (error) {
    console.error('Compliance error:', error)
    res.status(500).json({ error: 'Failed to check compliance', code: 'ERR_COMPLIANCE_CHECK' })
  }
})

// POST /api/generate-listing/stream - Streaming generate listing (SSE)
router.post('/generate-listing/stream', async (req: Request, res: Response) => {
  try {
    const { productId, platform, template, productData, providerId, language } = req.body

    if (!productData) {
      res.status(400).json({ error: 'productData is required', code: 'ERR_MISSING_PRODUCT_DATA' })
      return
    }

    if (!isAdmin(req)) {
      res.json({
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
      return
    }

    const config = modelService.getActiveConfig(providerId)
    if (!config) {
      res.status(400).json({ error: 'No AI provider configured', code: 'ERR_NO_PROVIDER' })
      return
    }

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')
    res.flushHeaders()

    const prompt = deepseekService.buildPromptForProvider(productData, platform as Platform, template, language)

    const systemMsg = language && language !== 'english'
      ? `You are a helpful e-commerce listing assistant. Respond in JSON format with: title, bulletPoints (array of 5 strings), description, keywords (array of strings). All content MUST be written in ${language}.`
      : 'You are a helpful e-commerce listing assistant. Respond in JSON format with: title, bulletPoints (array of 5 strings), description, keywords (array of strings).'

    let accumulated = ''
    let sentFields = new Set<string>()
    let lastParse: any = null

    // Helper: try to extract fields from partial JSON and send SSE events
    function trySendFields() {
      try {
        const parsed = JSON.parse(accumulated)
        if (!parsed || typeof parsed !== 'object') return

        const fields: [string, string][] = [['title', 'string'], ['description', 'string']]
        const arrayFields: [string, string][] = [['bulletPoints', 'array'], ['keywords', 'array']]

        for (const [field, type] of fields) {
          if (!sentFields.has(field) && typeof parsed[field] === 'string' && parsed[field].length > 3) {
            sentFields.add(field)
            res.write(`data: ${JSON.stringify({ type: 'field', field, value: parsed[field] })}\n\n`)
          }
        }

        for (const [field, type] of arrayFields) {
          if (!sentFields.has(field) && Array.isArray(parsed[field]) && parsed[field].length > 0) {
            sentFields.add(field)
            res.write(`data: ${JSON.stringify({ type: 'field', field, value: parsed[field] })}\n\n`)
          }
        }

        lastParse = parsed
      } catch {
        // not yet valid JSON
      }
    }

    try {
      for await (const chunk of modelService.callProviderAPIStream(providerId, [
        { role: 'system', content: systemMsg },
        { role: 'user', content: prompt },
      ])) {
        accumulated += chunk
        trySendFields()
      }

      // Final parse to get complete data
      if (lastParse) {
        const complianceResults = ragService.checkCompliance(
          [lastParse.title || '', ...(lastParse.bulletPoints || []), lastParse.description || ''].join(' '),
          platform,
        )

        res.write(`data: ${JSON.stringify({
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
        })}\n\n`)
      } else {
        res.write(`data: ${JSON.stringify({ type: 'error', message: 'Failed to parse AI output' })}\n\n`)
      }
    } catch (err) {
      console.error('[SSE] Stream error:', err)
      res.write(`data: ${JSON.stringify({ type: 'error', message: 'Stream error' })}\n\n`)
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

// GET /api/knowledge/search - Search knowledge base
router.get('/knowledge/search', (req: Request, res: Response) => {
  const { query, platform } = req.query
  const docs = ragService.searchRelevantDocs(
    (query as string) || '',
    platform as string | undefined,
  )
  res.json(docs)
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

export default router
