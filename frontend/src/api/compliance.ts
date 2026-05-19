import client from './client'
import type { ComplianceCheck, PolicyRule } from '@/types/compliance'

export const complianceApi = {
  check(productId: number) {
    return client.post<ComplianceCheck>(`/compliance/check/${productId}`)
  },

  getCheck(checkId: number) {
    return client.get<ComplianceCheck>(`/compliance/check/${checkId}`)
  },

  searchRules(query: string) {
    return client.get<PolicyRule[]>('/compliance/rules/', { params: { q: query } })
  },

  uploadRule(formData: FormData) {
    return client.post('/compliance/rules/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
  }
}
