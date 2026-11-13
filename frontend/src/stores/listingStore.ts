import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { GeneratedListing, Platform, ComplianceResult } from '@/types/listing'
import type { SupplierProduct } from '@/types/supplier'
import type { ListingPatch } from '@/api/chat'
import { generateId } from '@/utils/formatters'
import { generateListing, generateListingStream } from '@/api/listing'
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
  /**
   * Every generated listing kept for the tab bar, newest first. This used to be
   * reset on each generation; keeping the sessions is what lets the middle panel
   * and the chat panel switch between products without regenerating them.
   */
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
  /** Which session the in-flight stream belongs to, so switching tabs can't misroute a pause. */
  const generatingListingId = ref('')
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

  function findListing(productId: string): GeneratedListing | undefined {
    return generatedListings.value.find((item) => item.productId === productId)
  }

  /** Adds a listing reconstructed from the table only when no live session owns the row. */
  function hydrateListing(listing: GeneratedListing): void {
    if (findListing(listing.productId)) return
    generatedListings.value.push(listing)
  }

  /**
   * Writes a streamed update back into both the session list and the active
   * panel. If the user switched tabs mid-stream the active panel is another
   * listing and must not be overwritten.
   */
  function replaceSession(listingId: string, next: GeneratedListing): void {
    const index = generatedListings.value.findIndex((item) => item.id === listingId)
    if (index >= 0) generatedListings.value[index] = next
    if (activeListing.value?.id === listingId) activeListing.value = next
  }

  async function generate(product: SupplierProduct, language?: string) {
    const modelStore = useModelStore()
    const activeProvider = modelStore.activeConfig?.providerId

    lastProduct.value = product
    if (language) selectedLanguage.value = language
    generationError.value = ''

    // Only this product's previous result is replaced; other products stay in
    // the tab bar. Generating again must not wipe the whole batch history.
    generatedListings.value = generatedListings.value.filter(
      (item) => item.productId !== product.id,
    )
    receivedFields.value = new Set()

    // Use streaming for all users
    isStreaming.value = true
    isGenerating.value = true

    // Read apiKey and config from modelStore (keys are in localStorage only)
    const activeCfg = modelStore.activeConfig

    // Create a placeholder listing that gets filled progressively
    const placeholder = createEmptyListing(product, selectedPlatform.value)
    generatingListingId.value = placeholder.id
    generatedListings.value.unshift(placeholder)
    activeListing.value = placeholder
    versionHistory.value = [placeholder]

    let session = placeholder
    const apply = (patch: Partial<GeneratedListing>) => {
      session = { ...session, ...patch }
      replaceSession(session.id, session)
    }

    streamController = generateListingStream(
      {
        productId: product.id,
        platform: selectedPlatform.value,
        template: selectedTemplate.value,
        productData: product,
        providerId: activeProvider,
        language: selectedLanguage.value,
        apiKey: activeCfg?.apiKey,
        model: activeCfg?.activeModel,
        temperature: activeCfg?.temperature,
        maxTokens: activeCfg?.maxTokens,
      },
      // onField
      (field: string, value: any) => {
        receivedFields.value = new Set(receivedFields.value).add(field)
        if (field === 'title') apply({ title: value })
        else if (field === 'description') apply({ description: value })
        else if (field === 'bulletPoints') apply({ bulletPoints: value })
        else if (field === 'keywords') apply({ keywords: value })
      },
      // onDone
      (listing: GeneratedListing, complianceResults: ComplianceResult[]) => {
        apply({ ...listing, complianceResults, seoScore: 85 })
        isStreaming.value = false
        isGenerating.value = false
        generatingListingId.value = ''
        streamController = null
      },
      // onError
      (message: string) => {
        console.error('[Generate] Stream error:', message)
        generationError.value = message
        isStreaming.value = false
        streamController = null
        // Fallback: if no title received yet, try non-streaming. Keep
        // `isGenerating` true until the fallback settles, otherwise the batch
        // would see an empty listing and report a failure while it is still
        // being generated. The fallback patches the same session id.
        if (!session.title) {
          generatingListingId.value = session.id
          void tryNonStreaming(product, language, session.id)
        } else {
          isGenerating.value = false
          generatingListingId.value = ''
        }
      },
    )
  }

  async function tryNonStreaming(product: SupplierProduct, language: string | undefined, listingId: string) {
    const modelStore = useModelStore()
    const activeCfg = modelStore.activeConfig
    const base = generatedListings.value.find((item) => item.id === listingId)
    try {
      const listing = (await generateListing({
        productId: product.id,
        platform: selectedPlatform.value,
        template: selectedTemplate.value,
        productData: product,
        providerId: activeCfg?.providerId,
        language: language || selectedLanguage.value,
        apiKey: activeCfg?.apiKey,
        model: activeCfg?.activeModel,
        temperature: activeCfg?.temperature,
        maxTokens: activeCfg?.maxTokens,
      })) as unknown as GeneratedListing
      // The user stopped this session (or started another) while the fallback
      // was in flight; its late result must not resurrect or overwrite it.
      if (generatingListingId.value !== listingId) return
      replaceSession(listingId, {
        ...(base ?? createEmptyListing(product, selectedPlatform.value)),
        ...listing,
        id: listingId,
        productId: product.id,
      })
      // The fallback recovered the failed stream; its error banner is stale now.
      generationError.value = ''
    } catch (err) {
      if (generatingListingId.value !== listingId) return
      const message = err instanceof Error ? err.message : String(err)
      generationError.value = i18n.global.t('listing.backendUnavailable') + ' (' + message + ')'
      const demo = createDemoListing(product.rawData, selectedPlatform.value)
      replaceSession(listingId, {
        ...(base ?? createEmptyListing(product, selectedPlatform.value)),
        ...demo,
        id: listingId,
        productId: product.id,
      })
    } finally {
      // A paused-then-resumed batch may already own a newer generation; an old
      // fallback finishing late must not clear its flags.
      if (generatingListingId.value === listingId) {
        isStreaming.value = false
        isGenerating.value = false
        generatingListingId.value = ''
      }
    }
  }

  /**
   * Stops the stream the user is paying for. An empty placeholder is removed so
   * an aborted batch item does not leave a blank tab behind; any previously
   * generated listing becomes active again.
   */
  function stopGeneration(): void {
    if (streamController) {
      streamController.abort()
      streamController = null
    }
    isStreaming.value = false
    isGenerating.value = false

    const id = generatingListingId.value
    generatingListingId.value = ''
    if (!id) return

    const target = generatedListings.value.find((item) => item.id === id)
    if (!target) return
    const hasContent = Boolean(
      target.title || target.description || (target.bulletPoints?.length ?? 0) > 0,
    )
    if (hasContent) return

    generatedListings.value = generatedListings.value.filter((item) => item.id !== id)
    versionHistory.value = versionHistory.value.filter((item) => item.id !== id)
    if (activeListing.value?.id === id) activeListing.value = generatedListings.value[0] ?? null
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
    versionHistory.value = [listing]
  }

  /**
   * Merges an AI suggestion into the active listing.
   *
   * Only fields that actually differ are written, so clicking "apply" on a
   * suggestion that changed nothing (or hitting the same suggestion twice)
   * cannot bump the version or dirty the row for no reason. Returns the list of
   * changed field keys for the UI.
   */
  function applyPatch(patch: ListingPatch): string[] {
    const current = activeListing.value
    if (!current) return []

    const next: GeneratedListing = { ...current }
    const changed: string[] = []

    if (typeof patch.title === 'string') {
      const title = patch.title.trim()
      if (title && title !== current.title) {
        next.title = title
        changed.push('title')
      }
    }
    if (Array.isArray(patch.bulletPoints)) {
      const bullets = patch.bulletPoints
        .map((point) => String(point ?? '').trim())
        .filter(Boolean)
      if (bullets.length > 0 && JSON.stringify(bullets) !== JSON.stringify(current.bulletPoints)) {
        next.bulletPoints = bullets
        changed.push('bulletPoints')
      }
    }
    if (typeof patch.description === 'string') {
      const description = patch.description.trim()
      if (description && description !== current.description) {
        next.description = description
        changed.push('description')
      }
    }
    if (Array.isArray(patch.keywords)) {
      const keywords = patch.keywords
        .map((keyword) => String(keyword ?? '').trim())
        .filter(Boolean)
      if (keywords.length > 0 && JSON.stringify(keywords) !== JSON.stringify(current.keywords)) {
        next.keywords = keywords
        changed.push('keywords')
      }
    }

    if (changed.length === 0) return []

    next.version = (current.version ?? 1) + 1
    activeListing.value = next

    // The list/history hold the same object identity; update them too so an
    // applied patch never becomes stale when the user switches listings.
    const listingIndex = generatedListings.value.findIndex((item) => item.id === current.id)
    if (listingIndex >= 0) generatedListings.value[listingIndex] = next
    const historyIndex = versionHistory.value.findIndex((item) => item.id === current.id)
    if (historyIndex >= 0) versionHistory.value[historyIndex] = next

    return changed
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
    generatingListingId,
    generate,
    regenerate,
    stopGeneration,
    findListing,
    hydrateListing,
    setPlatform,
    setTemplate,
    selectListing,
    applyPatch,
    exportListing,
  }
})
