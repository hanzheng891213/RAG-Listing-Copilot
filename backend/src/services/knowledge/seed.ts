/**
 * Seed the knowledge base with the bundled platform policy documents.
 *
 * The document bodies live in seedData.ts (generated from
 * knowledge-base/platform-rules/*.md) so this module needs no `fs` and runs
 * identically on Node and on the Cloudflare Worker.
 */

import { getKnowledgeService, type KnowledgeService } from './knowledgeService.js'
import { SEED_DOCS } from './seedData.js'

/**
 * Ingest any seed document not already present, matched by title, so adding a
 * new platform to seedData.ts lands without wiping the existing base.
 * Returns the total number of platform_rules documents afterwards.
 *
 * Callers on the Worker must pass the binding-initialised service — the
 * no-argument default is the in-memory local-dev instance.
 */
export async function seedKnowledgeBase(
  ks: KnowledgeService = getKnowledgeService(),
): Promise<number> {
  const existingDocs = await ks.listDocuments('platform_rules')
  const existingTitles = new Set(existingDocs.map((d) => d.title))

  const missing = SEED_DOCS.filter((doc) => !existingTitles.has(doc.title))
  if (missing.length === 0) {
    console.log(`[Seed] All ${SEED_DOCS.length} seed documents already present. Skipping.`)
    return existingDocs.length
  }

  const count = await ks.seedDocuments(missing)
  console.log(`[Seed] Ingested ${count} new documents (${existingDocs.length} already present).`)
  return existingDocs.length + count
}
