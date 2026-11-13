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
  isDemo?: boolean
}

export interface ComplianceResult {
  rule: string
  passed: boolean
  message: string
  severity: 'error' | 'warning' | 'info'
  flaggedContent?: string
}

/** One entry in the listing tab strip: a generated session for a table row. */
export interface ListingTab {
  id: string
  label: string
  generating: boolean
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
