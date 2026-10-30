import { Router, type Request, type Response } from 'express'
import { requireAuth } from '../middleware/authMiddleware.js'
import { getProductService } from '../services/products/productService.js'
import type { JwtPayload } from '../types/auth.js'

/**
 * Express twin of the Worker's product-grid routes.
 *
 * The dev server has no D1 binding, so the service falls back to an in-memory
 * map (see productService.ts). Behaviour — paging, batch contract, idempotent
 * deletes, ownership — is shared with production; only the storage differs.
 */
const router = Router()

// GET /api/products — public read, same shape as the Worker route.
router.get('/products', async (req: Request, res: Response) => {
  try {
    const page = Math.max(parseInt(String(req.query.page ?? '1'), 10) || 1, 1)
    const requested = parseInt(String(req.query.pageSize ?? '100'), 10) || 100
    const pageSize = Math.min(Math.max(requested, 1), 500)
    const query = String(req.query.q ?? '')

    const result = await getProductService(undefined).list({ page, pageSize, query })
    res.json(result)
  } catch (err) {
    console.error('[Products] List failed:', err)
    res.status(500).json({ error: 'Failed to load products', code: 'ERR_PRODUCT_LIST' })
  }
})

// POST /api/products/batch — authenticated, one request per save.
router.post('/products/batch', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user as JwtPayload

  try {
    const body = req.body ?? {}
    const items = Array.isArray(body.items) ? body.items : []
    const deletedIds = Array.isArray(body.deletedIds)
      ? body.deletedIds.filter((id: unknown): id is string => typeof id === 'string')
      : []

    if (items.length === 0 && deletedIds.length === 0) {
      res.status(400).json({ error: 'Nothing to save', code: 'ERR_EMPTY_BATCH' })
      return
    }

    const result = await getProductService(undefined).saveBatch({
      actor: { userId: user.userId, userName: user.username, isAdmin: user.role === 'admin' },
      items,
      deletedIds,
    })
    res.json(result)
  } catch (err) {
    console.error('[Products] Batch failed:', err)
    const message = err instanceof Error ? err.message : 'Batch save failed'
    const status = /too many|invalid|must be/i.test(message) ? 400 : 500
    res.status(status).json({ error: message, code: 'ERR_PRODUCT_BATCH' })
  }
})

export default router
