import { defineStore } from 'pinia'
import { ref } from 'vue'
import { productsApi } from '@/api/products'
import type { Product } from '@/types/product'

export const useProductStore = defineStore('product', () => {
  const products = ref<Product[]>([])
  const currentProduct = ref<Product | null>(null)
  const loading = ref(false)

  async function fetchAll(params?: Record<string, unknown>) {
    loading.value = true
    try {
      const res = await productsApi.list(params)
      products.value = res.data
    } finally {
      loading.value = false
    }
  }

  async function fetchOne(id: number) {
    const res = await productsApi.get(id)
    currentProduct.value = res.data
  }

  async function create(data: Partial<Product>) {
    const res = await productsApi.create(data)
    products.value.unshift(res.data)
    return res.data
  }

  async function update(id: number, data: Partial<Product>) {
    const res = await productsApi.update(id, data)
    const idx = products.value.findIndex(p => p.id === id)
    if (idx !== -1) products.value[idx] = res.data
    if (currentProduct.value?.id === id) currentProduct.value = res.data
    return res.data
  }

  async function extract(documentId: number) {
    const res = await productsApi.extract(documentId)
    return res.data
  }

  return {
    products, currentProduct, loading,
    fetchAll, fetchOne, create, update, extract
  }
})
