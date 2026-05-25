import { Router, type Request, type Response } from 'express'
import multer from 'multer'
import { parserService } from '../services/parser/parserService.js'
import { deepseekService } from '../services/deepseek/deepseekService.js'
import { ragService } from '../services/rag/ragService.js'
import type { Platform } from '../types/index.js'

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
})

const router = Router()

// POST /api/upload-supplier - Upload and parse supplier file
router.post('/upload-supplier', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' })
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
      res.status(400).json({ error: `Unsupported format: .${extension}` })
      return
    }

    res.json(result)
  } catch (error) {
    console.error('Upload error:', error)
    res.status(500).json({ error: 'Failed to parse file' })
  }
})

// POST /api/parse-supplier - Parse supplier info from JSON
router.post('/parse-supplier', (req: Request, res: Response) => {
  try {
    const { data } = req.body
    // For JSON-based parsing, return structured data directly
    res.json({ products: Array.isArray(data) ? data : [data] })
  } catch (error) {
    console.error('Parse error:', error)
    res.status(500).json({ error: 'Failed to parse supplier data' })
  }
})

// POST /api/generate-listing - Generate listing with DeepSeek + RAG
router.post('/generate-listing', async (req: Request, res: Response) => {
  try {
    const { productId, platform, template, productData } = req.body

    if (!productData) {
      res.status(400).json({ error: 'productData is required' })
      return
    }

    const listing = await deepseekService.generateListing(
      productData,
      (platform as Platform) || 'amazon',
      template || 'standard',
    )

    res.json(listing)
  } catch (error) {
    console.error('Generate error:', error)
    res.status(500).json({ error: 'Failed to generate listing' })
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
    res.status(500).json({ error: 'Failed to check compliance' })
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
    res.status(500).json({ error: 'Failed to export listing' })
  }
})

export default router
