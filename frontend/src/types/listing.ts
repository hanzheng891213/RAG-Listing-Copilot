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

export interface ListingTemplate {
  id: string
  name: string
  platform: Platform
  category: string
  structure: TemplateSection[]
}

export interface TemplateSection {
  name: string
  required: boolean
  maxLength?: number
  format: 'text' | 'markdown' | 'html'
}
