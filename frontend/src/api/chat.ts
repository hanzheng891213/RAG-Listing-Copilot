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
