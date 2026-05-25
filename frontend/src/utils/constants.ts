export const PLATFORMS = [
  { value: 'amazon', label: 'Amazon' },
  { value: 'shopify', label: 'Shopify' },
  { value: 'ebay', label: 'eBay' },
  { value: 'etsy', label: 'Etsy' },
] as const

export const KNOWLEDGE_CATEGORIES = [
  { value: 'platform_rules', label: 'Platform Rules' },
  { value: 'templates', label: 'Templates' },
  { value: 'history', label: 'History' },
] as const

export const FILE_ACCEPT_TYPES = '.csv,.xlsx,.xls,.txt'
export const FILE_ACCEPT_EXTENSIONS = ['.csv', '.xlsx', '.xls', '.txt']
