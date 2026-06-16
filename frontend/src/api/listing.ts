import client from './client'
import type { GeneratedListing, ComplianceResult, Platform } from '@/types/listing'
import type { SupplierProduct } from '@/types/supplier'

export function generateListing(data: {
  productId: string
  platform: Platform
  template: string
  productData: SupplierProduct
  providerId?: string
  language?: string
  apiKey?: string
  model?: string
  temperature?: number
  maxTokens?: number
}) {
  return client.post<GeneratedListing>('/generate-listing', data)
}

/**
 * Streaming listing generation via SSE (Server-Sent Events).
 * Calls onField when a field (title, bulletPoints, description, keywords) is received.
 * Calls onDone when generation is complete.
 * Calls onError if an error occurs.
 */
export function generateListingStream(
  data: {
    productId: string
    platform: Platform
    template: string
    productData: SupplierProduct
    providerId?: string
    language?: string
    apiKey?: string
    model?: string
    temperature?: number
    maxTokens?: number
  },
  onField: (field: string, value: any) => void,
  onDone: (listing: GeneratedListing, complianceResults: ComplianceResult[]) => void,
  onError: (message: string) => void,
): AbortController {
  const controller = new AbortController()
  const token = localStorage.getItem('rag-copilot-token')
  const activeProvider = localStorage.getItem('rag-copilot-active-provider')

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (token) headers['Authorization'] = `Bearer ${token}`
  if (activeProvider) headers['X-Active-Provider'] = activeProvider

  ;(async () => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || ''}/api/generate-listing/stream`, {
        method: 'POST',
        headers,
        body: JSON.stringify(data),
        signal: controller.signal,
      })

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Stream request failed' }))
        onError(err.error || 'Stream request failed')
        return
      }

      const reader = response.body?.getReader()
      if (!reader) {
        onError('No response body')
        return
      }

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || !trimmed.startsWith('data: ')) continue
          const dataStr = trimmed.slice(6)
          try {
            const event = JSON.parse(dataStr)
            switch (event.type) {
              case 'field':
                onField(event.field, event.value)
                break
              case 'done':
                onDone(event.listing, event.complianceResults || [])
                break
              case 'error':
                onError(event.message)
                break
            }
          } catch {
            // skip unparseable
          }
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        onError(err.message || 'Stream error')
      }
    }
  })()

  return controller
}

export function checkCompliance(listingId: string) {
  return client.post<ComplianceResult[]>('/check-compliance', { listingId })
}

export function exportListing(listingId: string, format: 'csv' | 'json') {
  return client.post('/export-listing', { listingId, format }, {
    responseType: 'blob',
  })
}
