import { defineStore } from 'pinia'
import { ref } from 'vue'
import { documentsApi } from '@/api/documents'
import type { Document, DocumentChunk } from '@/types/document'

export const useDocumentStore = defineStore('document', () => {
  const documents = ref<Document[]>([])
  const currentDoc = ref<Document | null>(null)
  const chunks = ref<DocumentChunk[]>([])
  const loading = ref(false)

  async function fetchAll() {
    loading.value = true
    try {
      const res = await documentsApi.list()
      documents.value = res.data
    } finally {
      loading.value = false
    }
  }

  async function fetchOne(id: number) {
    const res = await documentsApi.get(id)
    currentDoc.value = res.data
  }

  async function upload(formData: FormData) {
    const res = await documentsApi.upload(formData)
    documents.value.unshift(res.data)
    return res.data
  }

  async function parse(id: number) {
    await documentsApi.parse(id)
    await fetchAll()
  }

  async function fetchChunks(id: number) {
    const res = await documentsApi.getChunks(id)
    chunks.value = res.data
  }

  async function remove(id: number) {
    await documentsApi.remove(id)
    documents.value = documents.value.filter(d => d.id !== id)
  }

  return {
    documents, currentDoc, chunks, loading,
    fetchAll, fetchOne, upload, parse, fetchChunks, remove
  }
})
