import { ref } from 'vue'
import { useDocumentStore } from '@/stores/documentStore'

export function useDocumentParser() {
  const store = useDocumentStore()
  const parsing = ref(false)
  const progress = ref(0)
  const error = ref<string | null>(null)

  async function parse(documentId: number) {
    parsing.value = true
    error.value = null
    progress.value = 0

    try {
      progress.value = 30
      await store.parse(documentId)
      progress.value = 100
    } catch (e: any) {
      error.value = e.message || '解析失败'
    } finally {
      parsing.value = false
    }
  }

  return { parsing, progress, error, parse }
}
