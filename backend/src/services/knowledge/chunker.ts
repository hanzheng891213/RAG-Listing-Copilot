/**
 * Text chunking for RAG knowledge base.
 * Produces overlapping chunks suitable for embedding and retrieval.
 */

const DEFAULT_CHUNK_SIZE = 512
const DEFAULT_OVERLAP = 128

export interface ChunkResult {
  content: string
  index: number
}

/**
 * Split text into overlapping chunks.
 * Tries paragraph boundaries first, then sentence boundaries, then character count.
 */
export function chunkText(
  text: string,
  options?: { chunkSize?: number; overlap?: number },
): string[] {
  const chunkSize = options?.chunkSize ?? DEFAULT_CHUNK_SIZE
  const overlap = options?.overlap ?? DEFAULT_OVERLAP

  if (!text || text.trim().length === 0) return []
  if (text.length <= chunkSize) return [text.trim()]

  // Split into paragraphs first
  const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim().length > 0)

  const chunks: string[] = []
  let current = ''

  for (const para of paragraphs) {
    const trimmed = para.trim()

    // If a single paragraph exceeds chunk size, split it further
    if (trimmed.length > chunkSize) {
      if (current) {
        chunks.push(current.trim())
        current = ''
      }
      // Split long paragraph by sentences
      const subChunks = splitLongText(trimmed, chunkSize, overlap)
      chunks.push(...subChunks)
      continue
    }

    // If adding this paragraph would exceed chunk size, finalize current chunk
    if (current && current.length + trimmed.length + 2 > chunkSize) {
      chunks.push(current.trim())
      // Carry overlap into the next chunk, starting at a word boundary so the
      // chunk doesn't open with the tail of a word.
      current = overlapTail(current, overlap) + '\n\n' + trimmed
    } else if (current) {
      current += '\n\n' + trimmed
    } else {
      current = trimmed
    }

    // If current chunk reaches target size, push it
    if (current.length >= chunkSize) {
      chunks.push(current.trim())
      current = ''
    }
  }

  if (current.trim()) {
    chunks.push(current.trim())
  }

  return chunks.filter((c) => c.length > 0)
}

/**
 * Ordered split preferences. Markdown tables and lists put one row per line,
 * so a line break is the boundary that keeps their rows intact; a hard cut in
 * the middle of a table row is worse than a slightly short chunk.
 */
const BREAK_SEPARATORS = ['\n\n', '\n', '. ', '。', '! ', '！', '? ', '？', '; ', '；', ' ']

/**
 * Index just past the last preferred separator within [from, to], or null when
 * the window holds none.
 */
function findBreak(text: string, from: number, to: number): number | null {
  for (const sep of BREAK_SEPARATORS) {
    const idx = text.lastIndexOf(sep, to)
    if (idx >= from) return idx + sep.length
  }
  return null
}

/** Last `overlap` characters of `text`, advanced to the next word boundary. */
function overlapTail(text: string, overlap: number): string {
  if (text.length <= overlap) return text
  const tail = text.slice(-overlap)
  const boundary = tail.search(/\s/)
  return boundary >= 0 ? tail.slice(boundary + 1) : tail
}

/**
 * First position at or after `from` (and before `limit`) where a chunk can
 * safely resume: a line break if one is in range, otherwise a space. Keeps the
 * overlap from reopening the next chunk with the tail of a word.
 */
function findResume(text: string, from: number, limit: number): number {
  for (let i = from; i < limit; i++) {
    if (text[i] === '\n') return i + 1
  }
  for (let i = from; i < limit; i++) {
    if (text[i] === ' ') return i + 1
  }
  return from
}

function splitLongText(text: string, chunkSize: number, overlap: number): string[] {
  const chunks: string[] = []
  let start = 0

  while (start < text.length) {
    let end = Math.min(start + chunkSize, text.length)
    if (end >= text.length) {
      const tail = text.slice(start).trim()
      if (tail) chunks.push(tail)
      break
    }

    // Look slightly past the target so a nearby boundary can be used instead of
    // cutting a word in half. Never search before the halfway point, or chunks
    // could shrink without bound.
    const breakAt = findBreak(
      text,
      start + Math.floor(chunkSize * 0.5),
      Math.min(end + 100, text.length - 1),
    )
    if (breakAt !== null) end = breakAt

    const piece = text.slice(start, end).trim()
    if (piece) chunks.push(piece)

    // Always advance, even when overlap would otherwise rewind the cursor.
    const next = end - overlap
    start = next > start ? Math.max(findResume(text, next, end), next) : end
  }

  return chunks.filter((c) => c.length > 0)
}

/**
 * Chunk a markdown document, preserving heading context.
 * Prepends the nearest heading to each chunk for better retrieval.
 */
export function chunkMarkdown(
  markdown: string,
  options?: { chunkSize?: number; overlap?: number },
): string[] {
  const rawChunks = chunkText(markdown, options)
  const headings = extractHeadingContext(markdown)
  return rawChunks.map((chunk) => {
    const heading = findRelevantHeading(chunk, markdown, headings)
    return heading ? `${heading}\n\n${chunk}` : chunk
  })
}

interface HeadingInfo {
  text: string
  position: number
}

function extractHeadingContext(markdown: string): HeadingInfo[] {
  const headings: HeadingInfo[] = []
  const regex = /^(#{1,3})\s+(.+)$/gm
  let match: RegExpExecArray | null
  while ((match = regex.exec(markdown)) !== null) {
    headings.push({ text: match[2].trim(), position: match.index })
  }
  return headings
}

function findRelevantHeading(
  chunk: string,
  fullText: string,
  headings: HeadingInfo[],
): string | null {
  const chunkStart = fullText.indexOf(chunk)
  if (chunkStart === -1 || headings.length === 0) return null

  // Find the closest heading before this chunk
  let closest: HeadingInfo | null = null
  for (const h of headings) {
    if (h.position < chunkStart) {
      closest = h
    } else {
      break
    }
  }
  return closest?.text ?? null
}
