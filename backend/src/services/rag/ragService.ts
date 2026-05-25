import type { SupplierProduct } from '../types/index.js'

// In-memory knowledge base for demo
const platformRules = [
  {
    id: '1',
    title: 'Amazon Prohibited Claims',
    platform: 'amazon',
    rules: [
      'No unverified medical claims',
      'No "FDA approved" without certification',
      'No "100% effective" or similar absolute claims',
      'No false scarcity ("limited stock", "selling fast")',
      'No competitor comparisons in title',
    ],
  },
  {
    id: '2',
    title: 'eBay Restricted Keywords',
    platform: 'ebay',
    rules: [
      'No "authentic" without proof',
      'No "OEM" without authorization',
      'No prescription drug references',
      'No trademark misuse',
    ],
  },
]

const restrictedKeywords = [
  'guaranteed cure',
  'FDA approved',
  '100% effective',
  'miracle',
  'limited stock',
  'best in the world',
  'authentic',
  'OEM',
  'prescription',
]

const seoTemplates: Record<string, { keywords: string[]; structure: string[] }> = {
  electronics: {
    keywords: ['premium quality', 'fast shipping', 'durable', 'professional grade', 'high performance'],
    structure: ['brand + model', 'key feature', 'compatibility', 'use case', 'guarantee'],
  },
  home: {
    keywords: ['home decor', 'modern design', 'easy to use', 'gift idea', 'space saving'],
    structure: ['style + type', 'material', 'dimensions', 'use scenario', 'care instructions'],
  },
  default: {
    keywords: ['premium quality', 'best value', 'fast shipping', 'satisfaction guarantee', 'professional grade'],
    structure: ['product type', 'key benefit', 'target audience', 'unique selling point', 'guarantee'],
  },
}

export class RAGService {
  searchRelevantDocs(query: string, platform?: string) {
    let rules = platformRules
    if (platform) {
      rules = rules.filter((r) => r.platform === platform)
    }

    const allRules = rules.flatMap((r) => r.rules)
    const matchedRules = allRules.filter((r) =>
      r.toLowerCase().includes(query.toLowerCase()),
    )

    return {
      platformRules: matchedRules.length > 0 ? matchedRules : allRules.slice(0, 3),
      restrictedKeywords,
      seoTemplate: seoTemplates.default,
    }
  }

  checkCompliance(text: string, platform?: string) {
    const results: Array<{
      rule: string
      passed: boolean
      message: string
      severity: 'error' | 'warning' | 'info'
      flaggedContent?: string
    }> = []

    for (const keyword of restrictedKeywords) {
      if (text.toLowerCase().includes(keyword.toLowerCase())) {
        results.push({
          rule: 'Restricted Keywords',
          passed: false,
          message: `Found restricted keyword: "${keyword}"`,
          severity: 'error',
          flaggedContent: keyword,
        })
      }
    }

    if (text.length > 200) {
      results.push({
        rule: 'Title Length',
        passed: false,
        message: `Title exceeds 200 characters (${text.length}/200)`,
        severity: 'warning',
      })
    }

    if (results.filter((r) => r.severity === 'error').length === 0) {
      results.push({
        rule: 'Restricted Keywords',
        passed: true,
        message: 'No restricted keywords found',
        severity: 'info',
      })
    }

    return results
  }
}

export const ragService = new RAGService()
