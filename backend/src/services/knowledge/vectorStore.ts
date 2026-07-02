/**
 * Vector store abstraction for semantic search.
 *
 * Supports:
 * - Cloudflare Vectorize (production)
 * - In-memory store with cosine similarity (local dev)
 */

import { cosineSimilarity } from './embedder.js'

export interface VectorRecord {
  id: string
  values: number[]
  metadata: Record<string, string>
}

export interface QueryResult {
  id: string
  score: number
  metadata: Record<string, string>
}

export interface VectorStore {
  upsert(records: VectorRecord[]): Promise<void>
  query(vector: number[], options?: { topK?: number; filter?: Record<string, string> }): Promise<QueryResult[]>
  deleteByIds(ids: string[]): Promise<void>
}

// ─── Cloudflare Vectorize Store ──────────────────────────────────────

export class CloudflareVectorStore implements VectorStore {
  private binding: any

  constructor(binding: any) {
    this.binding = binding
  }

  async upsert(records: VectorRecord[]): Promise<void> {
    // Vectorize upsert: { id, values, metadata }
    const vectors = records.map((r) => ({
      id: r.id,
      values: r.values,
      metadata: r.metadata,
    }))
    await this.binding.upsert(vectors)
  }

  async query(
    vector: number[],
    options?: { topK?: number; filter?: Record<string, string> },
  ): Promise<QueryResult[]> {
    const results = await this.binding.query(vector, {
      topK: options?.topK ?? 5,
      filter: options?.filter ?? {},
      returnMetadata: 'all',
    })
    return (results.matches ?? []).map((m: any) => ({
      id: m.id,
      score: m.score ?? 0,
      metadata: m.metadata ?? {},
    }))
  }

  async deleteByIds(ids: string[]): Promise<void> {
    await this.binding.deleteByIds(ids)
  }
}

// ─── In-Memory Vector Store (local dev) ──────────────────────────────

interface InMemoryRecord {
  id: string
  values: number[]
  metadata: Record<string, string>
}

export class InMemoryVectorStore implements VectorStore {
  private records: InMemoryRecord[] = []

  async upsert(records: VectorRecord[]): Promise<void> {
    for (const r of records) {
      const idx = this.records.findIndex((e) => e.id === r.id)
      if (idx >= 0) {
        this.records[idx] = { ...r }
      } else {
        this.records.push({ ...r })
      }
    }
  }

  async query(
    vector: number[],
    options?: { topK?: number; filter?: Record<string, string> },
  ): Promise<QueryResult[]> {
    const topK = options?.topK ?? 5
    const filter = options?.filter

    let candidates = this.records
    if (filter && Object.keys(filter).length > 0) {
      candidates = this.records.filter((r) =>
        Object.entries(filter).every(([k, v]) => r.metadata[k] === v),
      )
    }

    const scored = candidates.map((r) => ({
      id: r.id,
      score: cosineSimilarity(vector, r.values),
      metadata: r.metadata,
    }))

    scored.sort((a, b) => b.score - a.score)
    return scored.slice(0, topK)
  }

  async deleteByIds(ids: string[]): Promise<void> {
    const idSet = new Set(ids)
    this.records = this.records.filter((r) => !idSet.has(r.id))
  }

  getRecordCount(): number {
    return this.records.length
  }
}

// ─── Factory ──────────────────────────────────────────────────────────

export function createVectorStore(vectorizeBinding?: any): VectorStore {
  if (vectorizeBinding) {
    return new CloudflareVectorStore(vectorizeBinding)
  }
  return new InMemoryVectorStore()
}
