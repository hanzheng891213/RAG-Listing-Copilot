export interface SupplierProduct {
  id: string
  rawData: Record<string, string>
}

export interface ParseResult {
  products: SupplierProduct[]
  errors: ParseError[]
  fileName: string
}

export interface ParseError {
  row: number
  field: string
  message: string
}
