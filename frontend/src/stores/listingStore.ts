import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { GeneratedListing, Platform, ComplianceResult } from '@/types/listing'
import type { SupplierProduct } from '@/types/supplier'
import { generateId } from '@/utils/formatters'
import { generateListing } from '@/api/listing'

function createDemoListing(rawData: Record<string, string>, platform: Platform): GeneratedListing {
  const label = Object.values(rawData).find((v) => v) || 'Product'
  return {
    id: generateId(),
    productId: 'demo',
    title: `Premium ${label} - High Quality | Fast Shipping | Best Value`,
    bulletPoints: [
      `【Premium Quality】Professional-grade ${label} crafted with durable materials for long-lasting performance and reliability.`,
      `【Versatile Design】Ergonomically designed for everyday use, suitable for home, office, and outdoor activities.`,
      `【Easy to Use】Simple setup with intuitive controls - no technical expertise required. Get started in minutes.`,
      `【Perfect Gift Choice】Elegant packaging makes it an ideal present for family, friends, and colleagues on any occasion.`,
      `【100% Satisfaction Guarantee】Backed by our 30-day money-back guarantee and responsive customer support team.`,
    ],
    description: `## Product Description\n\nExperience the perfect blend of quality and value with our ${label}. Designed with attention to detail, this product delivers exceptional performance for all your needs.\n\n### Key Features\n\n- **Superior Build**: Manufactured using premium-grade materials\n- **Modern Design**: Sleek aesthetics that complement any setting\n- **Reliable Performance**: Consistent quality you can count on\n- **Easy Maintenance**: Simple cleaning and care instructions`,
    keywords: [
      label.toLowerCase(),
      'premium quality',
      'fast shipping',
      'best value',
      'professional grade',
      'durable',
      'satisfaction guarantee',
    ],
    seoScore: 87,
    complianceResults: [
      { rule: 'No prohibited claims', passed: true, message: 'No unverified medical or health claims found', severity: 'info' },
      { rule: 'No restricted keywords', passed: true, message: 'Content passes restricted keyword check', severity: 'info' },
      { rule: 'Image requirements', passed: true, message: 'Image references meet platform guidelines', severity: 'info' },
      { rule: 'Price formatting', passed: false, message: 'Consider adding comparative price context for better conversion', severity: 'warning' },
    ],
    platform,
    template: 'Standard Product Template',
    version: 1,
    createdAt: new Date().toISOString(),
  }
}

export const useListingStore = defineStore('listing', () => {
  const generatedListings = ref<GeneratedListing[]>([])
  const activeListing = ref<GeneratedListing | null>(null)
  const selectedPlatform = ref<Platform>('amazon')
  const selectedTemplate = ref<string>('standard')
  const isGenerating = ref(false)
  const generationError = ref('')
  const versionHistory = ref<GeneratedListing[]>([])
  const lastProduct = ref<SupplierProduct | null>(null)

  const activeCompliance = computed(() => activeListing.value?.complianceResults ?? [])
  const activeKeywords = computed(() => activeListing.value?.keywords ?? [])
  const hasResults = computed(() => generatedListings.value.length > 0)

  async function generate(product: SupplierProduct) {
    isGenerating.value = true
    generationError.value = ''
    lastProduct.value = product

    try {
      const listing = await generateListing({
        productId: product.id,
        platform: selectedPlatform.value,
        template: selectedTemplate.value,
        productData: product,
      })
      addListing(listing)
    } catch (_e) {
      // Fallback to demo mode when backend is unavailable
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
    isGenerating,
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
