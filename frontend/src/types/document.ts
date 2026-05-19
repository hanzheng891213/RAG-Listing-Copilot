export interface Document {
  id: number
  filename: string
  file_type: 'pdf' | 'xlsx' | 'xls' | 'docx' | 'doc'
  file_path: string
  parse_status: 'pending' | 'parsing' | 'completed' | 'failed'
  page_count: number | null
  chunk_count: number | null
  error_message: string | null
  created_at: string
  updated_at: string
}

export interface DocumentChunk {
  id: string
  document_id: number
  content: string
  metadata: Record<string, unknown>
}
