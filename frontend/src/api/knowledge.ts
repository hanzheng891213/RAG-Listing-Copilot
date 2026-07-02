import client from './client'
import type { KnowledgeDocument, SearchResult, KnowledgeCategory } from '@/types/knowledge'

export function searchKnowledge(query: string, platform?: string) {
  return client.get<{ results: SearchResult[] }>('/knowledge/search', {
    params: { query, platform },
  })
}

export function listDocuments(category?: string, platform?: string) {
  return client.get<{ documents: KnowledgeDocument[] }>('/knowledge/documents', {
    params: { category, platform },
  })
}

export function getDocument(id: string) {
  return client.get<{ document: KnowledgeDocument }>(`/knowledge/documents/${id}`)
}

export function uploadDocument(formData: FormData) {
  return client.post<{ document: KnowledgeDocument }>('/knowledge/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}

export function deleteDocument(id: string) {
  return client.delete(`/knowledge/documents/${id}`)
}

export function getKnowledgeStats() {
  return client.get<{ documentCount: number; totalChunks: number }>('/knowledge/stats')
}
