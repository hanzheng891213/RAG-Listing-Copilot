import test from 'node:test'
import assert from 'node:assert/strict'
import { computeFinanceSummary, type FinanceSourceRow } from '../src/services/products/finance.ts'

function row(id: string, fields: Record<string, string>, updatedAt = '2026-01-01T00:00:00.000Z'): FinanceSourceRow {
  return { id, ownerId: 'u1', ownerName: 'owner', fields, updatedAt }
}

test('computes commission, total cost, profit and margin', () => {
  const summary = computeFinanceSummary([
    row('p1', {
      productName: 'Widget',
      sku: 'SKU-1',
      currency: 'USD',
      price: '100',
      costPrice: '40',
      shippingCost: '10',
      commissionRate: '10',
      adCost: '5',
      otherCost: '5',
    }),
  ])

  assert.equal(summary.completeCount, 1)
  assert.equal(summary.currencies.length, 1)
  const bucket = summary.currencies[0]
  assert.equal(bucket.currency, 'USD')
  assert.equal(bucket.revenue, 100)
  assert.equal(bucket.cost, 70)
  assert.equal(bucket.profit, 30)
  assert.equal(bucket.margin, 30)

  const product = summary.worst[0]
  assert.equal(product.totalCost, 70)
  assert.equal(product.profit, 30)
  assert.equal(product.margin, 30)
  assert.equal(product.roi, 42.9)
})

test('parses currency symbols, thousands separators and percent signs', () => {
  const summary = computeFinanceSummary([
    row('p1', {
      price: 'US$1,299.00',
      costPrice: '￥600',
      shippingCost: '50',
      commissionRate: '15%',
    }),
  ])
  assert.equal(summary.completeCount, 1)
  assert.equal(summary.currencies[0].revenue, 1299)
  // 600 + 50 + 1299*0.15 = 844.85
  assert.equal(summary.currencies[0].cost, 844.85)
})

test('rows without price or purchase cost are flagged, not counted as 100% margin', () => {
  const summary = computeFinanceSummary([
    row('a', { price: '', costPrice: '10', currency: 'CNY' }),
    row('b', { price: '100', costPrice: '', currency: 'CNY' }),
    row('c', { price: '100', costPrice: '50', currency: 'CNY' }),
  ])

  assert.equal(summary.totalProducts, 3)
  assert.equal(summary.pricedCount, 2)
  assert.equal(summary.completeCount, 1)
  assert.equal(summary.missingCostCount, 2)
  assert.equal(summary.currencies.length, 1)
  assert.equal(summary.currencies[0].count, 1)
  assert.deepEqual(
    summary.incomplete.map((entry) => entry.reason).sort(),
    ['missing_cost', 'missing_price'],
  )
})

test('keeps currencies separate and sorts worst margins first', () => {
  const summary = computeFinanceSummary([
    row('usd', { price: '100', costPrice: '40', currency: 'USD' }),
    row('cny', { price: '100', costPrice: '80', currency: 'CNY' }),
  ])

  assert.equal(summary.currencies.length, 2)
  assert.deepEqual(summary.worst.map((entry) => entry.id), ['cny', 'usd'])
  assert.equal(summary.worst[0].margin, 20)
  assert.equal(summary.worst[1].margin, 60)
})

test('clamps commission rate to 0-100 and missing currency gets a label', () => {
  const summary = computeFinanceSummary([
    row('p1', { price: '100', costPrice: '10', commissionRate: '150' }),
  ])
  const product = summary.worst[0]
  assert.equal(product.totalCost, 110)
  assert.equal(product.profit, -10)
  assert.equal(product.currency, '未填写')
})
