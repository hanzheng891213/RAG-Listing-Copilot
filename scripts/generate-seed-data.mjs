/**
 * Inlines the knowledge-base markdown into a TypeScript module.
 *
 * seed.ts originally read these files with `fs`, which does not exist on the
 * Cloudflare Worker, so seeding only ever worked in local dev. Regenerating
 * this module keeps one seed implementation that runs on both runtimes.
 *
 * Each document exists twice: English under knowledge-base/<category>/ and
 * Chinese under knowledge-base/zh/<category>/. The English body is the one that
 * gets embedded (the embedding model has no Chinese support); the Chinese body
 * travels alongside for display.
 *
 * Run: npm run seed:generate
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_FILE = join(root, 'backend', 'src', 'services', 'knowledge', 'seedData.ts')

/** Each source directory maps to one knowledge category. */
const SOURCES = [
  { dir: join(root, 'knowledge-base', 'platform-rules'), category: 'platform_rules' },
  { dir: join(root, 'knowledge-base', 'templates'), category: 'templates' },
]

const SEED_METADATA = {
  '01-selling-policies-code-of-conduct': {
    title: 'Amazon Selling Policies & Code of Conduct',
    titleZh: '亚马逊销售政策与卖家行为准则',
    platform: 'amazon',
    tags: ['亚马逊', '行为准则', '合规'],
  },
  '02-prohibited-restricted-products': {
    title: 'Amazon Prohibited & Restricted Products',
    titleZh: '亚马逊禁售与受限商品政策',
    platform: 'amazon',
    tags: ['亚马逊', '受限', '合规'],
  },
  '03-product-detail-page-rules': {
    title: 'Amazon Product Detail Page Rules',
    titleZh: '亚马逊商品详情页规则',
    platform: 'amazon',
    tags: ['亚马逊', '上架', '详情页'],
  },
  '04-product-safety-compliance': {
    title: 'Product Safety & Compliance',
    titleZh: '产品安全与合规认证',
    platform: 'amazon',
    tags: ['合规', '安全', '认证'],
  },
  '05-category-listing-restrictions': {
    title: 'Category Listing Restrictions',
    titleZh: '品类准入与分类审核',
    platform: 'amazon',
    tags: ['品类', '受限', '批准'],
  },
  'shopify-01-product-listing-rules': {
    title: 'Shopify Product Listing & Detail Page Rules',
    titleZh: 'Shopify 商品上架与详情页规范',
    platform: 'shopify',
    tags: ['Shopify', '上架', '详情页'],
  },
  'shopify-02-seo-and-content': {
    title: 'Shopify SEO & Content Rules',
    titleZh: 'Shopify SEO 与内容规范',
    platform: 'shopify',
    tags: ['Shopify', 'SEO', '内容'],
  },
  'shopify-03-media-and-variants': {
    title: 'Shopify Media & Variants Rules',
    titleZh: 'Shopify 图片媒体与商品变体规范',
    platform: 'shopify',
    tags: ['Shopify', '图片', '变体'],
  },
  'shopify-04-prohibited-restricted-products': {
    title: 'Shopify Prohibited & Restricted Products',
    titleZh: 'Shopify 禁售与受限商品政策',
    platform: 'shopify',
    tags: ['Shopify', '受限', '合规'],
  },
  'ebay-01-listing-policies': {
    title: 'eBay Listing Policies and Seller Standards',
    titleZh: 'eBay 上架政策与卖家标准',
    platform: 'ebay',
    tags: ['eBay', '上架', '卖家标准'],
  },
  'ebay-02-title-and-item-specifics': {
    title: 'eBay Title, Subtitle and Item Specifics',
    titleZh: 'eBay 标题与物品属性规范',
    platform: 'ebay',
    tags: ['eBay', '标题', '物品属性'],
  },
  'ebay-03-images-and-description': {
    title: 'eBay Images and Description Rules',
    titleZh: 'eBay 图片与描述规范',
    platform: 'ebay',
    tags: ['eBay', '图片', '描述'],
  },
  'ebay-04-prohibited-restricted-products': {
    title: 'eBay Prohibited and Restricted Products',
    titleZh: 'eBay 禁售与受限商品政策',
    platform: 'ebay',
    tags: ['eBay', '受限', '合规'],
  },
  'amazon-electronics-listing-template': {
    title: 'Electronics Listing Template',
    titleZh: '电子产品上架模板',
    platform: 'amazon',
    tags: ['亚马逊', '电子产品', '模板', 'SEO'],
  },
  'amazon-home-kitchen-listing-template': {
    title: 'Home & Kitchen Listing Template',
    titleZh: '家居厨房模板',
    platform: 'amazon',
    tags: ['亚马逊', '家居', '厨房', '模板'],
  },
}

const entries = SOURCES.flatMap(({ dir, category }) => {
  if (!existsSync(dir)) {
    console.warn(`Skipping missing source directory: ${dir}`)
    return []
  }

  const zhDir = join(dirname(dir), 'zh', dir.split(/[\\/]/).pop())

  return readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((file) => {
      const baseName = file.replace(/\.md$/, '')
      const meta = SEED_METADATA[baseName]
      if (!meta) throw new Error(`No SEED_METADATA entry for ${category}/${file}`)

      const zhPath = join(zhDir, file)
      if (!existsSync(zhPath)) {
        throw new Error(`No Chinese counterpart for ${category}/${file} at ${zhPath}`)
      }

      return {
        title: meta.title,
        titleZh: meta.titleZh,
        category,
        platform: meta.platform,
        tags: meta.tags,
        content: readFileSync(join(dir, file), 'utf-8'),
        contentZh: readFileSync(zhPath, 'utf-8'),
      }
    })
})

if (entries.length === 0) throw new Error('No markdown files found in any source directory')

// Title is the seed's dedup key, so a duplicate would silently shadow a document.
const seenTitles = new Set()
for (const e of entries) {
  if (seenTitles.has(e.title)) throw new Error(`Duplicate seed title: ${e.title}`)
  seenTitles.add(e.title)
}

const body = entries
  .map(
    (e) => `  {
    title: ${JSON.stringify(e.title)},
    titleZh: ${JSON.stringify(e.titleZh)},
    category: ${JSON.stringify(e.category)},
    platform: ${JSON.stringify(e.platform)},
    tags: ${JSON.stringify(e.tags)},
    content: ${JSON.stringify(e.content)},
    contentZh: ${JSON.stringify(e.contentZh)},
  },`,
  )
  .join('\n')

const output = `// AUTO-GENERATED by scripts/generate-seed-data.mjs — do not edit by hand.
// Sources: knowledge-base/{platform-rules,templates}/*.md (English, embedded)
//          knowledge-base/zh/{platform-rules,templates}/*.md (Chinese, display)
import type { KnowledgeCategory, Platform } from '../../types/index.js'

export interface SeedDoc {
  /** Canonical English title — also the seed's dedup key. */
  title: string
  /** Chinese title, for display when the locale is Chinese. */
  titleZh: string
  /** English body. This is what gets embedded and retrieved. */
  content: string
  /** Chinese body, display only — never embedded. */
  contentZh: string
  category: KnowledgeCategory
  platform?: Platform
  tags: string[]
}

export const SEED_DOCS: SeedDoc[] = [
${body}
]
`

writeFileSync(OUT_FILE, output, 'utf-8')
console.log(`Wrote ${entries.length} documents to ${OUT_FILE}`)
