import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { SupplierProduct, ParseResult } from '@/types/supplier'
import { generateId } from '@/utils/formatters'

export const useSupplierStore = defineStore('supplier', () => {
  const products = ref<SupplierProduct[]>([])
  const selectedIds = ref<Set<string>>(new Set())
  const parseErrors = ref<ParseResult['errors']>([])
  const currentFileName = ref('')
  const isEditing = ref(false)
  const editingProduct = ref<SupplierProduct | null>(null)

  const selectedProducts = computed(() =>
    products.value.filter((p) => selectedIds.value.has(p.id)),
  )

  const pendingFile = ref<File | null>(null)

  const hasProducts = computed(() => products.value.length > 0)

  function setProducts(newProducts: SupplierProduct[]) {
    products.value = newProducts.map((p) => ({
      ...p,
      id: p.id || generateId(),
    }))
  }

  function addManualProduct(product: Omit<SupplierProduct, 'id'>) {
    products.value.push({
      ...product,
      id: generateId(),
    })
  }

  function updateProduct(id: string, updates: Partial<SupplierProduct>) {
    const index = products.value.findIndex((p) => p.id === id)
    if (index !== -1) {
      products.value[index] = { ...products.value[index], ...updates }
    }
  }

  function removeProduct(id: string) {
    products.value = products.value.filter((p) => p.id !== id)
    selectedIds.value.delete(id)
  }

  function toggleSelect(id: string) {
    const newSet = new Set(selectedIds.value)
    if (newSet.has(id)) {
      newSet.delete(id)
    } else {
      newSet.add(id)
    }
    selectedIds.value = newSet
  }

  function toggleSelectAll() {
    if (selectedIds.value.size === products.value.length) {
      selectedIds.value = new Set()
    } else {
      selectedIds.value = new Set(products.value.map((p) => p.id))
    }
  }

  function clearAll() {
    products.value = []
    selectedIds.value = new Set()
    parseErrors.value = []
    currentFileName.value = ''
  }

  function startEditing(product: SupplierProduct) {
    editingProduct.value = { ...product }
    isEditing.value = true
  }

  function saveEditing() {
    if (editingProduct.value) {
      updateProduct(editingProduct.value.id, editingProduct.value)
    }
    isEditing.value = false
    editingProduct.value = null
  }

  function cancelEditing() {
    isEditing.value = false
    editingProduct.value = null
  }

  function setPendingFile(file: File | null) {
    pendingFile.value = file
  }

  return {
    products,
    selectedIds,
    parseErrors,
    currentFileName,
    isEditing,
    editingProduct,
    pendingFile,
    selectedProducts,
    hasProducts,
    setProducts,
    addManualProduct,
    updateProduct,
    removeProduct,
    toggleSelect,
    toggleSelectAll,
    clearAll,
    startEditing,
    saveEditing,
    cancelEditing,
    setPendingFile,
  }
})
