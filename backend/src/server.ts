import express from 'express'
import cors from 'cors'
import apiController from './controllers/apiController.js'
import authController from './controllers/authController.js'
import modelController from './controllers/modelController.js'
import { requireAuth, requireAdmin, checkApiUsage } from './middleware/authMiddleware.js'

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors())
app.use(express.json({ limit: '10mb' }))

// Auth routes (no usage tracking)
app.use('/api/auth', authController)

// Model routes — require auth + admin
app.use('/api/models', requireAuth, requireAdmin, modelController)

// API routes — require auth and track usage
app.use('/api', requireAuth, checkApiUsage, apiController)

app.get('/', (_req, res) => {
  res.json({ name: 'RAG Listing Copilot API', version: '1.0.0', health: '/health' })
})

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
  console.log(`Health check: http://localhost:${PORT}/health`)
})

export default app
