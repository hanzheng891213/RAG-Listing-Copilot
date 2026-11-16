import { Router, type Request, type Response } from 'express'
import { requireAuth, requirePermission, requireAnyPermission, type AuthedRequest } from '../middleware/authMiddleware.js'
import { getProductService } from '../services/products/productService.js'
import { computeFinanceSummary } from '../services/products/finance.js'

/**
 * Express twin of the Worker's product-grid routes.
 *
 * The dev server has no D1 binding, so the service falls back to an in-memory
 * map (see productService.ts). Behaviour — paging, batch contract, idempotent
 * deletes, ownership — is shared with production; only the storage differs.
 */
const router = Router()

// GET /api/products — auth is required now: the previous public read exposed
// every owner's supplier rows to anyone who knew the URL.
router.get('/products', requireAuth, requireAnyPermission(['productGrid', 'listingGenerator']), async (req: Request, res: Response) => {
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
router.post('/products/batch', requireAuth, requirePermission('productGrid'), async (req: Request, res: Response) => {
  const user = (req as AuthedRequest).authUser!

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
      actor: { userId: user.id, userName: user.username, isAdmin: user.role === 'admin' },
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

// GET /api/finance/summary — one query + one row scan, aggregated server-side.
// The finance page is therefore a single request regardless of product count.
router.get('/finance/summary', requireAuth, requirePermission('finance'), async (_req: Request, res: Response) => {
  try {
    const rows = await getProductService(undefined).financeRows(5000)
    res.json(computeFinanceSummary(rows))
  } catch (err) {
    console.error('[Finance] Summary failed:', err)
    res.status(500).json({ error: 'Failed to compute finance summary', code: 'ERR_FINANCE_SUMMARY' })
  }
})

export default router
