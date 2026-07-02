export type KnowledgeCategory = 'platform_rules' | 'templates' | 'history'

export interface KnowledgeDocument {
  id: string
  title: string
  category: KnowledgeCategory
  tags: string[]
  excerpt: string
  content: string
  platform?: string
  fileType: string
  fileSize: number
  chunkCount: number
  uploadedAt: string
  updatedAt: string
}

export interface SearchResult {
  document: KnowledgeDocument
  score: number
}
