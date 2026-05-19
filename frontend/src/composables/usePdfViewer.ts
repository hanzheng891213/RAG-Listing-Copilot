import { ref, shallowRef } from 'vue'

export function usePdfViewer() {
  const pdfDoc = shallowRef<any>(null)
  const currentPage = ref(1)
  const totalPages = ref(0)
  const highlights = ref<{ page: number; rect: number[]; chunkId: string }[]>([])
  const loading = ref(false)

  async function load(url: string) {
    loading.value = true
    try {
      const pdfjsLib = await import('pdfjs-dist')
      pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js'

      const doc = await pdfjsLib.getDocument(url).promise
      pdfDoc.value = doc
      totalPages.value = doc.numPages
    } catch (e) {
      console.error('PDF 加载失败:', e)
    } finally {
      loading.value = false
    }
  }

  function setHighlights(items: { page: number; rect: number[]; chunkId: string }[]) {
    highlights.value = items
  }

  function goToPage(page: number) {
    if (page >= 1 && page <= totalPages.value) {
      currentPage.value = page
    }
  }

  function scrollToChunk(chunkId: string) {
    const h = highlights.value.find(x => x.chunkId === chunkId)
    if (h) goToPage(h.page)
  }

  return { pdfDoc, currentPage, totalPages, highlights, loading, load, setHighlights, goToPage, scrollToChunk }
}
