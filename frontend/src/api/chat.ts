import client from './client'
import type { GeneratedListing } from '@/types/listing'

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface ChatRequest {
  messages: ChatMessage[]
  listingContext?: GeneratedListing
  providerId?: string
  apiKey?: string
  model?: string
  temperature?: number
  maxTokens?: number
}

export interface ChatResponse {
  reply: string
  usage?: {
    prompt_tokens: number
    completion_tokens: number
  }
}

export function sendChatMessage(data: ChatRequest): Promise<ChatResponse> {
  return client.post('/chat-listing', data) as any
}

/**
 * Streaming chat via SSE (Server-Sent Events).
 * Calls onChunk for each text delta from the AI.
 * Calls onDone when the response is complete.
 * Calls onError if an error occurs.
 */
export function sendChatMessageStream(
  data: ChatRequest,
  onChunk: (content: string) => void,
  onDone: () => void,
  onError: (message: string) => void,
): AbortController {
  const controller = new AbortController()
  const token = localStorage.getItem('rag-copilot-token')

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (token) headers['Authorization'] = `Bearer ${token}`

  ;(async () => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || ''}/api/chat-listing`, {
        method: 'POST',
        headers,
        body: JSON.stringify(data),
        signal: controller.signal,
      })

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Chat request failed' }))
        onError(err.error || 'Chat request failed')
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
              case 'chunk':
                onChunk(event.content)
                break
              case 'done':
                onDone()
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
