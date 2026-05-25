import { ref } from 'vue'
import { useKnowledgeStore } from '@/stores/knowledgeStore'
import type { KnowledgeDocument, KnowledgeCategory } from '@/types/knowledge'
import { formatDate } from '@/utils/formatters'

export function useKnowledgeBase() {
  const store = useKnowledgeStore()
  const uploadDialogVisible = ref(false)
  const selectedDoc = ref<KnowledgeDocument | null>(null)
  const detailVisible = ref(false)

  function viewDocument(doc: KnowledgeDocument) {
    selectedDoc.value = doc
    detailVisible.value = true
  }

  function formatDocDate(date: string) {
    return formatDate(date)
  }

  function getCategoryLabel(category: KnowledgeCategory) {
    const labels: Record<KnowledgeCategory, string> = {
      platform_rules: 'Platform Rules',
      templates: 'Templates',
      history: 'History',
    }
    return labels[category]
  }

  function getCategoryTagType(category: KnowledgeCategory) {
    const types: Record<KnowledgeCategory, 'danger' | 'success' | 'info'> = {
      platform_rules: 'danger',
      templates: 'success',
      history: 'info',
    }
    return types[category]
  }

  return {
    store,
    uploadDialogVisible,
    selectedDoc,
    detailVisible,
    viewDocument,
    formatDocDate,
    getCategoryLabel,
    getCategoryTagType,
  }
}
