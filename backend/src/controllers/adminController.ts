import { Router, type Request, type Response } from 'express'
import { requireAuth, requireAdmin } from '../middleware/authMiddleware.js'
import type { AdminSettings, JwtPayload } from '../types/auth.js'

// In-memory admin settings store
const defaultSettings: AdminSettings = {
  deepseekApiKey: process.env.DEEPSEEK_API_KEY || '',
  modelName: 'deepseek-chat',
  temperature: 0.7,
  maxTokens: 4096,
}

let adminSettings: AdminSettings = { ...defaultSettings }

const router = Router()

// GET /api/admin/settings
router.get('/settings', requireAuth, requireAdmin, (_req: Request, res: Response) => {
  res.json({
    ...adminSettings,
    deepseekApiKey: adminSettings.deepseekApiKey
      ? `sk-****${adminSettings.deepseekApiKey.slice(-4)}`
      : '',
  })
})

// PUT /api/admin/settings
router.put('/settings', requireAuth, requireAdmin, (req: Request, res: Response) => {
  const { deepseekApiKey, modelName, temperature, maxTokens } = req.body as Partial<AdminSettings>

  if (deepseekApiKey !== undefined) {
    // Only update if a non-masked key is provided
    if (!deepseekApiKey.startsWith('sk-****')) {
      adminSettings.deepseekApiKey = deepseekApiKey
    }
  }

  if (modelName !== undefined) {
    adminSettings.modelName = modelName
  }

  if (temperature !== undefined) {
    if (temperature < 0 || temperature > 2) {
      res.status(400).json({ error: 'Temperature must be between 0 and 2' })
      return
    }
    adminSettings.temperature = temperature
  }

  if (maxTokens !== undefined) {
    if (maxTokens < 1 || maxTokens > 32768) {
      res.status(400).json({ error: 'Max tokens must be between 1 and 32768' })
      return
    }
    adminSettings.maxTokens = maxTokens
  }

  res.json({ message: 'Settings updated', settings: adminSettings })
})

export { adminSettings }
export default router
