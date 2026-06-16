import { Router, type Request, type Response } from 'express'
import { modelService } from '../services/model/modelService.js'

const router = Router()

// GET /api/models/providers — list all providers
router.get('/providers', (_req: Request, res: Response) => {
  const providers = modelService.getBuiltinProviders()
  const configs = modelService.getAllProviderConfigs()
  res.json({ providers, configs })
})

// GET /api/models/providers/:id — get single provider config
router.get('/providers/:id', (req: Request, res: Response) => {
  const config = modelService.getProviderConfig(req.params.id)
  if (!config) {
    res.status(404).json({ error: 'Provider not found', code: 'ERR_PROVIDER_NOT_FOUND' })
    return
  }
  res.json(config)
})

// PUT /api/models/providers/:id — update provider config
router.put('/providers/:id', (req: Request, res: Response) => {
  const updated = modelService.updateProviderConfig(req.params.id, req.body)
  if (!updated) {
    res.status(404).json({ error: 'Provider not found', code: 'ERR_PROVIDER_NOT_FOUND' })
    return
  }
  console.log(`[Model] Updated provider config for "${req.params.id}"`)
  res.json(updated)
})

// DELETE /api/models/providers/:id/key — clear API key
router.delete('/providers/:id/key', (req: Request, res: Response) => {
  const ok = modelService.clearProviderKey(req.params.id)
  if (!ok) {
    res.status(404).json({ error: 'Provider not found', code: 'ERR_PROVIDER_NOT_FOUND' })
    return
  }
  console.log(`[Model] Cleared API key for "${req.params.id}"`)
  res.json({ message: 'Key cleared' })
})

// GET /api/models/usage/stats — aggregated usage stats
router.get('/usage/stats', (req: Request, res: Response) => {
  const days = parseInt(req.query.days as string) || 30
  const stats = modelService.getUsageStats(days)
  res.json(stats)
})

export default router
