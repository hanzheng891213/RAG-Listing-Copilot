import client from './client'

interface FeedbackEntry {
  product_id?: number
  document_id?: number
  module: string
  field_name: string
  original_value: string
  corrected_value: string
  context_chunks?: string[]
}

export const feedbackApi = {
  submit(data: FeedbackEntry) {
    return client.post('/feedback/', data)
  },

  list(params?: Record<string, unknown>) {
    return client.get('/feedback/', { params })
  },

  reindex() {
    return client.post('/feedback/reindex')
  }
}
