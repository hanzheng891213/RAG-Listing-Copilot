import client from './client'

/**
 * Server-computed finance summary.
 *
 * The server scans the listing table once and returns aggregates plus the worst
 * and best margins, so the dashboard stays a single request even when the table
 * has thousands of rows.
 */

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
  worst: FinanceProduct[]
  best: FinanceProduct[]
  incomplete: IncompleteProduct[]
}

function num(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function toProduct(raw: unknown): FinanceProduct {
  const item = (raw ?? {}) as Record<string, unknown>
  return {
    id: text(item.id),
    name: text(item.name),
    sku: text(item.sku),
    ownerName: text(item.ownerName),
    currency: text(item.currency) || '—',
    price: num(item.price),
    totalCost: num(item.totalCost),
    profit: num(item.profit),
    margin: num(item.margin),
    roi: num(item.roi),
    updatedAt: text(item.updatedAt),
  }
}

function toIncomplete(raw: unknown): IncompleteProduct {
  const item = (raw ?? {}) as Record<string, unknown>
  return {
    id: text(item.id),
    name: text(item.name),
    sku: text(item.sku),
    price: num(item.price),
    currency: text(item.currency) || '—',
    reason: item.reason === 'missing_price' ? 'missing_price' : 'missing_cost',
  }
}

/** Normalised so a malformed payload can never crash the render. */
export async function getFinanceSummary(): Promise<FinanceSummary> {
  const body = (await client.get('/finance/summary')) as any
  const currencies = Array.isArray(body?.currencies) ? body.currencies : []
  return {
    generatedAt: text(body?.generatedAt),
    totalProducts: num(body?.totalProducts),
    pricedCount: num(body?.pricedCount),
    completeCount: num(body?.completeCount),
    missingCostCount: num(body?.missingCostCount),
    currencies: currencies.map((entry: any) => ({
      currency: text(entry?.currency) || '—',
      count: num(entry?.count),
      revenue: num(entry?.revenue),
      cost: num(entry?.cost),
      profit: num(entry?.profit),
      margin: num(entry?.margin),
    })),
    worst: (Array.isArray(body?.worst) ? body.worst : []).map(toProduct),
    best: (Array.isArray(body?.best) ? body.best : []).map(toProduct),
    incomplete: (Array.isArray(body?.incomplete) ? body.incomplete : []).map(toIncomplete),
  }
}
