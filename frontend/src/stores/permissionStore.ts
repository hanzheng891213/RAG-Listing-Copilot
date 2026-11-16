import { defineStore } from 'pinia'
import { computed } from 'vue'
import type { PermissionKey, UserInfo } from '@/api/auth'
import { useAuthStore } from '@/stores/authStore'

/**
 * Page permissions now come from the server with the signed-in user.
 *
 * The previous build stored groups and memberships in localStorage, which meant
 * the UI gate was the only gate. Server routes check the same permission list,
 * so hiding a menu item and refusing the API call always agree.
 */

export type { PermissionKey }

export const PERMISSION_OPTIONS: Array<{ key: PermissionKey; labelKey: string }> = [
  { key: 'productGrid', labelKey: 'permissions.permissionNames.productGrid' },
  { key: 'listingGenerator', labelKey: 'permissions.permissionNames.listingGenerator' },
  { key: 'knowledgeBase', labelKey: 'permissions.permissionNames.knowledgeBase' },
  { key: 'modelManager', labelKey: 'permissions.permissionNames.modelManager' },
  { key: 'finance', labelKey: 'permissions.permissionNames.finance' },
]

const LEGACY_STORAGE_KEY = 'rag-copilot-permissions-v1'

// Drop the client-side permission state from older builds; it is not read any
// more and leaving it behind invites "why is the UI different from the API".
try {
  localStorage.removeItem(LEGACY_STORAGE_KEY)
} catch { /* storage unavailable */ }

export const usePermissionStore = defineStore('permission', () => {
  const auth = useAuthStore()

  const permissions = computed<PermissionKey[]>(() => auth.permissions)

  function can(permission: PermissionKey): boolean {
    return auth.hasPermission(permission)
  }

  function canFor(user: UserInfo | null | undefined, permission: PermissionKey): boolean {
    if (!user) return false
    if (user.role === 'admin') return true
    return user.permissions.includes(permission)
  }

  return { permissions, can, canFor }
})
