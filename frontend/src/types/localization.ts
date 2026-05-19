export interface Localization {
  id: number
  product_id: number
  input_cn: string
  output_de: string
  output_html: string
  competitor_refs: string[]
  style_refs: string[]
  seo_score: number
  model_name: string
  token_count: number
  created_at: string
}

export interface SSEEvent {
  type: 'chunk' | 'meta' | 'done'
  data: string | object
}
