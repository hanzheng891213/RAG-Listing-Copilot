/**
 * Estimated product profitability.
 *
 * Costs live in the same dynamic `fields` JSON as the rest of the grid, so this
 * module is the only place that knows the key names and the formula. Keeping it
 * pure means the Worker, Express and the unit tests all compute the same number.
 *
 *   commission = price * commissionRate%
 *   totalCost  = purchase + shipping + ad + other + commission
 *   profit     = price - totalCost
 *   margin     = profit / price * 100
 *   roi        = profit / (purchase + shipping + ad + other + commission) * 100
 *
 * A row is only counted when it has a positive price AND a positive purchase
 * cost; otherwise "100% margin" rows would flatter the dashboard. Such rows are
 * returned separately as `incomplete` so the user can fill the missing cells.
 */

export const FINANCE_FIELDS = [
  'price',
  'currency',
  'costPrice',
  'shippingCost',
  'commissionRate',
  'adCost',
  'otherCost',
] as const

export interface FinanceSourceRow {
  id: string
  ownerId: string
  ownerName: string
  fields: Record<string, string>
  updatedAt: string
}

export interface FinanceProduct {
  id: string
  name: string
  sku: string
  ownerName: string
  currency: string
  price: number
  totalCost: number
  profit: number
  margin: number
  roi: number
  updatedAt: string
}

export interface IncompleteProduct {
  id: string
  name: string
  sku: string
  price: number
  currency: string
  reason: 'missing_price' | 'missing_cost'
}

export interface CurrencySummary {
  currency: string
  count: number
  revenue: number
  cost: number
  profit: number
  margin: number
}

export interface FinanceSummary {
  generatedAt: string
  totalProducts: number
  pricedCount: number
  completeCount: number
  missingCostCount: number
  currencies: CurrencySummary[]
  /** Worst margins first; capped so the payload stays small. */
  worst: FinanceProduct[]
  best: FinanceProduct[]
  incomplete: IncompleteProduct[]
}

function num(value: string | undefined): number {
  if (!value) return 0
  // Supplier sheets commonly carry "US$12.99", "1,299" or "15%".
  const cleaned = value.replace(/[^0-9.\-]/g, '')
  const n = Number.parseFloat(cleaned)
  return Number.isFinite(n) ? n : 0
}

function text(fields: Record<string, string>, key: string): string {
  return (fields?.[key] ?? '').trim()
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

interface Computed {
  product: FinanceProduct | null
  incomplete: IncompleteProduct | null
}

function computeOne(row: FinanceSourceRow): Computed {
  const fields = row.fields ?? {}
  const price = num(fields.price)
  const purchase = num(fields.costPrice)
  const shipping = num(fields.shippingCost)
  const ad = num(fields.adCost)
  const other = num(fields.otherCost)
  const commissionRate = Math.min(Math.max(num(fields.commissionRate), 0), 100)

  const identity = {
    id: row.id,
    name: text(fields, 'productName') || text(fields, 'title') || text(fields, 'sku') || row.id,
    sku: text(fields, 'sku'),
    ownerName: row.ownerName,
  }
  const currency = text(fields, 'currency') || '未填写'

  if (!(price > 0)) {
    return {
      product: null,
      incomplete: { ...identity, price, currency, reason: 'missing_price' },
    }
  }

  const commission = price * (commissionRate / 100)
  const totalCost = purchase + shipping + ad + other + commission
  const profit = price - totalCost
  const margin = (profit / price) * 100
  const roi = totalCost > 0 ? (profit / totalCost) * 100 : 0

  const product: FinanceProduct = {
    ...identity,
    currency,
    price: round(price),
    totalCost: round(totalCost),
    profit: round(profit),
    margin: round(margin, 1),
    roi: round(roi, 1),
    updatedAt: row.updatedAt,
  }

  if (!(purchase > 0)) {
    return {
      product,
      incomplete: { ...identity, price, currency, reason: 'missing_cost' },
    }
  }

  return { product, incomplete: null }
}

const MAX_ROWS_PER_LIST = 200
const MAX_INCOMPLETE = 100

export function computeFinanceSummary(rows: FinanceSourceRow[]): FinanceSummary {
  const complete: FinanceProduct[] = []
  const incomplete: IncompleteProduct[] = []
  const byCurrency = new Map<string, CurrencySummary>()
  let pricedCount = 0

  for (const row of rows ?? []) {
    const { product, incomplete: gap } = computeOne(row)

    if (gap) incomplete.push(gap)
    if (!product) continue

    pricedCount += 1
    if (!gap) {
      complete.push(product)
      const bucket = byCurrency.get(product.currency) ?? {
        currency: product.currency,
        count: 0,
        revenue: 0,
        cost: 0,
        profit: 0,
        margin: 0,
      }
      bucket.count += 1
      bucket.revenue += product.price
      bucket.cost += product.totalCost
      bucket.profit += product.profit
      byCurrency.set(product.currency, bucket)
    }
  }

  const currencies = [...byCurrency.values()]
    .map((bucket) => ({
      ...bucket,
      revenue: round(bucket.revenue),
      cost: round(bucket.cost),
      profit: round(bucket.profit),
      margin: bucket.revenue > 0 ? round((bucket.profit / bucket.revenue) * 100, 1) : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue)

  const worst = [...complete].sort((a, b) => a.margin - b.margin).slice(0, MAX_ROWS_PER_LIST)
  const best = [...complete].sort((a, b) => b.margin - a.margin).slice(0, MAX_ROWS_PER_LIST)

  return {
    generatedAt: new Date().toISOString(),
    totalProducts: rows.length,
    pricedCount,
    completeCount: complete.length,
    missingCostCount: incomplete.length,
    currencies,
    worst,
    best,
    incomplete: incomplete.slice(0, MAX_INCOMPLETE),
  }
}
