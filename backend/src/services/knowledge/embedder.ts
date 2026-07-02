/**
 * Embedding generation for RAG knowledge base.
 *
 * Supports two backends:
 * - Cloudflare Workers AI (@cf/baai/bge-small-en-v1.5, 384-dim)
 * - Local in-memory fallback (TF-IDF-like keyword vector, for dev without API)
 */

export interface Embedder {
  embed(texts: string[]): Promise<number[][]>
  readonly dimension: number
}

// ─── Cloudflare Workers AI Embedder ──────────────────────────────────

export class CloudflareEmbedder implements Embedder {
  readonly dimension = 384
  private aiBinding: any

  constructor(aiBinding: any) {
    this.aiBinding = aiBinding
  }

  async embed(texts: string[]): Promise<number[][]> {
    const results: number[][] = []
    // Workers AI supports batch, but process one at a time for reliability
    for (const text of texts) {
      const response = await this.aiBinding.run('@cf/baai/bge-small-en-v1.5', { text })
      results.push(response.data[0])
    }
    return results
  }
}

// ─── Local Embedder (keyword-based, no external API needed) ──────────

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'can', 'shall', 'to', 'of', 'in', 'for',
  'on', 'with', 'at', 'by', 'from', 'and', 'or', 'not', 'but', 'if',
  'about', 'as', 'into', 'through', 'during', 'before', 'after',
  'above', 'below', 'between', 'out', 'off', 'over', 'under', 'again',
  'further', 'then', 'once', 'here', 'there', 'when', 'where', 'why',
  'how', 'all', 'both', 'each', 'few', 'more', 'most', 'other', 'some',
  'such', 'no', 'nor', 'only', 'own', 'same', 'so', 'than', 'too',
  'very', 'just', 'also', 'now', 'up', 'down',
  '的', '是', '在', '和', '了', '有', '不', '人', '这', '中', '大',
  '为', '上', '个', '国', '我', '以', '要', '他', '时', '来', '用',
  '们', '生', '到', '作', '地', '于', '出', '会', '可', '也', '你',
  '对', '现', '能', '而', '子', '说', '产', '种', '过', '后', '自',
])

function tokenize(text: string): Map<string, number> {
  const tokens = new Map<string, number>()
  const words = text.toLowerCase().split(/[\s,.;:!?()\[\]{}"']+/).filter(Boolean)
  for (const w of words) {
    if (STOP_WORDS.has(w) || w.length < 2) continue
    tokens.set(w, (tokens.get(w) || 0) + 1)
  }
  return tokens
}

/**
 * Generate a sparse TF-IDF-like vector.
 * We hash each token into 384 dimensions to match bge-small output size,
 * so the same vector store can be used for both backends.
 */
export class LocalEmbedder implements Embedder {
  readonly dimension = 384

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((text) => {
      const tokens = tokenize(text)
      const vec = new Array(this.dimension).fill(0)

      if (tokens.size === 0) return vec

      // Hash tokens into fixed dimensions
      for (const [token, count] of tokens) {
        const hash = simpleHash(token)
        for (let i = 0; i < 4; i++) {
          const idx = (hash + i * 97) % this.dimension
          vec[idx] += count / Math.sqrt(tokens.size)
        }
      }

      // L2 normalize
      const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0))
      if (norm > 0) {
        for (let i = 0; i < vec.length; i++) vec[i] /= norm
      }

      return vec
    })
  }
}

function simpleHash(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32bit integer
  }
  return Math.abs(hash)
}

// ─── Factory ──────────────────────────────────────────────────────────

/**
 * Create an embedder based on the environment.
 * - If Workers AI binding is available → CloudflareEmbedder
 * - Otherwise → LocalEmbedder (keyword hashing)
 */
export function createEmbedder(aiBinding?: any): Embedder {
  if (aiBinding) {
    return new CloudflareEmbedder(aiBinding)
  }
  return new LocalEmbedder()
}

// ─── Cosine Similarity ────────────────────────────────────────────────

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  return denom === 0 ? 0 : dot / denom
}
