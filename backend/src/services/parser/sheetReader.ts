/**
 * Heuristics that turn a raw `sheet_to_json(..., { header: 1 })` grid into a
 * clean header row plus data rows. Kept apart from ParserService so the
 * orientation and header rules can be reasoned about (and tested) on their own.
 */

export type Grid = string[][]

/** Only prefer the transposed layout when it scores this much better. */
const ORIENTATION_MARGIN = 0.05

const NUMERIC = /^-?[\d.,]+%?$/

function isNumeric(value: string): boolean {
  return NUMERIC.test(value)
}

function nonEmpty(row: string[]): string[] {
  return row.filter((cell) => cell !== '')
}

function isEmptyRow(row: string[]): boolean {
  return nonEmpty(row).length === 0
}

function widthOf(grid: Grid): number {
  return grid.reduce((max, row) => Math.max(max, row.length), 0)
}

/** Stringifies every cell and pads rows to a uniform width. */
export function toGrid(raw: unknown[][]): Grid {
  const width = widthOf(raw as Grid)
  return raw.map((row) => {
    const cells = row.map((cell) => String(cell ?? '').trim())
    while (cells.length < width) cells.push('')
    return cells
  })
}

/** Drops fully-empty rows from the top and bottom of the grid. */
export function stripEmptyEdges(grid: Grid): Grid {
  let start = 0
  let end = grid.length
  while (start < end && isEmptyRow(grid[start])) start++
  while (end > start && isEmptyRow(grid[end - 1])) end--
  return grid.slice(start, end)
}

/**
 * Drops leading title rows — a banner such as "Supplier price list 2026" that
 * sits above the real header (often a merged cell, so only one value survives).
 * A row qualifies only when it holds at most one value while some later row
 * holds two or more, which never matches a genuine single-column list.
 */
export function dropTitleRows(grid: Grid): Grid {
  const rows = grid.slice()
  while (rows.length >= 2) {
    const widestBelow = rows
      .slice(1)
      .reduce((max, row) => Math.max(max, nonEmpty(row).length), 0)
    if (nonEmpty(rows[0]).length <= 1 && widestBelow >= 2) rows.shift()
    else break
  }
  return rows
}

/** Drops columns that are empty in every row, including the header. */
export function dropEmptyColumns(grid: Grid): Grid {
  const width = widthOf(grid)
  const keep: number[] = []
  for (let col = 0; col < width; col++) {
    if (grid.some((row) => (row[col] ?? '') !== '')) keep.push(col)
  }
  return grid.map((row) => keep.map((col) => row[col] ?? ''))
}

export function transpose(grid: Grid): Grid {
  const width = widthOf(grid)
  const result: Grid = []
  for (let col = 0; col < width; col++) {
    result.push(grid.map((row) => row[col] ?? ''))
  }
  return result
}

/**
 * Average per-column type consistency of a grid's body: a column that is all
 * numbers or all text scores 1, one that mixes the two scores lower. A sheet
 * stored row-oriented has consistent columns; a transposed sheet (attributes
 * down the first column, products across the first row) has mixed columns that
 * become consistent once flipped.
 */
function columnHomogeneity(grid: Grid): number {
  if (grid.length < 2) return 0
  const body = grid.slice(1)
  const width = widthOf(grid)
  let sum = 0
  let columns = 0
  for (let col = 0; col < width; col++) {
    const cells = body.map((row) => row[col] ?? '').filter((cell) => cell !== '')
    if (cells.length === 0) continue
    const numericRatio = cells.filter(isNumeric).length / cells.length
    sum += Math.max(numericRatio, 1 - numericRatio)
    columns++
  }
  return columns === 0 ? 0 : sum / columns
}

export interface Orientation {
  grid: Grid
  transposed: boolean
}

/**
 * Transposes only when the flipped layout is clearly more type-consistent. This
 * is deliberately conservative: a genuine row-oriented table already has
 * consistent columns, so it is left alone even when its first column repeats
 * (e.g. a category) or its headers repeat. Transposing is symmetric, so
 * ambiguous grids tie and stay as they are.
 */
export function chooseOrientation(grid: Grid): Orientation {
  if (grid.length < 2) return { grid, transposed: false }

  const flipped = transpose(grid)
  if (columnHomogeneity(flipped) > columnHomogeneity(grid) + ORIENTATION_MARGIN) {
    return { grid: flipped, transposed: true }
  }
  return { grid, transposed: false }
}

/** Turns one row into unique, non-empty column names. */
export function normalizeHeaders(header: string[]): string[] {
  const used = new Set<string>()
  return header.map((cell, index) => {
    let name = cell.trim() || `column_${index + 1}`
    if (used.has(name)) {
      let suffix = 2
      while (used.has(`${name}_${suffix}`)) suffix++
      name = `${name}_${suffix}`
    }
    used.add(name)
    return name
  })
}
