import { Router, type Request, type Response } from 'express'
import { modelService } from '../services/model/modelService.js'

const router = Router()

// GET /api/models/providers — list all providers (NO configs, NO api keys)
router.get('/providers', (_req: Request, res: Response) => {
  const providers = modelService.getBuiltinProviders()
  res.json({ providers })
})

// GET /api/models/usage/stats — aggregated usage stats
router.get('/usage/stats', async (req: Request, res: Response) => {
  const days = parseInt(req.query.days as string) || 30
  try {
    // getUsageStats is async (D1); without the await the handler serialised a
    // pending Promise to `{}`, and the client then crashed on `totalCost`.
    const stats = await modelService.getUsageStats(days)
    res.json(stats)
  } catch (err) {
    console.error('[Models] usage stats failed:', err)
    res.status(500).json({ error: 'Failed to load usage stats', code: 'ERR_USAGE_STATS' })
  }
})

export default router
