import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as XLSX from 'xlsx'
import { parserService } from '../src/services/parser/parserService.ts'
import { normalizeHeaders } from '../src/services/parser/sheetReader.ts'

function workbook(sheets: Record<string, unknown[][]>): ArrayBuffer {
  const wb = XLSX.utils.book_new()
  for (const [name, aoa] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), name)
  }
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
}

function parse(sheets: Record<string, unknown[][]>) {
  return parserService.parseExcel(workbook(sheets))
}

test('plain table keeps one product per row', () => {
  const { products, errors } = parse({
    Sheet1: [
      ['SKU', 'Name', 'Price'],
      ['A1', 'Apple', '1.99'],
      ['A2', 'Pear', '2.50'],
    ],
  })
  assert.equal(errors.length, 0)
  assert.equal(products.length, 2)
  assert.deepEqual(products[0].rawData, { SKU: 'A1', Name: 'Apple', Price: '1.99' })
  assert.equal(products[0].sourceSheet, 'Sheet1')
})

test('skips a title row and blank rows above the header', () => {
  const { products } = parse({
    S: [
      ['Supplier Price List 2026'],
      [],
      ['SKU', 'Name', 'Price'],
      ['A1', 'Apple', '1.99'],
    ],
  })
  assert.equal(products.length, 1)
  assert.deepEqual(products[0].rawData, { SKU: 'A1', Name: 'Apple', Price: '1.99' })
})

test('reads a transposed sheet (attributes down, products across)', () => {
  const { products } = parse({
    S: [
      ['Name', 'iPhone 15', 'Galaxy S24'],
      ['Price', '999', '899'],
      ['Color', 'Black', 'White'],
    ],
  })
  assert.equal(products.length, 2)
  assert.deepEqual(products[0].rawData, { Name: 'iPhone 15', Price: '999', Color: 'Black' })
  assert.deepEqual(products[1].rawData, { Name: 'Galaxy S24', Price: '899', Color: 'White' })
})

test('does not transpose a table whose first column repeats', () => {
  const { products } = parse({
    S: [
      ['Category', 'Name', 'Price'],
      ['Fruit', 'Apple', '1'],
      ['Fruit', 'Pear', '2'],
      ['Fruit', 'Mango', '3'],
    ],
  })
  assert.equal(products.length, 3)
  assert.deepEqual(Object.keys(products[0].rawData), ['Category', 'Name', 'Price'])
  assert.equal(products[2].rawData.Name, 'Mango')
})

test('does not transpose a wide table with few products', () => {
  const { products } = parse({
    S: [
      ['Name', 'Price', 'Color', 'Size', 'Weight'],
      ['Ford', '999', 'Black', '10', '2000'],
    ],
  })
  assert.equal(products.length, 1)
  assert.deepEqual(Object.keys(products[0].rawData), ['Name', 'Price', 'Color', 'Size', 'Weight'])
})

test('keeps tables whose headers are numbers, such as years', () => {
  const { products } = parse({
    S: [
      ['Product', '2024', '2025'],
      ['Widget', '100', '200'],
      ['Gadget', '150', '250'],
    ],
  })
  assert.equal(products.length, 2)
  // JavaScript enumerates integer-like keys first, so compare as a set.
  assert.deepEqual(Object.keys(products[0].rawData).sort(), ['2024', '2025', 'Product'])
  assert.equal(products[1].rawData['2025'], '250')
})

test('names blank headers and de-duplicates repeated ones', () => {
  const { products } = parse({
    S: [
      ['Name', '', 'Price', 'Price'],
      ['Apple', 'x', '1', '2'],
    ],
  })
  assert.deepEqual(Object.keys(products[0].rawData), ['Name', 'column_2', 'Price', 'Price_2'])
  assert.equal(products[0].rawData.column_2, 'x')
  assert.equal(products[0].rawData.Price, '1')
  assert.equal(products[0].rawData.Price_2, '2')
})

test('collapses fully empty columns between data', () => {
  const { products } = parse({
    S: [
      ['Name', null, 'Price'],
      ['Apple', null, '1'],
    ],
  })
  assert.deepEqual(Object.keys(products[0].rawData), ['Name', 'Price'])
})

test('reads every sheet and records where each product came from', () => {
  const { products } = parse({
    Phones: [
      ['Name', 'Price'],
      ['iPhone', '999'],
    ],
    Cases: [
      ['Name', 'Price'],
      ['Silicone', '19'],
      ['Leather', '39'],
    ],
  })
  assert.equal(products.length, 3)
  assert.equal(products.filter((p) => p.sourceSheet === 'Phones').length, 1)
  assert.equal(products.filter((p) => p.sourceSheet === 'Cases').length, 2)
})

test('reports an error when a workbook holds no data', () => {
  const { products, errors } = parse({ S: [['only a title']] })
  assert.equal(products.length, 0)
  assert.equal(errors.length, 1)
})

test('parseCSV still works and carries no source sheet', () => {
  const { products } = parserService.parseCSV('Name,Price\nApple,1\n')
  assert.equal(products.length, 1)
  assert.deepEqual(products[0].rawData, { Name: 'Apple', Price: '1' })
  assert.equal(products[0].sourceSheet, undefined)
})

test('normalizeHeaders fills blanks and de-duplicates', () => {
  assert.deepEqual(normalizeHeaders(['a', '', 'b', 'a', 'a']), [
    'a',
    'column_2',
    'b',
    'a_2',
    'a_3',
  ])
})
