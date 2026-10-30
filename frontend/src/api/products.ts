import client from './client'
import type { GridPage, GridRow, GridSavePayload, GridSaveResult } from '@/types/grid'

/**
 * Product grid API.
 *
 * The client interceptor unwraps `response.data`, so these functions resolve to
 * the body — the casts keep the axios generic from lying about that.
 */

export interface ListProductsParams {
  page?: number
  pageSize?: number
  q?: string
}

export async function listProducts(params: ListProductsParams = {}): Promise<GridPage<GridRow>> {
  const body = await client.get('/products', { params })
  return body as unknown as GridPage<GridRow>
}

export async function saveProductBatch(payload: GridSavePayload): Promise<GridSaveResult> {
  const body = await client.post('/products/batch', payload)
  return body as unknown as GridSaveResult
}
