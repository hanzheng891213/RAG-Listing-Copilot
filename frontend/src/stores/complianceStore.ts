import { defineStore } from 'pinia'
import { ref } from 'vue'
import { complianceApi } from '@/api/compliance'
import type { ComplianceCheck, PolicyRule } from '@/types/compliance'

export const useComplianceStore = defineStore('compliance', () => {
  const currentCheck = ref<ComplianceCheck | null>(null)
  const rules = ref<PolicyRule[]>([])
  const loading = ref(false)

  async function runCheck(productId: number) {
    loading.value = true
    try {
      const res = await complianceApi.check(productId)
      currentCheck.value = res.data
      return res.data
    } finally {
      loading.value = false
    }
  }

  async function fetchCheck(checkId: number) {
    const res = await complianceApi.getCheck(checkId)
    currentCheck.value = res.data
  }

  async function searchRules(query: string) {
    const res = await complianceApi.searchRules(query)
    rules.value = res.data
  }

  async function uploadRule(formData: FormData) {
    await complianceApi.uploadRule(formData)
  }

  return {
    currentCheck, rules, loading,
    runCheck, fetchCheck, searchRules, uploadRule
  }
})
