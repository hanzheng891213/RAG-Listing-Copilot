/**
 * Throwaway verification for the import header mapping (run with tsx).
 * Not part of the build: it only asserts the canonical mapping behaviour.
 */
import assert from 'node:assert/strict'
import {
  buildFields,
  cellToBulletPoints,
  normaliseImportRecord,
  sourceFields,
  bulletPointsToCell,
} from '../../frontend/src/utils/gridFields.ts'

// Chinese supplier headers map onto the canonical columns.
const mapped = normaliseImportRecord({
  商品名称: ' 不锈钢保温杯 ',
  SKU: 'SKU-001',
  描述: '详情文本',
  五点描述: '五点一\n五点二',
  供应商: '义乌某厂',
  材质: '304 不锈钢',
})
assert.equal(mapped.productName, '不锈钢保温杯')
assert.equal(mapped.sku, 'SKU-001')
assert.equal(mapped.description, '详情文本')
assert.equal(mapped.bulletPoints, '五点一\n五点二')
assert.equal(mapped.supplier, '义乌某厂')
assert.equal(mapped['材质'], '304 不锈钢', 'unknown headers survive as extra columns')

// English aliases, including "description" → 详情描述 column.
const english = normaliseImportRecord({ ProductName: 'Mug', sku: 'A1', description: 'desc' })
assert.equal(english.productName, 'Mug')
assert.equal(english.sku, 'A1')
assert.equal(english.description, 'desc')

// A duplicate aliased header must not blank the filled one.
const duplicate = normaliseImportRecord({ 商品名称: 'Name A', product_name: 'Name B' })
assert.equal(duplicate.productName, 'Name A')

// Generation input excludes fields the generator itself produces.
const source = sourceFields({
  productName: 'Mug',
  sku: 'A1',
  title: 'Generated title',
  description: 'Generated description',
  bulletPoints: 'x',
  keywords: 'k',
})
assert.deepEqual(source, { productName: 'Mug', sku: 'A1' })

assert.equal(bulletPointsToCell([' a ', 'b', '']), 'a\nb')
assert.deepEqual(cellToBulletPoints('a\nb | c'), ['a', 'b', 'c'])

const fields = buildFields([
  { id: 'r1', ownerId: '', ownerName: '', fields: { productName: 'x', sku: 'y' }, createdAt: '', updatedAt: '' },
])
assert.equal(fields[0].key, 'productName')
assert.equal(fields[1].key, 'sku')

console.log('gridFields import mapping: ok')
