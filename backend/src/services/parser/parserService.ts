import * as XLSX from 'xlsx'
import type { SupplierProduct, ParseError } from '../types/index.js'
import { v4 as uuid } from 'uuid'

function isFieldName(value: string): boolean {
  return !/^\d+(\.\d+)?$/.test(value) && value.length <= 30
}

export class ParserService {
  parseCSV(text: string): { products: SupplierProduct[]; errors: ParseError[] } {
    const lines = text.split('\n').filter((line) => line.trim())
    const errors: ParseError[] = []

    if (lines.length < 2) {
      errors.push({ row: 0, field: 'file', message: 'CSV file has no data rows' })
      return { products: [], errors }
    }

    const headers = lines[0].split(',').map((h) => h.trim())
    const rows = lines.slice(1).map((line) => line.split(',').map((v) => v.trim()))
    return { products: this.linesToProducts(headers, rows), errors }
  }

  parseExcel(buffer: Buffer): { products: SupplierProduct[]; errors: ParseError[] } {
    const workbook = XLSX.read(buffer, { type: 'buffer' })
    const allProducts: SupplierProduct[] = []
    const allErrors: ParseError[] = []

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName]
      let data = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 })

      if (data.length < 2) continue

      if (this.isColumnOriented(data)) {
        data = this.transpose(data)
      }

      const headers = (data[0] as string[]).map((h) => String(h ?? '').trim())
      const rows = data.slice(1).map((row) => (row as string[]).map((v) => String(v ?? '').trim()))
      const products = this.linesToProducts(headers, rows)
      allProducts.push(...products)
    }

    if (allProducts.length === 0 && allErrors.length === 0) {
      allErrors.push({ row: 0, field: 'file', message: 'Excel file has no data rows' })
    }

    return { products: allProducts, errors: allErrors }
  }

  private isColumnOriented(data: string[][]): boolean {
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

  private transpose(data: string[][]): string[][] {
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

  private linesToProducts(headers: string[], rows: string[][]): SupplierProduct[] {
    const products: SupplierProduct[] = []

    for (const values of rows) {
      if (values.every((v) => !v)) continue

      const rawData: Record<string, string> = {}
      headers.forEach((h, j) => {
        rawData[h] = values[j] ?? ''
      })

      products.push({ id: uuid(), rawData })
    }

    return products
  }
}

export const parserService = new ParserService()
