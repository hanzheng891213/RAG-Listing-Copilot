import { ref, computed } from 'vue'
import { useListingStore } from '@/stores/listingStore'
import { useSupplierStore } from '@/stores/supplierStore'
import { useSupplierParser } from '@/composables/useSupplierParser'
import { PLATFORMS } from '@/utils/constants'
import type { Platform } from '@/types/listing'
import type { SupplierProduct } from '@/types/supplier'

export function useListingGenerator() {
  const store = useListingStore()
  const supplierStore = useSupplierStore()
  const { getProductLabel } = useSupplierParser()
  const productSearch = ref('')
  const previewTab = ref<'title' | 'bullets' | 'description'>('bullets')

  const filteredProducts = computed(() => {
    if (!productSearch.value.trim()) return supplierStore.products
    const q = productSearch.value.toLowerCase()
    return supplierStore.products.filter((p) =>
      Object.values(p.rawData).some((v) => v.toLowerCase().includes(q)),
    )
  })

  async function handleGenerate(product: SupplierProduct) {
    await store.generate(product)
  }

  function handleRegenerate() {
    store.regenerate()
  }

  function handleExport(format: 'csv' | 'json') {
    const content = store.exportListing(format)
    if (!content) return

    const mime = format === 'json' ? 'application/json' : 'text/csv'
    const blob = new Blob([content], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `listing-${Date.now()}.${format}`
    a.click()
    URL.revokeObjectURL(url)
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text)
  }

  return {
    store,
    productSearch,
    previewTab,
    filteredProducts,
    platforms: PLATFORMS,
    getProductLabel,
    handleGenerate,
    handleRegenerate,
    handleExport,
    copyToClipboard,
  }
}
