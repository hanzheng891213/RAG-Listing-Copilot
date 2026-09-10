import { Router, type Request, type Response } from 'express'
import multer from 'multer'
import { getKnowledgeService, type KnowledgeService } from '../services/knowledge/knowledgeService.js'
import { requireAuth, requireAdmin } from '../middleware/authMiddleware.js'

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
})

const router = Router()

function getKs(): KnowledgeService {
  return getKnowledgeService()
}

router.get('/search', async (req: Request, res: Response) => {
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

router.get('/documents', async (req: Request, res: Response) => {
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

router.get('/documents/:id', async (req: Request, res: Response) => {
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

// Writes are admin-only; reads above stay public.
router.post('/upload', requireAuth, requireAdmin, upload.single('file'), async (req: Request, res: Response) => {
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

router.delete('/documents/:id', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const ks = getKs()
    await ks.deleteDocument(req.params.id as string)
    res.json({ success: true })
  } catch (error) {
    console.error('Delete document error:', error)
    res.status(500).json({ error: 'Failed to delete document', code: 'ERR_KNOWLEDGE_DELETE' })
  }
})

router.get('/stats', async (req: Request, res: Response) => {
  try {
    const ks = getKs()
    const stats = await ks.getStats()
    res.json(stats)
  } catch (error) {
    console.error('Knowledge stats error:', error)
    res.status(500).json({ error: 'Failed to get stats', code: 'ERR_KNOWLEDGE_STATS' })
  }
})

export default router
