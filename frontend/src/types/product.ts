export interface Product {
  id: number
  document_id: number | null
  title_cn: string
  title_de: string
  description_cn: string
  description_de: string
  attributes: Record<string, string>
  status: 'draft' | 'extracted' | 'corrected' | 'localized' | 'compliant'
  extraction_refs: string[]
  created_at: string
  updated_at: string
}
