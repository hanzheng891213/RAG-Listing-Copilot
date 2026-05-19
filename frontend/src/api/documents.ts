import client from './client'
import type { Document, DocumentChunk } from '@/types/document'

export const documentsApi = {
  list(params?: Record<string, unknown>) {
    return client.get<Document[]>('/documents/', { params })
  },

  get(id: number) {
    return client.get<Document>(`/documents/${id}`)
  },

  upload(formData: FormData) {
    return client.post<Document>('/documents/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
  },

  parse(id: number) {
    return client.post(`/documents/${id}/parse`)
  },

  getChunks(id: number) {
    return client.get<DocumentChunk[]>(`/documents/${id}/chunks`)
  },

  remove(id: number) {
    return client.delete(`/documents/${id}`)
  }
}
