import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { KnowledgeDocument, KnowledgeCategory, SearchResult } from '@/types/knowledge'
import { generateId } from '@/utils/formatters'
import i18n from '@/locales'
import { listDocuments, searchKnowledge, uploadDocument, deleteDocument } from '@/api/knowledge'

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
  { id: 'seed-1', title: 'Amazon Selling Policies & Code of Conduct', excerpt: 'Complete seller code of conduct covering accurate information, fair conduct, review manipulation, communications, and multiple account policies.', tags: ['amazon', 'code-of-conduct', 'compliance'], category: 'platform_rules', platform: 'amazon', fileType: 'md', fileSize: 3200 },
  { id: 'seed-2', title: 'Amazon Prohibited & Restricted Products', excerpt: 'Categories of prohibited and restricted products, ungating requirements, prohibited claims and keywords, and marketplace-specific variations.', tags: ['amazon', 'restricted', 'compliance'], category: 'platform_rules', platform: 'amazon', fileType: 'md', fileSize: 4500 },
  { id: 'seed-3', title: 'Amazon Product Detail Page Rules', excerpt: 'Title, image, bullet point, description, and variation requirements with compliance checklist.', tags: ['amazon', 'listing', 'detail-page'], category: 'platform_rules', platform: 'amazon', fileType: 'md', fileSize: 5500 },
  { id: 'seed-4', title: 'Product Safety & Compliance Certifications', excerpt: 'FDA, CPC, CE, FCC certification requirements by product category and marketplace.', tags: ['compliance', 'safety', 'certification'], category: 'platform_rules', platform: 'amazon', fileType: 'md', fileSize: 4800 },
  { id: 'seed-5', title: 'Category Listing Restrictions', excerpt: 'Gated categories including Jewelry, Beauty, Baby, Automotive with approval requirements and application process.', tags: ['categories', 'gated', 'approval'], category: 'platform_rules', platform: 'amazon', fileType: 'md', fileSize: 6200 },
  { id: 'seed-6', title: 'Electronics Listing Template', excerpt: 'Optimized template for electronics category with structured bullet points and keyword placement.', tags: ['electronics', 'template', 'seo'], category: 'templates', platform: 'amazon', fileType: 'md', fileSize: 2800 },
  { id: 'seed-7', title: 'Home & Kitchen Template', excerpt: 'Home & Kitchen listing template with A+ content structure and lifestyle image guidelines.', tags: ['home', 'kitchen', 'template'], category: 'templates', platform: 'amazon', fileType: 'md', fileSize: 2400 },
  { id: 'seed-8', title: 'Restricted Keywords Database', excerpt: 'Database of prohibited claims and restricted keywords across all platforms.', tags: ['keywords', 'restricted', 'all-platforms'], category: 'platform_rules', platform: 'amazon', fileType: 'md', fileSize: 3800 },
]

const SEED_DOCS_ZH: SeedDoc[] = [
  { id: 'seed-1', title: '亚马逊销售政策与卖家行为准则', excerpt: '完整的卖家行为准则，涵盖准确信息、公平行事、评论操纵、通信规则和多账户政策。', tags: ['亚马逊', '行为准则', '合规'], category: 'platform_rules', platform: 'amazon', fileType: 'md', fileSize: 3200 },
  { id: 'seed-2', title: '亚马逊禁售与受限商品政策', excerpt: '禁售和受限商品类别、解除限制要求、禁止声明和关键词、各站点差异。', tags: ['亚马逊', '受限', '合规'], category: 'platform_rules', platform: 'amazon', fileType: 'md', fileSize: 4500 },
  { id: 'seed-3', title: '亚马逊商品详情页规则', excerpt: '标题、图片、五点描述、产品描述和变体要求，附合规检查清单。', tags: ['亚马逊', '上架', '详情页'], category: 'platform_rules', platform: 'amazon', fileType: 'md', fileSize: 5500 },
  { id: 'seed-4', title: '产品安全与合规认证', excerpt: 'FDA、CPC、CE、FCC 认证要求，按产品类别和站点分类。', tags: ['合规', '安全', '认证'], category: 'platform_rules', platform: 'amazon', fileType: 'md', fileSize: 4800 },
  { id: 'seed-5', title: '品类准入与分类审核', excerpt: '受限类别包括珠宝、美容、婴儿、汽车等，附批准要求和申请流程。', tags: ['品类', '受限', '批准'], category: 'platform_rules', platform: 'amazon', fileType: 'md', fileSize: 6200 },
  { id: 'seed-6', title: '电子产品上架模板', excerpt: '电子产品类目优化模板，包含结构化五点描述和关键词布局。', tags: ['电子产品', '模板', 'SEO'], category: 'templates', platform: 'amazon', fileType: 'md', fileSize: 2800 },
  { id: 'seed-7', title: '家居厨房模板', excerpt: '家居厨房上架模板，包含 A+ 内容结构和生活场景图片指南。', tags: ['家居', '厨房', '模板'], category: 'templates', platform: 'amazon', fileType: 'md', fileSize: 2400 },
  { id: 'seed-8', title: '受限关键词数据库', excerpt: '所有平台的禁止声明和受限关键词数据库。', tags: ['关键词', '受限', '全平台'], category: 'platform_rules', platform: 'amazon', fileType: 'md', fileSize: 3800 },
]

const SEED_IDS = ['seed-1', 'seed-2', 'seed-3', 'seed-4', 'seed-5', 'seed-6', 'seed-7', 'seed-8']
const FIXED_DATES: Record<string, { uploadedAt: string; updatedAt: string }> = {
  'seed-1': { uploadedAt: '2026-06-30T08:00:00Z', updatedAt: '2026-06-30T08:00:00Z' },
  'seed-2': { uploadedAt: '2026-06-30T08:00:00Z', updatedAt: '2026-06-30T08:00:00Z' },
  'seed-3': { uploadedAt: '2026-06-30T08:00:00Z', updatedAt: '2026-06-30T08:00:00Z' },
  'seed-4': { uploadedAt: '2026-06-30T08:00:00Z', updatedAt: '2026-06-30T08:00:00Z' },
  'seed-5': { uploadedAt: '2026-06-30T08:00:00Z', updatedAt: '2026-06-30T08:00:00Z' },
  'seed-6': { uploadedAt: '2026-06-30T08:00:00Z', updatedAt: '2026-06-30T08:00:00Z' },
  'seed-7': { uploadedAt: '2026-06-30T08:00:00Z', updatedAt: '2026-06-30T08:00:00Z' },
  'seed-8': { uploadedAt: '2026-06-30T08:00:00Z', updatedAt: '2026-06-30T08:00:00Z' },
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
    chunkCount: 1,
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
  const isLoading = ref(false)
  const serverAvailable = ref(false)

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

  // ── Server sync ──────────────────────────────────────────────────

  async function fetchFromServer() {
    isLoading.value = true
    try {
      const res = await listDocuments()
      const serverDocs = res.data.documents.map((d: any) => ({
        ...d,
        excerpt: d.content?.slice(0, 200) ?? '',
        uploadedAt: d.createdAt ?? d.uploadedAt,
        chunkCount: d.chunkCount ?? 1,
      }))
      // Merge: keep seed docs, add server docs
      const userDocs = documents.value.filter((d) => !SEED_IDS.includes(d.id))
      documents.value = [...serverDocs, ...userDocs]
      serverAvailable.value = true
    } catch {
      // Server not available, keep local data
    } finally {
      isLoading.value = false
    }
  }

  async function searchOnServer(q: string, platform?: string) {
    isSearching.value = true
    try {
      const res = await searchKnowledge(q, platform)
      results.value = (res.data.results ?? []).map((r: any) => ({
        document: {
          ...r.document,
          excerpt: r.document.content?.slice(0, 200) ?? r.document.excerpt ?? '',
          uploadedAt: r.document.createdAt ?? r.document.uploadedAt ?? '',
          chunkCount: r.document.chunkCount ?? 1,
        },
        score: r.score ?? 0,
      }))
      serverAvailable.value = true
    } catch {
      // Fall back to local search
      results.value = []
    } finally {
      isSearching.value = false
    }
  }

  async function uploadToServer(doc: {
    title: string
    category: KnowledgeCategory
    platform?: string
    tags: string[]
    content: string
    file?: File
  }): Promise<boolean> {
    try {
      const formData = new FormData()
      if (doc.file) {
        formData.append('file', doc.file)
      }
      formData.append('title', doc.title)
      formData.append('category', doc.category)
      if (doc.platform) formData.append('platform', doc.platform)
      formData.append('tags', JSON.stringify(doc.tags))
      if (doc.content) formData.append('content', doc.content)

      await uploadDocument(formData)
      serverAvailable.value = true
      await fetchFromServer()
      return true
    } catch {
      return false
    }
  }

  async function deleteFromServer(id: string): Promise<boolean> {
    try {
      await deleteDocument(id)
      await fetchFromServer()
      return true
    } catch {
      return false
    }
  }

  return {
    documents,
    searchQuery,
    activeTab,
    activePlatform,
    results,
    isSearching,
    isLoading,
    serverAvailable,
    filteredDocuments,
    tabCounts,
    setTab,
    setPlatform,
    addDocument,
    removeDocument,
    search,
    refreshLocale,
    fetchFromServer,
    searchOnServer,
    uploadToServer,
    deleteFromServer,
  }
})
