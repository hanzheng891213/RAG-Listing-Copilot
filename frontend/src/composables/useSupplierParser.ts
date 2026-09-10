import type { SupplierProduct } from '@/types/supplier'

/**
 * Display helpers for imported supplier products. Parsing happens on the
 * backend (POST /api/upload-supplier), so nothing here reads a file.
 */
export function useSupplierParser() {
  function getProductLabel(product: SupplierProduct): string {
    const values = Object.values(product.rawData).filter((v) => v)
    return values[0] || `Product ${product.id.slice(0, 6)}`
  }

  return {
    getProductLabel,
  }
}
