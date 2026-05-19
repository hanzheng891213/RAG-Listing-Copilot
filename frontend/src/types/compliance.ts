export type CheckStatus = 'green' | 'yellow' | 'red'

export interface Violation {
  rule_id: string
  category: string
  severity: 'high' | 'medium' | 'low'
  description: string
  policy_ref: string
  suggestion: string
}

export interface ComplianceCheck {
  id: number
  product_id: number
  overall_status: CheckStatus
  violations: Violation[]
  policy_refs: string[]
  weee_mark: boolean
  ce_mark: boolean
  created_at: string
}

export interface PolicyRule {
  id: string
  title: string
  content: string
  category: string
  severity: 'high' | 'medium' | 'low'
}
