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

/** Listing generation target languages */
export const LISTING_LANGUAGES = [
  { value: 'english', label: 'listing.languages.english' },
  { value: 'spanish', label: 'listing.languages.spanish' },
  { value: 'french', label: 'listing.languages.french' },
  { value: 'german', label: 'listing.languages.german' },
  { value: 'russian', label: 'listing.languages.russian' },
  { value: 'thai', label: 'listing.languages.thai' },
  { value: 'vietnamese', label: 'listing.languages.vietnamese' },
] as const

export type ListingLanguage = (typeof LISTING_LANGUAGES)[number]['value']
