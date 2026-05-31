import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { KnowledgeDocument, KnowledgeCategory, SearchResult } from '@/types/knowledge'
import { generateId } from '@/utils/formatters'
import i18n from '@/locales'

interface SeedDoc {
  id: string
  title: string
  excerpt: string
  tags: string[]
  category: KnowledgeCategory
  platform: string
  fileType: string
  fileSize: number
}

const SEED_DOCS_EN: SeedDoc[] = [
  { id: '1', title: 'Amazon Prohibited Seller Activities', excerpt: 'Comprehensive guide on Amazon prohibited seller activities and actions, including listing restrictions and policy violations.', tags: ['amazon', 'prohibited', 'compliance'], category: 'platform_rules', platform: 'amazon', fileType: 'pdf', fileSize: 245000 },
  { id: '2', title: 'Electronics Listing Best Practices', excerpt: 'Proven electronics category listing template with optimized bullet points structure and keyword placement strategies.', tags: ['electronics', 'template', 'seo'], category: 'templates', platform: 'amazon', fileType: 'md', fileSize: 12800 },
  { id: '3', title: 'eBay Category-Specific Requirements', excerpt: 'Detailed eBay category listing requirements including item specifics, condition descriptions, and product identifiers.', tags: ['ebay', 'category', 'requirements'], category: 'platform_rules', platform: 'ebay', fileType: 'pdf', fileSize: 180000 },
  { id: '4', title: 'Home & Kitchen Template v2', excerpt: 'Updated Home & Kitchen listing template with enhanced A+ content structure and lifestyle image guidelines.', tags: ['home', 'kitchen', 'template'], category: 'templates', platform: 'shopify', fileType: 'md', fileSize: 9600 },
  { id: '5', title: 'Bluetooth Speaker - Successful Listing', excerpt: 'Successfully approved Amazon listing for Bluetooth speaker with 4.5-star rating. Generated using RAG template.', tags: ['electronics', 'bluetooth', 'speaker', 'success'], category: 'history', platform: 'amazon', fileType: 'json', fileSize: 4500 },
  { id: '6', title: 'Shopify SEO Optimization Guide', excerpt: 'Shopify-specific SEO guide covering title tags, meta descriptions, URL handles, and alt text best practices.', tags: ['shopify', 'seo', 'optimization'], category: 'templates', platform: 'shopify', fileType: 'md', fileSize: 15400 },
  { id: '7', title: 'Restricted Keywords Database', excerpt: 'Curated database of restricted and prohibited keywords across Amazon, eBay, Shopify, and Etsy platforms.', tags: ['keywords', 'restricted', 'compliance', 'all-platforms'], category: 'platform_rules', platform: 'amazon', fileType: 'csv', fileSize: 32000 },
  { id: '8', title: 'LED Strip Lights - Rejected & Fixed', excerpt: 'Initially rejected Amazon listing for LED strip lights. Documented fix: removed unverified wattage claims.', tags: ['electronics', 'led', 'rejected', 'fixed'], category: 'history', platform: 'amazon', fileType: 'json', fileSize: 5800 },
]

const SEED_DOCS_ZH: SeedDoc[] = [
  { id: '1', title: '亚马逊禁止卖家行为指南', excerpt: '亚马逊禁止卖家活动和行为的全面指南，包括上架限制和政策违规说明。', tags: ['亚马逊', '禁止', '合规'], category: 'platform_rules', platform: 'amazon', fileType: 'pdf', fileSize: 245000 },
  { id: '2', title: '电子产品上架最佳实践', excerpt: '经过验证的电子产品类目上架模板，包含优化的五点描述结构和关键词布局策略。', tags: ['电子产品', '模板', 'SEO'], category: 'templates', platform: 'amazon', fileType: 'md', fileSize: 12800 },
  { id: '3', title: 'eBay 品类特定要求', excerpt: '详细的 eBay 品类上架要求，包括商品特性、状况描述和产品标识符说明。', tags: ['eBay', '品类', '要求'], category: 'platform_rules', platform: 'ebay', fileType: 'pdf', fileSize: 180000 },
  { id: '4', title: '家居厨房模板 v2', excerpt: '更新版家居厨房上架模板，包含增强的 A+ 内容结构和生活场景图片指南。', tags: ['家居', '厨房', '模板'], category: 'templates', platform: 'shopify', fileType: 'md', fileSize: 9600 },
  { id: '5', title: '蓝牙音箱 - 成功上架案例', excerpt: '已成功通过审核的亚马逊蓝牙音箱上架信息，评分 4.5 星。使用 RAG 模板生成。', tags: ['电子产品', '蓝牙', '音箱', '成功'], category: 'history', platform: 'amazon', fileType: 'json', fileSize: 4500 },
  { id: '6', title: 'Shopify SEO 优化指南', excerpt: 'Shopify 专属 SEO 指南，涵盖标题标签、元描述、URL 处理和图片 alt 文本最佳实践。', tags: ['Shopify', 'SEO', '优化'], category: 'templates', platform: 'shopify', fileType: 'md', fileSize: 15400 },
  { id: '7', title: '受限关键词数据库', excerpt: '精心整理的亚马逊、eBay、Shopify 和 Etsy 平台受限和禁止关键词数据库。', tags: ['关键词', '受限', '合规', '全平台'], category: 'platform_rules', platform: 'amazon', fileType: 'csv', fileSize: 32000 },
  { id: '8', title: 'LED 灯带 - 被拒与修复案例', excerpt: '初次被拒的亚马逊 LED 灯带上架信息。修复记录：移除了未经验证的功率声明。', tags: ['电子产品', 'LED', '被拒', '已修复'], category: 'history', platform: 'amazon', fileType: 'json', fileSize: 5800 },
]

const SEED_IDS = ['1', '2', '3', '4', '5', '6', '7', '8']
const FIXED_DATES: Record<string, { uploadedAt: string; updatedAt: string }> = {
  '1': { uploadedAt: '2026-05-10T08:00:00Z', updatedAt: '2026-05-10T08:00:00Z' },
  '2': { uploadedAt: '2026-05-12T10:30:00Z', updatedAt: '2026-05-15T14:20:00Z' },
  '3': { uploadedAt: '2026-05-08T09:15:00Z', updatedAt: '2026-05-08T09:15:00Z' },
  '4': { uploadedAt: '2026-05-14T16:45:00Z', updatedAt: '2026-05-18T11:00:00Z' },
  '5': { uploadedAt: '2026-05-16T13:20:00Z', updatedAt: '2026-05-16T13:20:00Z' },
  '6': { uploadedAt: '2026-05-11T07:30:00Z', updatedAt: '2026-05-11T07:30:00Z' },
  '7': { uploadedAt: '2026-05-09T11:00:00Z', updatedAt: '2026-05-17T09:30:00Z' },
  '8': { uploadedAt: '2026-05-13T15:10:00Z', updatedAt: '2026-05-13T15:10:00Z' },
}

function buildSeedDocuments(docs: SeedDoc[]): KnowledgeDocument[] {
  return docs.map((d) => ({
    id: d.id,
    title: d.title,
    category: d.category,
    tags: d.tags,
    excerpt: d.excerpt,
    content: '',
    platform: d.platform,
    fileType: d.fileType,
    fileSize: d.fileSize,
    ...FIXED_DATES[d.id],
  }))
}

export const useKnowledgeStore = defineStore('knowledge', () => {
  const locale = i18n.global.locale.value as string
  const documents = ref<KnowledgeDocument[]>(
    buildSeedDocuments(locale === 'zh' ? SEED_DOCS_ZH : SEED_DOCS_EN),
  )
  const searchQuery = ref('')
  const activeTab = ref<KnowledgeCategory>('platform_rules')
  const activePlatform = ref<string>('')
  const results = ref<SearchResult[]>([])
  const isSearching = ref(false)

  function refreshLocale() {
    const loc = i18n.global.locale.value as string
    const newSeeds = buildSeedDocuments(loc === 'zh' ? SEED_DOCS_ZH : SEED_DOCS_EN)
    const userDocs = documents.value.filter((d) => !SEED_IDS.includes(d.id))
    documents.value = [...newSeeds, ...userDocs]
  }

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
    refreshLocale,
  }
})
