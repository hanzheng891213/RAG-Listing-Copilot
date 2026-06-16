import { ref } from 'vue'
import type { SupplierProduct, ParseResult, ParseError } from '@/types/supplier'
import { generateId } from '@/utils/formatters'
import * as XLSX from 'xlsx'

function isFieldName(value: string): boolean {
  return !/^\d+(\.\d+)?$/.test(value) && value.length <= 30
}

function isColumnOriented(data: string[][]): boolean {
  const col0 = data.slice(1).map((row) => String(row[0] ?? '').trim()).filter((v) => v)
  const row0 = data[0].slice(1).map((v) => String(v ?? '').trim()).filter((v) => v)

  if (col0.length === 0 || row0.length === 0) return false

  // Tier 1: shape — many more columns than rows strongly suggests column-oriented
  const numDataRows = data.length - 1
  const numDataCols = Math.max(...data.map((r) => r.length)) - 1
  if (numDataCols > numDataRows * 2) return true
  if (numDataRows > numDataCols * 2) return false

  // Tier 2: uniqueness — headers repeat, data values don't
  const col0UniqueRatio = new Set(col0).size / col0.length
  const row0UniqueRatio = new Set(row0).size / row0.length
  if (col0UniqueRatio !== row0UniqueRatio) {
    return col0UniqueRatio < row0UniqueRatio
  }

  // Tier 3: field-name-likeness (tiebreaker)
  const col0Score = col0.filter((v) => isFieldName(v)).length / col0.length
  const row0Score = row0.filter((v) => isFieldName(v)).length / row0.length

  return col0Score > row0Score
}

function transpose(data: string[][]): string[][] {
  const maxCols = Math.max(...data.map((row) => row.length))
  const result: string[][] = []
  for (let col = 0; col < maxCols; col++) {
    const newRow: string[] = []
    for (let row = 0; row < data.length; row++) {
      newRow.push(String(data[row][col] ?? '').trim())
    }
    result.push(newRow)
  }
  if (result.length > 0 && result[0].length > 0 && !result[0][0]) {
    result[0][0] = 'name'
  }
  return result
}

export function useSupplierParser() {
  const isParsing = ref(false)
  const result = ref<ParseResult | null>(null)

  async function parseFile(file: File): Promise<ParseResult> {
    isParsing.value = true
    const errors: ParseError[] = []

    try {
      const extension = file.name.split('.').pop()?.toLowerCase()
      let products: SupplierProduct[] = []

      if (extension === 'csv') {
        const text = await file.text()
        products = parseCSV(text, errors)
      } else if (extension === 'xlsx' || extension === 'xls') {
        products = await parseExcel(file, errors)
      } else if (extension === 'txt') {
        const text = await file.text()
        products = parseTXT(text, errors)
      } else {
        errors.push({ row: 0, field: 'file', message: `Unsupported format: .${extension}` })
      }

      const parseResult: ParseResult = { products, errors, fileName: file.name }
      result.value = parseResult
      return parseResult
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e)
      errors.push({ row: 0, field: 'file', message: `File parsing failed: ${message}` })
      const parseResult: ParseResult = { products: [], errors, fileName: file.name }
      result.value = parseResult
      return parseResult
    } finally {
      isParsing.value = false
    }
  }

  function parseCSV(text: string, errors: ParseError[]): SupplierProduct[] {
    const lines = text.split('\n').filter((line) => line.trim())
    if (lines.length < 2) {
      errors.push({ row: 0, field: 'file', message: 'CSV file has no data rows' })
      return []
    }

    const headers = lines[0].split(',').map((h) => h.trim())
    const rows = lines.slice(1).map((line) => line.split(',').map((v) => v.trim()))
    return linesToProducts(headers, rows, errors)
  }

  async function parseExcel(file: File, errors: ParseError[]): Promise<SupplierProduct[]> {
    const buffer = await file.arrayBuffer()
    const workbook = XLSX.read(buffer, { type: 'array' })
    const allProducts: SupplierProduct[] = []

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName]
      let data = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 })

      if (data.length < 2) continue

      if (isColumnOriented(data)) {
        data = transpose(data)
      }

      const headers = (data[0] as string[]).map((h) => String(h ?? '').trim())
      const rows = data.slice(1).map((row) => (row as string[]).map((v) => String(v ?? '').trim()))
      allProducts.push(...linesToProducts(headers, rows, errors))
    }

    if (allProducts.length === 0) {
      errors.push({ row: 0, field: 'file', message: 'Excel file has no data rows' })
      return []
    }

    return allProducts
  }

  function linesToProducts(headers: string[], rows: string[][], _errors: ParseError[]): SupplierProduct[] {
    const products: SupplierProduct[] = []

    for (let i = 0; i < rows.length; i++) {
      const values = rows[i]
      if (values.every((v) => !v)) continue

      const rawData: Record<string, string> = {}
      headers.forEach((h, j) => {
        rawData[h] = values[j] ?? ''
      })

      products.push({ id: generateId(), rawData })
    }

    return products
  }

  function parseTXT(text: string, errors: ParseError[]): SupplierProduct[] {
    const sections = text.split(/\n{2,}/).filter((s) => s.trim())
    const products: SupplierProduct[] = []

    for (const section of sections) {
      const lines = section.split('\n').map((l) => l.trim()).filter(Boolean)
      const rawData: Record<string, string> = {}
      let firstValue = ''

      for (const line of lines) {
        const colonIndex = line.indexOf(':')
        if (colonIndex > 0) {
          const key = line.slice(0, colonIndex).trim()
          const value = line.slice(colonIndex + 1).trim()
          rawData[key] = value
        } else {
          rawData[`field_${Object.keys(rawData).length}`] = line
        }
        if (!firstValue) firstValue = line.slice(colonIndex > 0 ? colonIndex + 1 : 0).trim()
      }

      if (Object.keys(rawData).length > 0) {
        products.push({ id: generateId(), rawData })
      }
    }

    return products
  }

  function getProductLabel(product: SupplierProduct): string {
    const values = Object.values(product.rawData).filter((v) => v)
    return values[0] || `Product ${product.id.slice(0, 6)}`
  }

  return {
    isParsing,
    result,
    parseFile,
    getProductLabel,
  }
}
