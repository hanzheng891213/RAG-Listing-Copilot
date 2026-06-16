import { Router, type Request, type Response } from 'express'
import { modelService } from '../services/model/modelService.js'

const router = Router()

// GET /api/models/providers — list all providers (NO configs, NO api keys)
router.get('/providers', (_req: Request, res: Response) => {
  const providers = modelService.getBuiltinProviders()
  res.json({ providers })
})

// GET /api/models/usage/stats — aggregated usage stats
router.get('/usage/stats', (req: Request, res: Response) => {
  const days = parseInt(req.query.days as string) || 30
  const stats = modelService.getUsageStats(days)
  res.json(stats)
})

export default router
