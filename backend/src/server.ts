import express from 'express'
import cors from 'cors'
import apiController from './controllers/apiController.js'
import authController from './controllers/authController.js'
import adminController from './controllers/adminController.js'
import { requireAuth, checkApiUsage } from './middleware/authMiddleware.js'

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors())
app.use(express.json({ limit: '10mb' }))

// Auth routes (no usage tracking)
app.use('/api/auth', authController)

// Admin routes (require auth + admin, no usage tracking)
app.use('/api/admin', adminController)

// API routes — require auth and track usage
app.use('/api', requireAuth, checkApiUsage, apiController)

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
  console.log(`Health check: http://localhost:${PORT}/health`)
})

export default app
