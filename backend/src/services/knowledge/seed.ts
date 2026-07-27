/**
 * Seed the knowledge base with initial policy documents.
 * Reads markdown files from the knowledge-base directory and ingests them.
 */

import { readFileSync, readdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import type { KnowledgeCategory, Platform } from '../../types/index.js'
import { getKnowledgeService } from './knowledgeService.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/** Root-relative path to knowledge base markdown directory. */
const KB_DIR = join(__dirname, '..', '..', '..', '..', 'knowledge-base', 'platform-rules')

interface SeedDoc {
  title: string
  content: string
  category: KnowledgeCategory
  platform?: Platform
  tags: string[]
}

const SEED_METADATA: Record<string, Omit<SeedDoc, 'content'>> = {
  '01-selling-policies-code-of-conduct': {
    title: '亚马逊销售政策与卖家行为准则',
    category: 'platform_rules',
    platform: 'amazon',
    tags: ['亚马逊', '行为准则', '合规'],
  },
  '02-prohibited-restricted-products': {
    title: '亚马逊禁售与受限商品政策',
    category: 'platform_rules',
    platform: 'amazon',
    tags: ['亚马逊', '受限', '合规'],
  },
  '03-product-detail-page-rules': {
    title: '亚马逊商品详情页规则',
    category: 'platform_rules',
    platform: 'amazon',
    tags: ['亚马逊', '上架', '详情页'],
  },
  '04-product-safety-compliance': {
    title: '产品安全与合规认证',
    category: 'platform_rules',
    platform: 'amazon',
    tags: ['合规', '安全', '认证'],
  },
  '05-category-listing-restrictions': {
    title: '品类准入与分类审核',
    category: 'platform_rules',
    platform: 'amazon',
    tags: ['品类', '受限', '批准'],
  },
}

/**
 * Read and ingest all seed documents from the knowledge-base directory.
 * Returns the number of documents successfully ingested.
 */
export async function seedKnowledgeBase(): Promise<number> {
  const ks = getKnowledgeService()

  // Check if already seeded
  const existingDocs = await ks.listDocuments('platform_rules')
  if (existingDocs.length > 0) {
    console.log(`[Seed] Knowledge base already has ${existingDocs.length} documents. Skipping.`)
    return existingDocs.length
  }

  if (!existsSync(KB_DIR)) {
    console.warn(`[Seed] Knowledge base directory not found: ${KB_DIR}`)
    return 0
  }

  const files = readdirSync(KB_DIR).filter((f) => f.endsWith('.md'))
  if (files.length === 0) {
    console.warn('[Seed] No markdown files found in knowledge base directory.')
    return 0
  }

  const docs: SeedDoc[] = []
  for (const file of files) {
    const baseName = file.replace('.md', '')
    const meta = SEED_METADATA[baseName]
    if (!meta) {
      console.warn(`[Seed] No metadata for file: ${file}, skipping.`)
      continue
    }

    try {
      const content = readFileSync(join(KB_DIR, file), 'utf-8')
      docs.push({ ...meta, content })
    } catch (err) {
      console.error(`[Seed] Failed to read ${file}:`, err)
    }
  }

  if (docs.length === 0) {
    console.warn('[Seed] No valid seed documents found.')
    return 0
  }

  const count = await ks.seedDocuments(docs)
  console.log(`[Seed] Successfully ingested ${count} documents into knowledge base.`)
  return count
}
