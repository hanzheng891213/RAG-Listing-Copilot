/**
 * TSV (Excel clipboard) parsing and serialisation.
 *
 * Paste must be all-or-nothing: the grid parses the whole block, normalises
 * every cell, and writes only if nothing failed. So this module is pure — no
 * grid state, no requests — and throws instead of returning partial rows.
 */

/** 1MB ceiling: pasting a full sheet from Excel is legitimate, 20MB is not. */
export const MAX_PASTE_BYTES = 1024 * 1024

export class TsvError extends Error {
  // Explicit field, not a constructor parameter property: parameter properties
  // are non-erasable syntax and the project builds with erasableSyntaxOnly.
  readonly code: 'too-large' | 'malformed'

  constructor(message: string, code: 'too-large' | 'malformed') {
    super(message)
    this.name = 'TsvError'
    this.code = code
  }
}

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length
}

/**
 * Splits clipboard text into a cell matrix.
 *
 * Handles: quoted cells with embedded tabs/newlines, doubled quotes as an
 * escaped quote, CRLF, and trailing blank lines (Excel always appends one).
 */
export function parseTsv(text: string, maxBytes: number = MAX_PASTE_BYTES): string[][] {
  if (!text) return []

  if (byteLength(text) > maxBytes) {
    throw new TsvError('Pasted content is too large to handle safely', 'too-large')
  }

  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false
  let index = 0

  while (index < text.length) {
    const char = text[index]

    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          cell += '"'
          index += 2
          continue
        }
        inQuotes = false
        index += 1
        continue
      }
      cell += char
      index += 1
      continue
    }

    if (char === '"' && cell === '') {
      inQuotes = true
      index += 1
      continue
    }

    if (char === '\t') {
      row.push(cell)
      cell = ''
      index += 1
      continue
    }

    if (char === '\r') {
      index += 1
      continue
    }

    if (char === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
      index += 1
      continue
    }

    cell += char
    index += 1
  }

  if (inQuotes) {
    throw new TsvError('Unbalanced quotes in pasted content', 'malformed')
  }

  if (cell !== '' || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }

  // Excel appends a newline, which would otherwise read as a trailing blank row.
  while (rows.length > 0 && rows[rows.length - 1].every((value) => value === '')) {
    rows.pop()
  }

  return rows.map((cells) => cells.map((value) => value.trim()))
}

/** Serialises a matrix back to TSV, quoting only when necessary. */
export function toTsv(matrix: string[][]): string {
  return matrix
    .map((row) =>
      row
        .map((cell) => {
          const value = cell ?? ''
          return /[\t\n\r"]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
        })
        .join('\t'),
    )
    .join('\n')
}

/** Normalises a pasted value for a column type. Returns null when invalid. */
export function normaliseCell(value: string, type: 'text' | 'number'): string | null {
  const trimmed = value.trim()
  if (type === 'text') return trimmed
  if (trimmed === '') return ''

  // Accept "1,234.50", "¥12.9", "12.9 USD": sellers paste straight from
  // invoices and price sheets, so currency symbols and unit suffixes are
  // stripped rather than rejected. European "1.234,50" is intentionally not
  // guessed at — ambiguous separators fail loudly instead of silently
  // becoming the wrong number.
  const compact = trimmed.replace(/[\s,]/g, '')
  const match = compact.match(/-?\d+(?:\.\d+)?/)
  if (!match) return null
  return match[0]
}
