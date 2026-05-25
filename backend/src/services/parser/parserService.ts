import * as XLSX from 'xlsx'
import type { SupplierProduct, ParseError } from '../types/index.js'
import { v4 as uuid } from 'uuid'

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
    const sheetName = workbook.SheetNames[0]
    const sheet = workbook.Sheets[sheetName]
    const data = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 })
    const errors: ParseError[] = []

    if (data.length < 2) {
      errors.push({ row: 0, field: 'file', message: 'Excel file has no data rows' })
      return { products: [], errors }
    }

    const headers = (data[0] as string[]).map((h) => String(h ?? '').trim())
    const rows = data.slice(1).map((row) => (row as string[]).map((v) => String(v ?? '').trim()))
    return { products: this.linesToProducts(headers, rows), errors }
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
