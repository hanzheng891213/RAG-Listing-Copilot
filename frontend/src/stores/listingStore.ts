import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { GeneratedListing, Platform, ComplianceResult } from '@/types/listing'
import type { SupplierProduct } from '@/types/supplier'
import { generateId } from '@/utils/formatters'
import { generateListing, generateListingStream } from '@/api/listing'
import { useAuthStore } from '@/stores/authStore'
import { useModelStore } from '@/stores/modelStore'
import i18n from '@/locales'

function createDemoListing(rawData: Record<string, string>, platform: Platform): GeneratedListing {
  const label = Object.values(rawData).find((v) => v) || 'Product'
  const isZh = i18n.global.locale.value === 'zh'

  return {
    id: generateId(),
    productId: 'demo',
    title: isZh
      ? `优质${label} - 高品质 | 快速发货 | 超值之选`
      : `Premium ${label} - High Quality | Fast Shipping | Best Value`,
    bulletPoints: isZh
      ? [
          `【优质品质】专业级${label}，采用耐用材料精心打造，性能持久可靠。`,
          `【多功能设计】人体工学设计，适用于居家、办公和户外活动等多种场景。`,
          `【简单易用】直观的操作界面，无需专业知识，几分钟即可上手。`,
          `【完美礼品】精美包装，是送给家人、朋友和同事的理想之选，适合任何场合。`,
          `【100%满意保证】提供30天无理由退换货保障和专业客服支持团队。`,
        ]
      : [
          `【Premium Quality】Professional-grade ${label} crafted with durable materials for long-lasting performance and reliability.`,
          `【Versatile Design】Ergonomically designed for everyday use, suitable for home, office, and outdoor activities.`,
          `【Easy to Use】Simple setup with intuitive controls - no technical expertise required. Get started in minutes.`,
          `【Perfect Gift Choice】Elegant packaging makes it an ideal present for family, friends, and colleagues on any occasion.`,
          `【100% Satisfaction Guarantee】Backed by our 30-day money-back guarantee and responsive customer support team.`,
        ],
    description: isZh
      ? `## 产品描述\n\n体验我们的${label}带来的品质与价值的完美融合。这款产品注重细节设计，为您提供卓越的性能体验。\n\n### 核心特点\n\n- **精湛工艺**：采用优质材料制造\n- **时尚设计**：简约美学，百搭各种场景\n- **性能可靠**：始终如一的品质，值得信赖\n- **易于维护**：简单的清洁和保养指南`
      : `## Product Description\n\nExperience the perfect blend of quality and value with our ${label}. Designed with attention to detail, this product delivers exceptional performance for all your needs.\n\n### Key Features\n\n- **Superior Build**: Manufactured using premium-grade materials\n- **Modern Design**: Sleek aesthetics that complement any setting\n- **Reliable Performance**: Consistent quality you can count on\n- **Easy Maintenance**: Simple cleaning and care instructions`,
    keywords: isZh
      ? [label, '优质品质', '快速发货', '超值之选', '专业级', '经久耐用', '满意保证']
      : [label.toLowerCase(), 'premium quality', 'fast shipping', 'best value', 'professional grade', 'durable', 'satisfaction guarantee'],
    seoScore: 87,
    complianceResults: isZh
      ? [
          { rule: '无违规声明', passed: true, message: '未发现未经证实的医疗或健康声明', severity: 'info' as const },
          { rule: '无受限关键词', passed: true, message: '内容通过受限关键词检查', severity: 'info' as const },
          { rule: '图片要求', passed: true, message: '图片引用符合平台规范', severity: 'info' as const },
          { rule: '价格格式', passed: false, message: '建议添加对比价格信息以提高转化率', severity: 'warning' as const },
        ]
      : [
          { rule: 'No prohibited claims', passed: true, message: 'No unverified medical or health claims found', severity: 'info' as const },
          { rule: 'No restricted keywords', passed: true, message: 'Content passes restricted keyword check', severity: 'info' as const },
          { rule: 'Image requirements', passed: true, message: 'Image references meet platform guidelines', severity: 'info' as const },
          { rule: 'Price formatting', passed: false, message: 'Consider adding comparative price context for better conversion', severity: 'warning' as const },
        ],
    platform,
    template: 'Standard Product Template',
    version: 1,
    createdAt: new Date().toISOString(),
    isDemo: true,
  }
}

export const useListingStore = defineStore('listing', () => {
  const generatedListings = ref<GeneratedListing[]>([])
  const activeListing = ref<GeneratedListing | null>(null)
  const selectedPlatform = ref<Platform>('amazon')
  const selectedTemplate = ref<string>('standard')
  const selectedLanguage = ref<string>('english')
  const isGenerating = ref(false)
  const isStreaming = ref(false)
  const generationError = ref('')
  const versionHistory = ref<GeneratedListing[]>([])
  const lastProduct = ref<SupplierProduct | null>(null)
  let streamController: AbortController | null = null

  // 流式生成状态跟踪
  const receivedFields = ref<Set<string>>(new Set())

  const streamingStatusLabel = computed(() => {
    if (!receivedFields.value.has('title')) return '生成标题'
    if (!receivedFields.value.has('bulletPoints')) return '生成五点描述'
    if (!receivedFields.value.has('description')) return '生成详情描述'
    if (!receivedFields.value.has('keywords')) return '检查合规性'
    return '优化中'
  })

  const activeCompliance = computed(() => activeListing.value?.complianceResults ?? [])
  const activeKeywords = computed(() => activeListing.value?.keywords ?? [])
  const hasResults = computed(() => generatedListings.value.length > 0)

  function createEmptyListing(product: SupplierProduct, platform: Platform): GeneratedListing {
    return {
      id: generateId(),
      productId: product.id,
      title: '',
      bulletPoints: [],
      description: '',
      keywords: [],
      seoScore: 0,
      complianceResults: [],
      platform,
      template: 'standard',
      version: 1,
      createdAt: new Date().toISOString(),
      isDemo: false,
    }
  }

  async function generate(product: SupplierProduct, language?: string) {
    // 清除旧的生成结果
    generatedListings.value = []
    activeListing.value = null
    versionHistory.value = []
    receivedFields.value = new Set()

    const auth = useAuthStore()
    const modelStore = useModelStore()
    const activeProvider = modelStore.activeConfig?.providerId

    lastProduct.value = product
    if (language) selectedLanguage.value = language
    generationError.value = ''

    // Visitors always get demo data
    if (!auth.isAdmin) {
      isGenerating.value = true
      console.log('[Generate] Visitor — using demo mode')
      generationError.value = i18n.global.t('listing.demoMode')
      const listing = createDemoListing(product.rawData, selectedPlatform.value)
      addListing(listing)
      return
    }

    // Use streaming for admin users
    isStreaming.value = true
    isGenerating.value = true

    // Create a placeholder listing that gets filled progressively
    const placeholder = createEmptyListing(product, selectedPlatform.value)
    activeListing.value = placeholder
    generatedListings.value.unshift(placeholder)
    versionHistory.value = [placeholder]

    streamController = generateListingStream(
      {
        productId: product.id,
        platform: selectedPlatform.value,
        template: selectedTemplate.value,
        productData: product,
        providerId: activeProvider,
        language: selectedLanguage.value,
      },
      // onField
      (field: string, value: any) => {
        if (!activeListing.value) return
        receivedFields.value = new Set(receivedFields.value).add(field)
        if (field === 'title') activeListing.value = { ...activeListing.value, title: value }
        else if (field === 'description') activeListing.value = { ...activeListing.value, description: value }
        else if (field === 'bulletPoints') activeListing.value = { ...activeListing.value, bulletPoints: value }
        else if (field === 'keywords') activeListing.value = { ...activeListing.value, keywords: value }
      },
      // onDone
      (listing: GeneratedListing, complianceResults: ComplianceResult[]) => {
        if (activeListing.value) {
          activeListing.value = {
            ...activeListing.value,
            ...listing,
            complianceResults,
            seoScore: 85,
          }
        }
        isStreaming.value = false
        isGenerating.value = false
        streamController = null
      },
      // onError
      (message: string) => {
        console.error('[Generate] Stream error:', message)
        generationError.value = message
        isStreaming.value = false
        isGenerating.value = false
        streamController = null
        // Fallback: if no title received yet, try non-streaming
        if (!activeListing.value?.title) {
          tryNonStreaming(product, language)
        }
      },
    )
  }

  async function tryNonStreaming(product: SupplierProduct, language?: string) {
    const modelStore = useModelStore()
    const activeProvider = modelStore.activeConfig?.providerId
    try {
      const listing = await generateListing({
        productId: product.id,
        platform: selectedPlatform.value,
        template: selectedTemplate.value,
        productData: product,
        providerId: activeProvider,
        language: language || selectedLanguage.value,
      })
      addListing(listing)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      generationError.value = i18n.global.t('listing.backendUnavailable') + ' (' + message + ')'
      const listing = createDemoListing(product.rawData, selectedPlatform.value)
      addListing(listing)
    }
  }

  function addListing(listing: GeneratedListing) {
    generatedListings.value.unshift(listing)
    activeListing.value = listing
    versionHistory.value = [listing]
    isGenerating.value = false
  }

  function regenerate() {
    if (!lastProduct.value) return
    isGenerating.value = true

    generate(lastProduct.value)
  }

  function setPlatform(platform: Platform) {
    selectedPlatform.value = platform
  }

  function setTemplate(templateId: string) {
    selectedTemplate.value = templateId
  }

  function selectListing(listing: GeneratedListing) {
    activeListing.value = listing
  }

  function exportListing(format: 'csv' | 'json') {
    if (!activeListing.value) return ''
    if (format === 'json') {
      return JSON.stringify(activeListing.value, null, 2)
    }
    const l = activeListing.value
    return `Title,Bullet Points,Description,Keywords,SEO Score\n"${l.title}","${l.bulletPoints.join(' | ')}","${l.description.replace(/"/g, '""')}","${l.keywords.join(', ')}",${l.seoScore}`
  }

  return {
    generatedListings,
    activeListing,
    selectedPlatform,
    selectedTemplate,
    selectedLanguage,
    isGenerating,
    isStreaming,
    streamingStatusLabel,
    generationError,
    versionHistory,
    lastProduct,
    activeCompliance,
    activeKeywords,
    hasResults,
    generate,
    regenerate,
    setPlatform,
    setTemplate,
    selectListing,
    exportListing,
  }
})
