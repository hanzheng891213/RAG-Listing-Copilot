import client from './client'
import type { GeneratedListing, ComplianceResult, Platform } from '@/types/listing'
import type { SupplierProduct } from '@/types/supplier'

export function generateListing(data: {
  productId: string
  platform: Platform
  template: string
  productData: SupplierProduct
}) {
  return client.post<GeneratedListing>('/generate-listing', data)
}

export function checkCompliance(listingId: string) {
  return client.post<ComplianceResult[]>('/check-compliance', { listingId })
}

export function exportListing(listingId: string, format: 'csv' | 'json') {
  return client.post('/export-listing', { listingId, format }, {
    responseType: 'blob',
  })
}
