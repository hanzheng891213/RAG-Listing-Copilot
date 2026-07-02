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
    title: 'Amazon Selling Policies & Seller Code of Conduct',
    category: 'platform_rules',
    platform: 'amazon',
    tags: ['amazon', 'code-of-conduct', 'selling-policies', 'business-solutions-agreement'],
  },
  '02-prohibited-restricted-products': {
    title: 'Amazon Prohibited & Restricted Products Policy',
    category: 'platform_rules',
    platform: 'amazon',
    tags: ['amazon', 'prohibited', 'restricted', 'gated-categories', 'ungating'],
  },
  '03-product-detail-page-rules': {
    title: 'Amazon Product Detail Page Rules',
    category: 'platform_rules',
    platform: 'amazon',
    tags: ['amazon', 'detail-page', 'title', 'image', 'bullet-points', 'variation'],
  },
  '04-product-safety-compliance': {
    title: 'Amazon Product Safety & Compliance Certifications',
    category: 'platform_rules',
    platform: 'amazon',
    tags: ['amazon', 'safety', 'compliance', 'FDA', 'CPC', 'CE', 'FCC', 'certification'],
  },
  '05-category-listing-restrictions': {
    title: 'Amazon Category Listing Restrictions & Approval',
    category: 'platform_rules',
    platform: 'amazon',
    tags: ['amazon', 'categories', 'gated', 'jewelry', 'beauty', 'baby', 'automotive', 'approval'],
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
