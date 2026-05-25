export interface SupplierProduct {
  id: string
  title: string
  description: string
  specs: Record<string, string>
  price: number | null
  currency: string
  category: string
  images: string[]
  rawData: Record<string, unknown>
}

export interface GeneratedListing {
  id: string
  productId: string
  title: string
  bulletPoints: string[]
  description: string
  keywords: string[]
  seoScore: number
  complianceResults: ComplianceResult[]
  platform: Platform
  template: string
  version: number
  createdAt: string
}

export interface ComplianceResult {
  rule: string
  passed: boolean
  message: string
  severity: 'error' | 'warning' | 'info'
  flaggedContent?: string
}

export type Platform = 'amazon' | 'shopify' | 'ebay' | 'etsy'

export interface GenerateListingRequest {
  productId: string
  platform: Platform
  template: string
  productData: SupplierProduct
}

export interface SearchKnowledgeRequest {
  query: string
  category?: string
  platform?: string
}
