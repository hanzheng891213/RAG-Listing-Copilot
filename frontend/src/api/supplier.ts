import client from './client'
import type { SupplierProduct, ParseError } from '@/types/supplier'

export interface UploadSupplierResult {
  products: SupplierProduct[]
  errors: ParseError[]
}

/**
 * The response interceptor unwraps `response.data`, so this resolves to the
 * body; the cast keeps the axios generic from lying about that.
 */
export async function uploadSupplier(file: File): Promise<UploadSupplierResult> {
  const formData = new FormData()
  formData.append('file', file)
  const body = await client.post('/upload-supplier', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return body as unknown as UploadSupplierResult
}

export function parseSupplier(data: Record<string, unknown>) {
  return client.post<{ products: SupplierProduct[] }>('/parse-supplier', data)
}
