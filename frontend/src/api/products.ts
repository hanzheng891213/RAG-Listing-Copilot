import client from './client'
import type { Product } from '@/types/product'

export const productsApi = {
  list(params?: Record<string, unknown>) {
    return client.get<Product[]>('/products/', { params })
  },

  get(id: number) {
    return client.get<Product>(`/products/${id}`)
  },

  create(data: Partial<Product>) {
    return client.post<Product>('/products/', data)
  },

  update(id: number, data: Partial<Product>) {
    return client.put<Product>(`/products/${id}`, data)
  },

  extract(documentId: number) {
    return client.post<Product>('/products/extract', { document_id: documentId })
  },

  getReferences(id: number) {
    return client.get<string[]>(`/products/${id}/references`)
  }
}
