import * as XLSX from 'xlsx'
import type { SupplierProduct, ParseError } from '../../types/index.ts'
import { v4 as uuid } from 'uuid'
import {
  chooseOrientation,
  dropEmptyColumns,
  dropTitleRows,
  normalizeHeaders,
  stripEmptyEdges,
  toGrid,
} from './sheetReader.ts'

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

  parseExcel(data: ArrayBuffer | Buffer): { products: SupplierProduct[]; errors: ParseError[] } {
    const workbook = XLSX.read(data, { type: 'array' })
    const allProducts: SupplierProduct[] = []
    const allErrors: ParseError[] = []

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName]
      const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
        header: 1,
        blankrows: true,
        defval: '',
      })
      allProducts.push(...this.readSheet(raw, sheetName))
    }

    if (allProducts.length === 0) {
      allErrors.push({ row: 0, field: 'file', message: 'Excel file has no data rows' })
    }

    return { products: allProducts, errors: allErrors }
  }

  /**
   * Turns one sheet's raw grid into products. Format quirks — title banners,
   * leading blank rows, trailing empty columns, a transposed (attributes-down)
   * layout, blank or repeated headers — are normalised away here so the rows
   * that reach the model carry clean, unique keys.
   */
  private readSheet(raw: unknown[][], sheetName: string): SupplierProduct[] {
    const cleaned = dropEmptyColumns(dropTitleRows(stripEmptyEdges(toGrid(raw))))
    if (cleaned.length < 2) return []

    const { grid: oriented, transposed } = chooseOrientation(cleaned)
    if (transposed) {
      console.warn(`[parser] sheet "${sheetName}" read as a transposed table`)
    }

    const grid = dropEmptyColumns(stripEmptyEdges(oriented))
    if (grid.length < 2) return []

    const headers = normalizeHeaders(grid[0])
    return this.linesToProducts(headers, grid.slice(1), sheetName)
  }

  private linesToProducts(
    headers: string[],
    rows: string[][],
    sourceSheet?: string,
  ): SupplierProduct[] {
    const products: SupplierProduct[] = []

    for (const values of rows) {
      if (values.every((v) => !v)) continue

      const rawData: Record<string, string> = {}
      headers.forEach((h, j) => {
        rawData[h] = values[j] ?? ''
      })

      products.push({ id: uuid(), sourceSheet, rawData })
    }

    return products
  }
}

export const parserService = new ParserService()
