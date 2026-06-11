import { ref } from 'vue'
import type { SupplierProduct, ParseResult, ParseError } from '@/types/supplier'
import { generateId } from '@/utils/formatters'
import * as XLSX from 'xlsx'

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
    const sheetName = workbook.SheetNames[0]
    const sheet = workbook.Sheets[sheetName]
    const data = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 })

    if (data.length < 2) {
      errors.push({ row: 0, field: 'file', message: 'Excel file has no data rows' })
      return []
    }

    const headers = (data[0] as string[]).map((h) => String(h ?? '').trim())
    const rows = data.slice(1).map((row) => (row as string[]).map((v) => String(v ?? '').trim()))
    return linesToProducts(headers, rows, errors)
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
