import { ref } from 'vue'
import { generateListing, generateListingStream } from '@/api/listing'
import { useModelStore } from '@/stores/modelStore'
import { bulletPointsToCell, sourceFields } from '@/utils/gridFields'
import i18n from '@/locales'
import type { GeneratedListing, Platform } from '@/types/listing'
import type { SupplierProduct } from '@/types/supplier'

/**
 * Listing generation for table rows.
 *
 * Both the 上架表 and the listing page generate for the same row, so the call,
 * the timeout, the fallback and the "what lands back in the row" mapping live
 * here instead of being duplicated by each page.
 */

/** A row-shaped generation target: the grid row or a mapped product row. */
export interface GenerationTarget {
  id: string
  fields: Record<string, string>
}

const STREAM_TIMEOUT_MS = 120_000

/** Maps a generated listing onto the columns that store it. */
export function listingToFields(listing: GeneratedListing): Record<string, string> {
  return {
    title: listing.title ?? '',
    description: listing.description ?? '',
    bulletPoints: bulletPointsToCell(listing.bulletPoints ?? []),
    keywords: (listing.keywords ?? []).join(', '),
  }
}

export function useListingGeneration() {
  const modelStore = useModelStore()
  const platform = ref<Platform>('amazon')

  function buildPayload(target: GenerationTarget, language: string, targetPlatform?: Platform) {
    const cfg = modelStore.activeConfig
    const product: SupplierProduct = {
      id: target.id,
      rawData: sourceFields(target.fields),
    }
    // The server resolves model, temperature and key from the caller's stored
    // config; sending them from the browser would let a client raise its own
    // token budget and leak the provider key into the request log.
    return {
      productId: target.id,
      platform: targetPlatform ?? platform.value,
      template: 'standard',
      productData: product,
      providerId: cfg?.providerId,
      language,
    }
  }

  function generateStreamed(payload: ReturnType<typeof buildPayload>): Promise<GeneratedListing> {
    return new Promise<GeneratedListing>((resolve, reject) => {
      let settled = false
      let timer: ReturnType<typeof setTimeout> | null = null

      const finish = (fn: () => void) => {
        if (settled) return
        settled = true
        if (timer) clearTimeout(timer)
        fn()
      }

      const controller = generateListingStream(
        payload,
        // Partial fields are ignored on purpose: the done event carries the
        // complete listing, and writing twice would dirty the row twice.
        () => {},
        (listing) => finish(() => resolve(listing)),
        (message) =>
          finish(() =>
            reject(new Error(message || i18n.global.t('grid.generateFailed'))),
          ),
      )

      timer = setTimeout(() => {
        controller.abort()
        finish(() => reject(new Error(i18n.global.t('grid.generationTimeout'))))
      }, STREAM_TIMEOUT_MS)
    })
  }

  /**
   * Streams by default and falls back to the plain POST when streaming is
   * unavailable (proxy buffering, older backend). The caller only sees the final
   * listing or an error.
   */
  async function generate(
    target: GenerationTarget,
    language: string,
    targetPlatform?: Platform,
  ): Promise<GeneratedListing> {
    if (!modelStore.loaded) await modelStore.loadConfigs()
    if (!modelStore.hasAnyConfigured) {
      throw new Error('NO_MODEL')
    }
    const payload = buildPayload(target, language, targetPlatform)
    try {
      return await generateStreamed(payload)
    } catch (error) {
      console.warn('[Listing] stream failed, retrying without SSE:', error)
      const listing = await generateListing(payload)
      return listing as unknown as GeneratedListing
    }
  }

  return { platform, generate }
}
