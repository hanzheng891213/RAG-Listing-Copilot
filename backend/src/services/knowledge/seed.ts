/**
 * Seed the knowledge base with the bundled platform policy documents.
 *
 * The document bodies live in seedData.ts (generated from
 * knowledge-base/platform-rules/*.md) so this module needs no `fs` and runs
 * identically on Node and on the Cloudflare Worker.
 */

import { getKnowledgeService, type KnowledgeService } from './knowledgeService.js'
import { SEED_DOCS } from './seedData.js'

export interface SeedProgress {
  /** Documents ingested by this call. */
  ingested: number
  /** Seed documents still missing — call again to continue. 0 means done. */
  remaining: number
  /** Documents in platform_rules after this call. */
  total: number
}

/**
 * Documents per call when the caller doesn't specify. Every chunk costs one
 * embedding request plus one vector upsert, so a 10-chunk document is ~11
 * outbound subrequests. A Worker request has a hard subrequest cap, and
 * ingesting the whole backlog at once blows through it partway.
 */
export const DEFAULT_SEED_BATCH = 2

/**
 * Ingest seed documents that aren't already present, matched by title, so
 * adding a new platform to seedData.ts lands without wiping the existing base.
 * Processes at most `limit` documents; callers repeat until `remaining` is 0.
 *
 * Callers on the Worker must pass the binding-initialised service — the
 * no-argument default is the in-memory local-dev instance.
 */
export async function seedKnowledgeBase(
  ks: KnowledgeService = getKnowledgeService(),
  options?: { limit?: number },
): Promise<SeedProgress> {
  const existingDocs = await ks.listDocuments('platform_rules')
  const existingTitles = new Set(existingDocs.map((d) => d.title))

  const missing = SEED_DOCS.filter((doc) => !existingTitles.has(doc.title))
  if (missing.length === 0) {
    return { ingested: 0, remaining: 0, total: existingDocs.length }
  }

  const limit = options?.limit && options.limit > 0 ? options.limit : missing.length
  const ingested = await ks.seedDocuments(missing.slice(0, limit))
  const remaining = missing.length - ingested

  console.log(`[Seed] Ingested ${ingested}, ${remaining} remaining.`)
  return { ingested, remaining, total: existingDocs.length + ingested }
}
