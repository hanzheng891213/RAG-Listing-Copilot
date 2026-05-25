import client from './client'
import type { SupplierProduct } from '@/types/supplier'

export function uploadSupplier(file: File) {
  const formData = new FormData()
  formData.append('file', file)
  return client.post<{ products: SupplierProduct[] }>('/upload-supplier', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}

export function parseSupplier(data: Record<string, unknown>) {
  return client.post<{ products: SupplierProduct[] }>('/parse-supplier', data)
}
