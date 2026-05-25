import client from './client'
import type { KnowledgeDocument, SearchResult, KnowledgeCategory } from '@/types/knowledge'

export function searchKnowledge(query: string, category?: KnowledgeCategory) {
  return client.get<SearchResult[]>('/knowledge/search', {
    params: { query, category },
  })
}

export function getTemplates(platform?: string) {
  return client.get<KnowledgeDocument[]>('/templates', {
    params: { platform },
  })
}

export function uploadDocument(data: FormData) {
  return client.post<KnowledgeDocument>('/knowledge/upload', data, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}
