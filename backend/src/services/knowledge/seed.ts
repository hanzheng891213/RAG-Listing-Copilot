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
 * Ingest the seed documents. Returns the number of documents in the
 * platform_rules category afterwards (0 if seeding failed).
 *
 * Callers on the Worker must pass the binding-initialised service — the
 * no-argument default is the in-memory local-dev instance.
 */
export async function seedKnowledgeBase(
  ks: KnowledgeService = getKnowledgeService(),
): Promise<number> {
  const existingDocs = await ks.listDocuments('platform_rules')
  if (existingDocs.length > 0) {
    console.log(`[Seed] Knowledge base already has ${existingDocs.length} documents. Skipping.`)
    return existingDocs.length
  }

  const count = await ks.seedDocuments(SEED_DOCS)
  console.log(`[Seed] Successfully ingested ${count} documents into knowledge base.`)
  return count
}
