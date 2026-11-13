import { ref } from 'vue'
import { listProducts, saveProductBatch } from '@/api/products'
import { useAuthStore } from '@/stores/authStore'
import i18n from '@/locales'
import type { GridRow } from '@/types/grid'
import type { SupplierProduct } from '@/types/supplier'

/**
 * The listing page's read model over the 上架表.
 *
 * The table is the single source of truth for products, so this loads the rows
 * and exposes them in the shape the generation pipeline already understands
 * (`SupplierProduct.rawData`), plus a write-back that merges the generated
 * fields into the stored row.
 */

export interface GridProduct extends SupplierProduct {
  fields: Record<string, string>
  ownerId: string
  /** False for rows another user owns — the batch API would reject the write. */
  editable: boolean
}

const PAGE_SIZE = 100
/** Safety cap: the picker is a working list, not an export of the whole D1. */
const MAX_PAGES = 10

export function useGridProducts() {
  const auth = useAuthStore()
  const items = ref<GridProduct[]>([])
  const loading = ref(false)
  const error = ref('')

  function isMeaningful(fields: Record<string, string>): boolean {
    return Object.values(fields ?? {}).some((value) => (value ?? '').trim() !== '')
  }

  function canWrite(ownerId: string): boolean {
    if (!auth.isLoggedIn) return false
    if (auth.isAdmin) return true
    return !ownerId || ownerId === auth.user?.id
  }

  async function loadAll(): Promise<void> {
    loading.value = true
    error.value = ''
    try {
      const collected: GridRow[] = []
      let page = 1
      let totalPages = 1
      do {
        const result = await listProducts({ page, pageSize: PAGE_SIZE })
        collected.push(...(result.items ?? []))
        totalPages = Math.max(1, result.totalPages ?? 1)
        page += 1
      } while (page <= totalPages && page <= MAX_PAGES)

      items.value = collected
        .filter((row) => isMeaningful(row.fields))
        .map((row) => ({
          id: row.id,
          rawData: { ...row.fields },
          fields: { ...row.fields },
          ownerId: row.ownerId,
          editable: canWrite(row.ownerId),
        }))
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err)
      throw err
    } finally {
      loading.value = false
    }
  }

  function find(id: string): GridProduct | undefined {
    return items.value.find((product) => product.id === id)
  }

  /**
   * Writes generated values back into the row. The batch endpoint replaces the
   * whole field object, so the merge happens on the snapshot this page loaded.
   *
   * A 200 response is not success: the server reports per-row rejections
   * (ownership, validation) inside `rejected`, and dropping them would report
   * "generated" for a row that never changed.
   */
  async function patch(id: string, values: Record<string, string>): Promise<boolean> {
    const product = find(id)
    if (!product) return false
    const merged = { ...product.rawData, ...values }

    const result = await saveProductBatch({ items: [{ id, fields: merged }], deletedIds: [] })
    const rejected = (result.rejected ?? []).find((entry) => entry.id === id)
    if (rejected) {
      throw new Error(rejected.reason || i18n.global.t('grid.rowWriteDenied'))
    }
    if (!(result.saved ?? []).some((row) => row.id === id)) {
      throw new Error(i18n.global.t('grid.rowNotWritten'))
    }

    product.rawData = merged
    product.fields = merged
    return true
  }

  return { items, loading, error, loadAll, find, patch }
}
