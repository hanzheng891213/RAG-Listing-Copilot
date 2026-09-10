/**
 * Markdown handling for knowledge documents.
 *
 * Full markdown is only rendered in the detail dialog. Anywhere the raw
 * content is shown as a preview it must go through toPlainText first,
 * otherwise heading hashes, table pipes and bullet markers leak into the copy.
 */

/** Strip markdown syntax and collapse the result to a single readable line. */
export function toPlainText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/gm, ' ')
    .replace(/^\s*\|.*\|\s*$/gm, ' ')
    .replace(/^\s{0,3}(?:[-*+]|\d+\.)\s+/gm, '')
    .replace(/\[[ xX]\]/g, ' ')
    .replace(/\*{1,3}([^*\n]+)\*{1,3}/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}
