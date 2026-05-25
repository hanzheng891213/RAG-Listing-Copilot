import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { KnowledgeDocument, KnowledgeCategory, SearchResult } from '@/types/knowledge'
import { generateId } from '@/utils/formatters'

// Demo seed data
const seedDocuments: KnowledgeDocument[] = [
  {
    id: '1',
    title: 'Amazon Prohibited Seller Activities',
    category: 'platform_rules',
    tags: ['amazon', 'prohibited', 'compliance'],
    excerpt: 'Comprehensive guide on Amazon prohibited seller activities and actions, including listing restrictions and policy violations.',
    content: '',
    platform: 'amazon',
    fileType: 'pdf',
    fileSize: 245000,
    uploadedAt: '2026-05-10T08:00:00Z',
    updatedAt: '2026-05-10T08:00:00Z',
  },
  {
    id: '2',
    title: 'Electronics Listing Best Practices',
    category: 'templates',
    tags: ['electronics', 'template', 'seo'],
    excerpt: 'Proven electronics category listing template with optimized bullet points structure and keyword placement strategies.',
    content: '',
    platform: 'amazon',
    fileType: 'md',
    fileSize: 12800,
    uploadedAt: '2026-05-12T10:30:00Z',
    updatedAt: '2026-05-15T14:20:00Z',
  },
  {
    id: '3',
    title: 'eBay Category-Specific Requirements',
    category: 'platform_rules',
    tags: ['ebay', 'category', 'requirements'],
    excerpt: 'Detailed eBay category listing requirements including item specifics, condition descriptions, and product identifiers.',
    content: '',
    platform: 'ebay',
    fileType: 'pdf',
    fileSize: 180000,
    uploadedAt: '2026-05-08T09:15:00Z',
    updatedAt: '2026-05-08T09:15:00Z',
  },
  {
    id: '4',
    title: 'Home & Kitchen Template v2',
    category: 'templates',
    tags: ['home', 'kitchen', 'template'],
    excerpt: 'Updated Home & Kitchen listing template with enhanced A+ content structure and lifestyle image guidelines.',
    content: '',
    platform: 'shopify',
    fileType: 'md',
    fileSize: 9600,
    uploadedAt: '2026-05-14T16:45:00Z',
    updatedAt: '2026-05-18T11:00:00Z',
  },
  {
    id: '5',
    title: 'Bluetooth Speaker - Successful Listing',
    category: 'history',
    tags: ['electronics', 'bluetooth', 'speaker', 'success'],
    excerpt: 'Successfully approved Amazon listing for Bluetooth speaker with 4.5-star rating. Generated using RAG template.',
    content: '',
    platform: 'amazon',
    fileType: 'json',
    fileSize: 4500,
    uploadedAt: '2026-05-16T13:20:00Z',
    updatedAt: '2026-05-16T13:20:00Z',
  },
  {
    id: '6',
    title: 'Shopify SEO Optimization Guide',
    category: 'templates',
    tags: ['shopify', 'seo', 'optimization'],
    excerpt: 'Shopify-specific SEO guide covering title tags, meta descriptions, URL handles, and alt text best practices.',
    content: '',
    platform: 'shopify',
    fileType: 'md',
    fileSize: 15400,
    uploadedAt: '2026-05-11T07:30:00Z',
    updatedAt: '2026-05-11T07:30:00Z',
  },
  {
    id: '7',
    title: 'Restricted Keywords Database',
    category: 'platform_rules',
    tags: ['keywords', 'restricted', 'compliance', 'all-platforms'],
    excerpt: 'Curated database of restricted and prohibited keywords across Amazon, eBay, Shopify, and Etsy platforms.',
    content: '',
    platform: 'amazon',
    fileType: 'csv',
    fileSize: 32000,
    uploadedAt: '2026-05-09T11:00:00Z',
    updatedAt: '2026-05-17T09:30:00Z',
  },
  {
    id: '8',
    title: 'LED Strip Lights - Rejected & Fixed',
    category: 'history',
    tags: ['electronics', 'led', 'rejected', 'fixed'],
    excerpt: 'Initially rejected Amazon listing for LED strip lights. Documented fix: removed unverified wattage claims.',
    content: '',
    platform: 'amazon',
    fileType: 'json',
    fileSize: 5800,
    uploadedAt: '2026-05-13T15:10:00Z',
    updatedAt: '2026-05-13T15:10:00Z',
  },
]

export const useKnowledgeStore = defineStore('knowledge', () => {
  const documents = ref<KnowledgeDocument[]>(seedDocuments)
  const searchQuery = ref('')
  const activeTab = ref<KnowledgeCategory>('platform_rules')
  const activePlatform = ref<string>('')
  const results = ref<SearchResult[]>([])
  const isSearching = ref(false)

  const filteredDocuments = computed(() => {
    let filtered = documents.value.filter((d) => d.category === activeTab.value)

    if (activePlatform.value) {
      filtered = filtered.filter((d) => d.platform === activePlatform.value)
    }

    if (searchQuery.value.trim()) {
      const q = searchQuery.value.toLowerCase()
      filtered = filtered.filter(
        (d) =>
          d.title.toLowerCase().includes(q) ||
          d.tags.some((t) => t.includes(q)) ||
          d.excerpt.toLowerCase().includes(q),
      )
    }

    return filtered
  })

  const tabCounts = computed(() => ({
    platform_rules: documents.value.filter((d) => d.category === 'platform_rules').length,
    templates: documents.value.filter((d) => d.category === 'templates').length,
    history: documents.value.filter((d) => d.category === 'history').length,
  }))

  function setTab(tab: KnowledgeCategory) {
    activeTab.value = tab
    searchQuery.value = ''
  }

  function setPlatform(platform: string) {
    activePlatform.value = activePlatform.value === platform ? '' : platform
  }

  function addDocument(doc: Omit<KnowledgeDocument, 'id'>) {
    documents.value.unshift({
      ...doc,
      id: generateId(),
    })
  }

  function removeDocument(id: string) {
    documents.value = documents.value.filter((d) => d.id !== id)
  }

  function search(q: string) {
    searchQuery.value = q
  }

  return {
    documents,
    searchQuery,
    activeTab,
    activePlatform,
    results,
    isSearching,
    filteredDocuments,
    tabCounts,
    setTab,
    setPlatform,
    addDocument,
    removeDocument,
    search,
  }
})
