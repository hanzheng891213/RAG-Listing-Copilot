export type KnowledgeCategory = 'platform_rules' | 'templates' | 'history'

export interface KnowledgeDocument {
  id: string
  title: string
  category: KnowledgeCategory
  tags: string[]
  excerpt: string
  /** Canonical English body — the one that was embedded and is searched. */
  content: string
  /** Chinese display title, when the document has a translation. */
  titleZh?: string
  /** Chinese display body, when the document has a translation. */
  contentZh?: string
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
