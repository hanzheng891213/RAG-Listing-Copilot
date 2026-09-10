/**
 * Core Knowledge Service — RAG ingestion, search, and compliance.
 *
 * Orchestrates chunking → embedding → vector storage → retrieval.
 * Dual backend: Cloudflare (Vectorize + D1 + Workers AI) and local (in-memory).
 */

import { v4 as uuid } from 'uuid'
import { chunkMarkdown } from './chunker.js'
import { createEmbedder, cosineSimilarity, type Embedder, type LocalEmbedder } from './embedder.js'
import { createVectorStore, type VectorStore, type VectorRecord } from './vectorStore.js'
import type {
  KnowledgeDocument,
  KnowledgeChunk,
  KnowledgeSearchResult,
  KnowledgeCategory,
  KnowledgeContext,
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
  titleZh: string
  contentZh: string
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

/**
 * Retrieval is fetched as one wide pool and then split by category, rather than
 * run as two filtered queries: `category` is only filterable via a Vectorize
 * metadata index, and the pool approach needs no index and no re-upsert.
 *
 * The pool has to be wide because template documents embed product examples in
 * their body, so a product query scores them above the policy documents — at
 * top-4 the regulations were crowded out entirely.
 */
const RETRIEVAL_POOL_CHUNKS = 20

/** Regulations injected as authoritative policy. Each chunk is ~512 chars. */
const DEFAULT_RULE_CHUNKS = 4

/** Style-reference chunks injected alongside the regulations. */
const DEFAULT_STYLE_CHUNKS = 2

/** Category whose chunks state binding platform policy. */
const RULE_CATEGORY = 'platform_rules'

/** Category whose chunks are listing structure examples, not policy. */
const STYLE_CATEGORY = 'templates'

/** Renders chunks as markdown sections for prompt injection. */
function formatChunks(results: KnowledgeSearchResult[]): string {
  return results
    .map((r) => {
      const { title, platform } = r.chunk.metadata
      const source = platform ? `${title} [${platform}]` : title
      return `### ${source}\n${r.chunk.content}`
    })
    .join('\n\n')
}

function emptyContext(): KnowledgeContext {
  return { rules: '', style: '' }
}

export type DocLang = 'en' | 'zh'

/** Vector id for one chunk. The language is part of the id so a document's
 *  English and Chinese chunks can coexist in the same index. */
function chunkVectorId(docId: string, lang: DocLang, index: number): string {
  return `${docId}-${lang}-${index}`
}

/** The language bodies a document carries, skipping any that are empty. */
function documentBodies(
  content: string,
  contentZh?: string,
): Array<{ lang: DocLang; text: string }> {
  const bodies: Array<{ lang: DocLang; text: string }> = []
  if (content.trim()) bodies.push({ lang: 'en', text: content })
  if (contentZh?.trim()) bodies.push({ lang: 'zh', text: contentZh })
  return bodies
}

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
      titleZh?: string
      contentZh?: string
    },
  ): Promise<KnowledgeDocument> {
    const docId = uuid()
    const now = new Date().toISOString()

    // Chunk and embed every language body. Cross-lingual matching (a Chinese
    // query against an English body) is weak even with a multilingual model, so
    // each language gets its own vectors and queries hit their own language.
    const vectorRecords: VectorRecord[] = []
    let chunkCount = 0

    for (const body of documentBodies(content, metadata.contentZh)) {
      const chunkTexts = chunkMarkdown(body.text)
      const embeddings = await this.embedder.embed(chunkTexts)

      chunkTexts.forEach((_, i) => {
        vectorRecords.push({
          id: chunkVectorId(docId, body.lang, i),
          values: embeddings[i],
          metadata: {
            documentId: docId,
            lang: body.lang,
            platform: metadata.platform ?? '',
            category: metadata.category,
            title: metadata.title,
            chunkIndex: String(i),
          },
        })
      })

      chunkCount += chunkTexts.length
    }

    // Document metadata first: if this write fails, no vectors are left behind.
    // Upserting vectors first would strand them — invisible to listDocuments and
    // enough to make searchKnowledge throw on the missing metadata row.
    const docRecord: DocRecord = {
      id: docId,
      title: metadata.title,
      category: metadata.category,
      platform: metadata.platform ?? '',
      tags: JSON.stringify(metadata.tags),
      content,
      titleZh: metadata.titleZh ?? '',
      contentZh: metadata.contentZh ?? '',
      fileType: metadata.fileType ?? 'txt',
      fileSize: metadata.fileSize ?? Buffer.byteLength(content, 'utf8'),
      chunkCount,
      createdAt: now,
      updatedAt: now,
    }

    if (this.d1Binding) {
      await this.d1Binding
        .prepare(
          `INSERT INTO documents (id, title, category, platform, tags, content, title_zh, content_zh, file_type, file_size, chunk_count, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          docRecord.id,
          docRecord.title,
          docRecord.category,
          docRecord.platform,
          docRecord.tags,
          docRecord.content,
          docRecord.titleZh,
          docRecord.contentZh,
          docRecord.fileType,
          docRecord.fileSize,
          docRecord.chunkCount,
          docRecord.createdAt,
          docRecord.updatedAt,
        )
        .run()
    }

    await this.docStore.insert(docRecord)

    // Vectors last, so a failed metadata write can't strand them.
    await this.vectorStore.upsert(vectorRecords)

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

    // A wide pool returns many chunks from the same few documents, and each miss
    // costs a D1 round trip. Cache per call so each document is fetched once.
    const docCache = new Map<string, DocRecord | null>()

    const searchResults: KnowledgeSearchResult[] = []
    for (const r of results) {
      const docId = r.metadata.documentId
      if (!docId) continue

      let doc = docCache.get(docId)
      if (doc === undefined) {
        doc = await this.docStore.getById(docId)
        if (!doc && this.d1Binding) {
          const row = await this.d1Binding
            .prepare('SELECT * FROM documents WHERE id = ?')
            .bind(docId)
            .first()
          if (row) doc = this.rowToDocRecord(row)
        }
        docCache.set(docId, doc ?? null)
      }
      if (!doc) continue

      const chunkIndex = parseInt(r.metadata.chunkIndex ?? '0')
      const lang: DocLang = r.metadata.lang === 'zh' ? 'zh' : 'en'
      const body = lang === 'zh' ? doc.contentZh : doc.content
      // Only the matched chunk is stored in the vector record, so recover its
      // text by re-running the (deterministic) chunker over the matching body.
      const chunkText = chunkMarkdown(body ?? '')[chunkIndex] ?? ''

      searchResults.push({
        score: r.score,
        chunk: {
          id: r.id,
          documentId: docId,
          content: chunkText,
          chunkIndex,
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

  /**
   * Prompt-ready excerpts of the chunks most relevant to `query`, split into
   * the two roles the generation prompt needs: binding platform regulations and
   * style-reference templates.
   *
   * Retrieval is an enhancement, not a hard dependency: either section comes
   * back empty when there is nothing of that category to retrieve, or when the
   * vector store is unavailable.
   */
  async buildPromptContext(
    query: string,
    options?: { platform?: string; poolSize?: number },
  ): Promise<KnowledgeContext> {
    if (!query.trim()) return emptyContext()

    try {
      const pool = await this.searchKnowledge(query, {
        platform: options?.platform,
        topK: options?.poolSize ?? RETRIEVAL_POOL_CHUNKS,
      })

      // searchKnowledge preserves descending score order, so filtering then
      // slicing keeps the best chunk of each category.
      const pick = (category: string, limit: number) =>
        formatChunks(pool.filter((r) => r.chunk.metadata.category === category).slice(0, limit))

      return {
        rules: pick(RULE_CATEGORY, DEFAULT_RULE_CHUNKS),
        style: pick(STYLE_CATEGORY, DEFAULT_STYLE_CHUNKS),
      }
    } catch (err) {
      console.error('[Knowledge] Retrieval failed, generating without context:', err)
      return emptyContext()
    }
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
    // Delete from vector store. getDocument falls back to D1, so the chunk ids
    // are still resolvable when the in-memory store is empty (cold start).
    // Re-derive them from the bodies rather than from chunkCount, which now
    // totals both languages.
    const doc = await this.getDocument(id)
    if (doc) {
      const chunkIds = documentBodies(doc.content, doc.contentZh).flatMap((body) =>
        chunkMarkdown(body.text).map((_, i) => chunkVectorId(id, body.lang, i)),
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
      titleZh?: string
      contentZh?: string
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
          titleZh: doc.titleZh,
          contentZh: doc.contentZh,
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
      titleZh: doc.titleZh || undefined,
      contentZh: doc.contentZh || undefined,
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
      titleZh: row.title_zh ?? '',
      contentZh: row.content_zh ?? '',
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
