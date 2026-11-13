import { ref } from 'vue'
import { useListingStore } from '@/stores/listingStore'
import { PLATFORMS } from '@/utils/constants'

/**
 * Listing-page plumbing that is not tied to a product source.
 *
 * The product list itself lives in `useGridProducts` (the 上架表 is the single
 * source of truth), so nothing here filters or caches upload data any more.
 */
export function useListingGenerator() {
  const store = useListingStore()
  const previewTab = ref<'title' | 'bullets' | 'description'>('bullets')

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
    previewTab,
    platforms: PLATFORMS,
    handleRegenerate,
    handleExport,
    copyToClipboard,
  }
}
