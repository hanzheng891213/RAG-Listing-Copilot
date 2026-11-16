#!/usr/bin/env node
/**
 * Exports the listing table to a CSV that can be adapted to a marketplace bulk
 * template (Amazon flat file, Shopify product CSV, eBay File Exchange, …).
 *
 *   API_BASE="https://your-domain.example" API_TOKEN="<JWT>" \
 *     node scripts/export-products-csv.mjs > products.csv
 *
 * Read-only and deliberately outside the Worker: pulling the whole table from a
 * scheduled Worker would spend the free plan's request and D1 read budget. This
 * script uses the same authenticated API a browser uses.
 */

const API_BASE = (process.env.API_BASE || 'http://localhost:3001').replace(/\/+$/, '')
const API_TOKEN = process.env.API_TOKEN || ''
const PAGE_SIZE = 500
const MAX_PAGES = 20

const COLUMNS = [
  'sku',
  'productName',
  'title',
  'category',
  'price',
  'currency',
  'costPrice',
  'shippingCost',
  'commissionRate',
  'adCost',
  'otherCost',
  'description',
  'bulletPoints',
  'keywords',
  'ownerName',
  'updatedAt',
]

function escapeCell(value) {
  const text = value === null || value === undefined ? '' : String(value)
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

async function fetchPage(page) {
  const url = new URL(`${API_BASE}/api/products`)
  url.searchParams.set('page', String(page))
  url.searchParams.set('pageSize', String(PAGE_SIZE))

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${API_TOKEN}`,
      Accept: 'application/json',
    },
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`HTTP ${response.status} ${response.statusText}: ${body.slice(0, 300)}`)
  }
  return response.json()
}

async function main() {
  if (!API_TOKEN) {
    console.error('API_TOKEN is required (sign in, then copy the rag-copilot-token from devtools).')
    process.exit(1)
  }

  const rows = []
  for (let page = 1; page <= MAX_PAGES; page++) {
    const result = await fetchPage(page)
    const items = Array.isArray(result?.items) ? result.items : []
    rows.push(...items)
    const totalPages = Math.max(1, Number(result?.totalPages) || 1)
    if (page >= totalPages) break
  }

  const lines = [COLUMNS.join(',')]
  for (const row of rows) {
    const fields = row.fields || {}
    const record = {
      ...fields,
      ownerName: row.ownerName,
      updatedAt: row.updatedAt,
    }
    lines.push(COLUMNS.map((column) => escapeCell(record[column])).join(','))
  }

  // UTF-8 BOM keeps Excel/WPS from guessing a legacy code page.
  process.stdout.write('\uFEFF' + lines.join('\r\n') + '\r\n')
  console.error(`Exported ${rows.length} rows from ${API_BASE}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
