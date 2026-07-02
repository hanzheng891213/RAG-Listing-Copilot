/**
 * Core Knowledge Service — RAG ingestion, search, and compliance.
 *
 * Orchestrates chunking → embedding → vector storage → retrieval.
 * Dual backend: Cloudflare (Vectorize + D1 + Workers AI) and local (in-memory).
 */

import { v4 as uuid } from 'uuid'
import { chunkMarkdown } from './chunker.js'
import { createEmbedder, cosineSimilarity, type Embedder, type LocalEmbedder } from './embedder.js'
import { createVectorStore, type VectorStore } from './vectorStore.js'
import type {
  KnowledgeDocument,
  KnowledgeChunk,
  KnowledgeSearchResult,
  KnowledgeCategory,
  ComplianceResult,
  Platform,
} from '../../types/index.js'

// ─── In-memory document store (replaces D1 in local dev) ─────────────

interface DocRecord {
  id: string
  title: string
  category: string
  platform: string
  tags: string
  content: string
  fileType: string
  fileSize: number
  chunkCount: number
  createdAt: string
  updatedAt: string
}

class DocumentStore {
  private docs = new Map<string, DocRecord>()

  async insert(doc: DocRecord): Promise<void> {
    this.docs.set(doc.id, doc)
  }

  async getById(id: string): Promise<DocRecord | null> {
    return this.docs.get(id) ?? null
  }

  async list(filter?: { category?: string; platform?: string }): Promise<DocRecord[]> {
    let result = [...this.docs.values()]
    if (filter?.category) {
      result = result.filter((d) => d.category === filter.category)
    }
    if (filter?.platform) {
      result = result.filter((d) => d.platform === filter.platform)
    }
    result.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    return result
  }

  async delete(id: string): Promise<void> {
    this.docs.delete(id)
  }

  async count(): Promise<number> {
    return this.docs.size
  }
}

// ─── Knowledge Service ────────────────────────────────────────────────

export class KnowledgeService {
  private embedder: Embedder
  private vectorStore: VectorStore
  private docStore: DocumentStore
  private d1Binding: any

  constructor(options: {
    aiBinding?: any
    vectorizeBinding?: any
    d1Binding?: any
  }) {
    this.embedder = createEmbedder(options.aiBinding)
    this.vectorStore = createVectorStore(options.vectorizeBinding)
    this.docStore = new DocumentStore()
    this.d1Binding = options.d1Binding
  }

  // ── Ingestion ─────────────────────────────────────────────────────

  /**
   * Ingest a document: parse → chunk → embed → store.
   */
  async ingestDocument(
    content: string,
    metadata: {
      title: string
      category: KnowledgeCategory
      platform?: Platform
      tags: string[]
      fileType?: string
      fileSize?: number
    },
  ): Promise<KnowledgeDocument> {
    const docId = uuid()
    const now = new Date().toISOString()

    // Chunk
    const chunkTexts = chunkMarkdown(content)
    const chunks: KnowledgeChunk[] = chunkTexts.map((text, i) => ({
      id: `${docId}-chunk-${i}`,
      documentId: docId,
      content: text,
      chunkIndex: i,
      metadata: {
        platform: metadata.platform ?? '',
        category: metadata.category,
        title: metadata.title,
      },
    }))

    // Embed
    const embeddings = await this.embedder.embed(chunkTexts)

    // Store in vector store
    const vectorRecords = chunks.map((chunk, i) => ({
      id: chunk.id,
      values: embeddings[i],
      metadata: {
        documentId: docId,
        platform: metadata.platform ?? '',
        category: metadata.category,
        title: metadata.title,
        chunkIndex: String(i),
      },
    }))
    await this.vectorStore.upsert(vectorRecords)

    // Store document metadata
    const docRecord: DocRecord = {
      id: docId,
      title: metadata.title,
      category: metadata.category,
      platform: metadata.platform ?? '',
      tags: JSON.stringify(metadata.tags),
      content,
      fileType: metadata.fileType ?? 'txt',
      fileSize: metadata.fileSize ?? Buffer.byteLength(content, 'utf8'),
      chunkCount: chunks.length,
      createdAt: now,
      updatedAt: now,
    }

    if (this.d1Binding) {
      await this.d1Binding
        .prepare(
          `INSERT INTO documents (id, title, category, platform, tags, content, file_type, file_size, chunk_count, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          docRecord.id,
          docRecord.title,
          docRecord.category,
          docRecord.platform,
          docRecord.tags,
          docRecord.content,
          docRecord.fileType,
          docRecord.fileSize,
          docRecord.chunkCount,
          docRecord.createdAt,
          docRecord.updatedAt,
        )
        .run()
    }

    await this.docStore.insert(docRecord)

    return this.toKnowledgeDocument(docRecord)
  }

  // ── Search ────────────────────────────────────────────────────────

  /**
   * Semantic search over the knowledge base.
   */
  async searchKnowledge(
    query: string,
    options?: { platform?: string; topK?: number },
  ): Promise<KnowledgeSearchResult[]> {
    const queryEmbedding = await this.embedder.embed([query])
    const filter: Record<string, string> = {}
    if (options?.platform) {
      filter.platform = options.platform
    }

    const results = await this.vectorStore.query(queryEmbedding[0], {
      topK: options?.topK ?? 5,
      filter: Object.keys(filter).length > 0 ? filter : undefined,
    })

    const searchResults: KnowledgeSearchResult[] = []
    for (const r of results) {
      const docId = r.metadata.documentId
      if (!docId) continue

      let doc = await this.docStore.getById(docId)
      if (!doc && this.d1Binding) {
        const row = await this.d1Binding
          .prepare('SELECT * FROM documents WHERE id = ?')
          .bind(docId)
          .first()
        if (row) doc = this.rowToDocRecord(row)
      }
      if (!doc) continue

      searchResults.push({
        score: r.score,
        chunk: {
          id: r.id,
          documentId: docId,
          content: '', // content is in the document
          chunkIndex: parseInt(r.metadata.chunkIndex ?? '0'),
          metadata: {
            platform: doc.platform,
            category: doc.category,
            title: doc.title,
          },
        },
        document: this.toKnowledgeDocument(doc),
      })
    }

    return searchResults
  }

  // ── Compliance ────────────────────────────────────────────────────

  /** Hardcoded restricted keywords (fast path, always checked). */
  private restrictedKeywords = [
    'guaranteed cure', 'FDA approved', '100% effective', 'miracle',
    'limited stock', 'best in the world', 'authentic', 'OEM',
    'prescription', 'no side effects',
  ]

  /**
   * Enhanced compliance check:
   * 1. Fast path: keyword blacklist
   * 2. Semantic path: retrieve relevant rules and flag issues
   */
  async checkCompliance(text: string, platform?: string): Promise<ComplianceResult[]> {
    const results: ComplianceResult[] = []
    const lowerText = text.toLowerCase()

    // Fast path: keyword check
    for (const kw of this.restrictedKeywords) {
      if (lowerText.includes(kw.toLowerCase())) {
        results.push({
          rule: `Restricted keyword: "${kw}"`,
          passed: false,
          message: `Listing contains the restricted keyword or phrase: "${kw}". Remove or rephrase.`,
          severity: 'error',
          flaggedContent: kw,
        })
      }
    }

    // Title length check
    if (text.length > 200) {
      results.push({
        rule: 'Title length',
        passed: true,
        message: `Title is ${text.length} characters (max 200 recommended). Consider shortening.`,
        severity: 'warning',
      })
    }

    // Semantic path: search for relevant rules
    try {
      const relevant = await this.searchKnowledge(text, { platform, topK: 3 })
      if (relevant.length > 0) {
        // Check if the text might violate any retrieved rules
        for (const r of relevant) {
          const ruleContent = r.document.title + ' ' + (r.document.content?.slice(0, 300) ?? '')
          // Simple heuristic: if the query is highly similar to a rule document,
          // flag it for review (info only, not auto-fail)
          if (r.score > 0.6) {
            results.push({
              rule: r.document.title,
              passed: true,
              message: `Relevant policy found (score: ${(r.score * 100).toFixed(0)}%). Ensure your listing complies with this rule.`,
              severity: 'info',
            })
          }
        }
      }
    } catch {
      // Semantic check is best-effort; don't fail if it's unavailable
    }

    // If no errors found, indicate clean
    if (results.filter((r) => r.severity === 'error').length === 0) {
      results.push({
        rule: 'Restricted keywords',
        passed: true,
        message: 'No restricted keywords or phrases found in the listing.',
        severity: 'info',
      })
    }

    return results
  }

  // ── CRUD ──────────────────────────────────────────────────────────

  async listDocuments(
    category?: string,
    platform?: string,
  ): Promise<KnowledgeDocument[]> {
    let docs: DocRecord[] = []

    if (this.d1Binding) {
      let query = 'SELECT * FROM documents WHERE 1=1'
      const params: any[] = []
      if (category) {
        query += ' AND category = ?'
        params.push(category)
      }
      if (platform) {
        query += ' AND platform = ?'
        params.push(platform)
      }
      query += ' ORDER BY created_at DESC'
      const result = await this.d1Binding.prepare(query).bind(...params).all()
      docs = (result.results ?? []).map((r: any) => this.rowToDocRecord(r))
    } else {
      docs = await this.docStore.list({ category, platform })
    }

    return docs.map((d) => this.toKnowledgeDocument(d))
  }

  async getDocument(id: string): Promise<KnowledgeDocument | null> {
    let doc = await this.docStore.getById(id)
    if (!doc && this.d1Binding) {
      const row = await this.d1Binding
        .prepare('SELECT * FROM documents WHERE id = ?')
        .bind(id)
        .first()
      if (row) doc = this.rowToDocRecord(row)
    }
    return doc ? this.toKnowledgeDocument(doc) : null
  }

  async deleteDocument(id: string): Promise<void> {
    // Delete from vector store
    const doc = await this.docStore.getById(id)
    if (doc) {
      const chunkIds = Array.from(
        { length: doc.chunkCount },
        (_, i) => `${id}-chunk-${i}`,
      )
      await this.vectorStore.deleteByIds(chunkIds)
    }

    // Delete from document store
    await this.docStore.delete(id)
    if (this.d1Binding) {
      await this.d1Binding.prepare('DELETE FROM documents WHERE id = ?').bind(id).run()
    }
  }

  // ── Seed from content array ──────────────────────────────────────

  async seedDocuments(
    docs: Array<{
      title: string
      content: string
      category: KnowledgeCategory
      platform?: Platform
      tags: string[]
    }>,
  ): Promise<number> {
    let count = 0
    for (const doc of docs) {
      try {
        await this.ingestDocument(doc.content, {
          title: doc.title,
          category: doc.category,
          platform: doc.platform,
          tags: doc.tags,
          fileType: 'md',
        })
        count++
      } catch (err) {
        console.error(`[KnowledgeService] Failed to seed document "${doc.title}":`, err)
      }
    }
    return count
  }

  async getStats(): Promise<{ documentCount: number; totalChunks: number }> {
    const docs = await this.listDocuments()
    const totalChunks = docs.reduce((sum, d) => sum + d.chunkCount, 0)
    return { documentCount: docs.length, totalChunks }
  }

  // ── Helpers ──────────────────────────────────────────────────────

  private toKnowledgeDocument(doc: DocRecord): KnowledgeDocument {
    return {
      id: doc.id,
      title: doc.title,
      category: doc.category as KnowledgeCategory,
      platform: (doc.platform || undefined) as Platform | undefined,
      tags: safeJsonParse(doc.tags, []),
      content: doc.content,
      fileType: doc.fileType,
      fileSize: doc.fileSize,
      chunkCount: doc.chunkCount,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    }
  }

  private rowToDocRecord(row: any): DocRecord {
    return {
      id: row.id,
      title: row.title,
      category: row.category,
      platform: row.platform ?? '',
      tags: row.tags ?? '[]',
      content: row.content ?? '',
      fileType: row.file_type ?? 'txt',
      fileSize: row.file_size ?? 0,
      chunkCount: row.chunk_count ?? 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }
}

function safeJsonParse(str: string, fallback: any): any {
  try {
    return JSON.parse(str)
  } catch {
    return fallback
  }
}

// ─── Singleton ────────────────────────────────────────────────────────

let instance: KnowledgeService | null = null

export function getKnowledgeService(options?: {
  aiBinding?: any
  vectorizeBinding?: any
  d1Binding?: any
}): KnowledgeService {
  if (!instance) {
    instance = new KnowledgeService(options ?? {})
  }
  return instance
}

export function resetKnowledgeService(): void {
  instance = null
}
