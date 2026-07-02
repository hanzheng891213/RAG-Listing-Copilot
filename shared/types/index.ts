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

// ─── Knowledge Base Types ─────────────────────────────────────────

export type KnowledgeCategory = 'platform_rules' | 'templates' | 'history'

export interface KnowledgeDocument {
  id: string
  title: string
  category: KnowledgeCategory
  platform?: Platform
  tags: string[]
  content: string
  fileType: string
  fileSize: number
  chunkCount: number
  createdAt: string
  updatedAt: string
}

export interface KnowledgeChunk {
  id: string
  documentId: string
  content: string
  chunkIndex: number
  metadata: {
    platform?: string
    category: string
    title: string
  }
}

export interface KnowledgeSearchResult {
  chunk: KnowledgeChunk
  document: KnowledgeDocument
  score: number
}

export interface IngestDocumentRequest {
  title: string
  category: KnowledgeCategory
  platform?: Platform
  tags: string[]
  content?: string
}
