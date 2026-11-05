import { ref } from 'vue'
import { listProducts, type ListProductsParams } from '@/api/products'
import type { GridPage, GridRow } from '@/types/grid'

/**
 * Paged reads for the grid: short-lived cache, in-flight dedupe, and a request
 * number so a slow response can never overwrite a newer one.
 *
 * Scope note: this caches a single page per query (TTL 3s, 20 entries). It does
 * not reconstruct full-result snapshots for client-side re-slicing, so the grid
 * asks the server for paging and does not pretend to know pages it never read.
 */

const TTL_MS = 3_000
const CAPACITY = 20
/** Two rapid clicks on "next" must not produce two list requests. */
const THROTTLE_MS = 3_000

interface CacheEntry {
  at: number
  page: GridPage<GridRow>
}

function keyOf(params: ListProductsParams): string {
  return `${params.page ?? 1}|${params.pageSize ?? 100}|${params.q ?? ''}`
}

export function useGridQuery() {
  const cache = new Map<string, CacheEntry>()
  const inflight = new Map<string, Promise<GridPage<GridRow>>>()
  const loading = ref(false)
  const error = ref<string | null>(null)

  let requestNumber = 0
  let lastRequestAt = 0
  let lastParams: ListProductsParams | null = null

  function prune(now: number) {
    for (const [key, entry] of cache) {
      if (now - entry.at > TTL_MS) cache.delete(key)
    }
    while (cache.size > CAPACITY) {
      const oldest = cache.keys().next().value
      if (!oldest) break
      cache.delete(oldest)
    }
  }

  /**
   * Fetches a page. Resolves to null when the response belongs to a superseded
   * request, so the caller can skip applying it.
   */
  async function fetchPage(params: ListProductsParams): Promise<GridPage<GridRow> | null> {
    const now = Date.now()
    const key = keyOf(params)

    const cached = cache.get(key)
    if (cached && now - cached.at <= TTL_MS) {
      return cached.page
    }

    if (now - lastRequestAt < THROTTLE_MS && lastParams && keyOf(lastParams) === key) {
      // Same page re-requested inside the throttle window: serve the cached
      // copy if there is one, otherwise let it through (first load wins).
      if (cached) return cached.page
    }

    const pending = inflight.get(key)
    if (pending) return pending

    const myNumber = ++requestNumber
    lastRequestAt = now
    lastParams = params
    loading.value = true
    error.value = null

    const request = listProducts(params)
      .then((page) => {
        if (myNumber !== requestNumber) return null as unknown as GridPage<GridRow>
        if (page.tableMissing) {
          // Do not cache a schema error as if it were an empty page.
          return page
        }
        cache.set(key, { at: Date.now(), page })
        prune(Date.now())
        return page
      })
      .catch((err: unknown) => {
        // A failed request must not poison the throttle timestamp.
        if (myNumber === requestNumber) lastRequestAt = 0
        throw err
      })
      .finally(() => {
        inflight.delete(key)
        if (myNumber === requestNumber) loading.value = false
      })

    inflight.set(key, request)
    return request
  }

  /** Writes, identity switches and unrecoverable errors all invalidate reads. */
  function clear(): void {
    cache.clear()
    inflight.clear()
    lastRequestAt = 0
    lastParams = null
  }

  /** Cancels any in-flight response from being applied to the grid. */
  function invalidateInFlight(): void {
    requestNumber += 1
    loading.value = false
  }

  return {
    loading,
    error,
    fetchPage,
    clear,
    invalidateInFlight,
  }
}
