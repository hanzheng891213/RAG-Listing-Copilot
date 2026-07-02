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
      // Start new chunk with overlap from previous
      current = current.slice(-overlap) + '\n\n' + trimmed
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

function splitLongText(text: string, chunkSize: number, overlap: number): string[] {
  const chunks: string[] = []
  let start = 0

  while (start < text.length) {
    let end = start + chunkSize
    if (end >= text.length) {
      chunks.push(text.slice(start).trim())
      break
    }

    // Try to break at sentence boundary
    const slice = text.slice(start, end + 50) // look a bit ahead
    const sentenceBreak = slice.slice(0, chunkSize).match(/[.!?。！？]\s+/g)
    if (sentenceBreak) {
      const lastBreak = slice.lastIndexOf(sentenceBreak[sentenceBreak.length - 1])
      if (lastBreak > chunkSize * 0.5) {
        end = start + lastBreak + 1
      }
    }

    chunks.push(text.slice(start, end).trim())
    start = end - overlap
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
