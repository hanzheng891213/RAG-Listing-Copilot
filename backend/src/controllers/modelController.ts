import { Router, type Request, type Response } from 'express'
import { modelService } from '../services/model/modelService.js'
import {
  ConfigError,
  getModelConfigService,
  type ModelConfigInput,
} from '../services/model/modelConfigService.js'
import { ConfigKeyMissingError } from '../services/model/configCrypto.js'
import type { AuthedRequest } from '../middleware/authMiddleware.js'
import type { ModelProvider } from '../types/model.js'

const router = Router()

function userIdOf(req: Request): string {
  return (req as AuthedRequest).authUser?.id ?? ''
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
  return false
}

function providerDirectory(configs: Array<{ providerId: string; providerName: string; baseUrl: string }>): ModelProvider[] {
  const builtins = modelService.getBuiltinProviders()
  const known = new Set(builtins.map((p) => p.id))
  const custom = configs
    .filter((config) => config.providerName && !known.has(config.providerId))
    .map<ModelProvider>((config) => ({
      id: config.providerId,
      name: config.providerName,
      baseUrl: config.baseUrl,
      signupUrl: '',
    }))
  return [...builtins, ...custom]
}

// GET /api/models/configs — one request returns the directory, the caller's
// configs and the active provider. Combining them keeps the Model Manager page
// at a single round trip, which matters on the Workers free plan.
router.get('/configs', async (req: Request, res: Response) => {
  const userId = userIdOf(req)
  if (!userId) {
    res.status(401).json({ error: 'Authentication required', code: 'ERR_AUTH_REQUIRED' })
    return
  }

  try {
    const service = getModelConfigService()
    const configs = await service.list(userId)
    const activeProviderId = await service.getActiveProviderId(userId)
    res.json({
      providers: providerDirectory(configs),
      configs,
      activeProviderId,
    })
  } catch (err) {
    if (configFailure(res, err)) return
    console.error('[Models] configs failed:', err)
    res.status(500).json({ error: 'Failed to load model configs', code: 'ERR_MODEL_CONFIGS' })
  }
})

// Kept for older clients and for the public provider catalogue.
router.get('/providers', (_req: Request, res: Response) => {
  res.json({ providers: modelService.getBuiltinProviders() })
})

router.put('/configs/:providerId', async (req: Request, res: Response) => {
  const userId = userIdOf(req)
  if (!userId) {
    res.status(401).json({ error: 'Authentication required', code: 'ERR_AUTH_REQUIRED' })
    return
  }

  try {
    const body = (req.body ?? {}) as ModelConfigInput
    const service = getModelConfigService()
    const config = await service.upsert(userId, String(req.params.providerId), {
      apiKey: body.apiKey,
      model: body.model,
      providerName: body.providerName,
      baseUrl: body.baseUrl,
      temperature: body.temperature,
      maxTokens: body.maxTokens,
    })
    const activeProviderId = await service.getActiveProviderId(userId)
    res.json({ config, activeProviderId })
  } catch (err) {
    if (configFailure(res, err)) return
    console.error('[Models] save config failed:', err)
    res.status(500).json({ error: 'Failed to save model config', code: 'ERR_MODEL_CONFIG_SAVE' })
  }
})

router.delete('/configs/:providerId/key', async (req: Request, res: Response) => {
  const userId = userIdOf(req)
  if (!userId) {
    res.status(401).json({ error: 'Authentication required', code: 'ERR_AUTH_REQUIRED' })
    return
  }

  try {
    await getModelConfigService().clearKey(userId, String(req.params.providerId))
    res.json({ ok: true })
  } catch (err) {
    if (configFailure(res, err)) return
    console.error('[Models] clear key failed:', err)
    res.status(500).json({ error: 'Failed to delete API key', code: 'ERR_MODEL_KEY_DELETE' })
  }
})

router.delete('/configs/:providerId', async (req: Request, res: Response) => {
  const userId = userIdOf(req)
  if (!userId) {
    res.status(401).json({ error: 'Authentication required', code: 'ERR_AUTH_REQUIRED' })
    return
  }

  try {
    await getModelConfigService().remove(userId, String(req.params.providerId))
    res.json({ ok: true })
  } catch (err) {
    if (configFailure(res, err)) return
    console.error('[Models] delete config failed:', err)
    res.status(500).json({ error: 'Failed to delete model config', code: 'ERR_MODEL_CONFIG_DELETE' })
  }
})

router.post('/active', async (req: Request, res: Response) => {
  const userId = userIdOf(req)
  if (!userId) {
    res.status(401).json({ error: 'Authentication required', code: 'ERR_AUTH_REQUIRED' })
    return
  }

  try {
    const providerId = String((req.body ?? {}).providerId ?? '')
    await getModelConfigService().setActive(userId, providerId)
    res.json({ activeProviderId: providerId })
  } catch (err) {
    if (configFailure(res, err)) return
    console.error('[Models] set active failed:', err)
    res.status(500).json({ error: 'Failed to select provider', code: 'ERR_MODEL_ACTIVE' })
  }
})

// GET /api/models/usage/stats — aggregated usage stats
router.get('/usage/stats', async (req: Request, res: Response) => {
  const days = parseInt(req.query.days as string) || 30
  try {
    const stats = await modelService.getUsageStats(days)
    res.json(stats)
  } catch (err) {
    console.error('[Models] usage stats failed:', err)
    res.status(500).json({ error: 'Failed to load usage stats', code: 'ERR_USAGE_STATS' })
  }
})

export default router
