import { ref } from 'vue'
import { useKnowledgeStore } from '@/stores/knowledgeStore'
import { listDocuments } from '@/api/knowledge'
import type { KnowledgeDocument, KnowledgeCategory } from '@/types/knowledge'
import { formatDate } from '@/utils/formatters'

export function useKnowledgeBase() {
  const store = useKnowledgeStore()
  const uploadDialogVisible = ref(false)
  const selectedDoc = ref<KnowledgeDocument | null>(null)
  const detailVisible = ref(false)
  const contentLoading = ref(false)

  async function viewDocument(doc: KnowledgeDocument) {
    selectedDoc.value = doc
    detailVisible.value = true

    // 如果 content 为空，从后端拉取完整文档
    if (!doc.content) {
      contentLoading.value = true
      try {
        // 种子文档 ID 与服务端不一致，用标题匹配
        const res = await listDocuments()
        const match = res.documents?.find((d: any) => d.title === doc.title)
        if (match?.content) {
          selectedDoc.value = { ...doc, content: match.content }
          store.updateDocumentContent(doc.id, match.content)
        }
      } catch {
        // 后端不可用时使用 excerpt
      } finally {
        contentLoading.value = false
      }
    }
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
