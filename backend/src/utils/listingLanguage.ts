// Target-language pinning for listing generation: one place that names the
// language and one place that checks the answer.
//
// Two separate problems live here:
// 1. Telling the model which language to write in. Only non-English targets used
//    to carry a language instruction, so with English (the default) the model was
//    free to follow the Chinese product data — some rows came back English and
//    some did not, which looks like one broken row rather than a missing rule.
// 2. Checking the answer actually came back in that language. Scripts tell
//    languages apart cheaply; Latin-script targets (es/fr/de/vi) cannot be told
//    apart from English by script, so they are not gated — rewriting a correct
//    answer costs more than the rare miss.

/** Target language when the request does not name one — listings ship in English. */
export const DEFAULT_LISTING_LANGUAGE = 'English'

/** Frontend value (lower case) → the language name used in prompts. */
const LANGUAGE_LABELS: Record<string, string> = {
  english: 'English',
  chinese: 'Chinese',
  spanish: 'Spanish',
  french: 'French',
  german: 'German',
  russian: 'Russian',
  thai: 'Thai',
  vietnamese: 'Vietnamese',
  japanese: 'Japanese',
  korean: 'Korean',
  portuguese: 'Portuguese',
  italian: 'Italian',
  arabic: 'Arabic',
}

/**
 * Normalises the request value into a readable language name, defaulting to
 * English. Unknown values pass through (capitalised) so a newly added language
 * reaches the prompt without touching this table.
 */
export function resolveListingLanguage(language?: string | null): string {
  const key = (language ?? '').trim().toLowerCase()
  if (!key) return DEFAULT_LISTING_LANGUAGE
  const known = LANGUAGE_LABELS[key]
  if (known) return known
  return key.charAt(0).toUpperCase() + key.slice(1)
}

/** CJK (Chinese/Japanese/Korean): any of it fails an English listing. */
const CJK = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uac00-\ud7af]/
const CYRILLIC = /[\u0400-\u04ff]/
const THAI = /[\u0e00-\u0e7f]/

/** Title plus description is the text that gets checked; empty fields are ignored. */
function sampleText(listing: { title?: string; description?: string }): string {
  return [listing.title ?? '', listing.description ?? ''].join('\n')
}

/**
 * True when the output is not in the target language.
 *
 * Only targets whose script is checkable are gated: English, Russian, Thai.
 * Everything else returns false — better to miss a drift than to rewrite a
 * correct listing over one Latin-script brand name.
 */
export function isLanguageDrift(
  listing: { title?: string; description?: string },
  language?: string | null,
): boolean {
  const text = sampleText(listing)
  if (!text.trim()) return false

  switch (resolveListingLanguage(language)) {
    case 'English':
      return CJK.test(text)
    case 'Russian':
      return !CYRILLIC.test(text)
    case 'Thai':
      return !THAI.test(text)
    default:
      return false
  }
}
