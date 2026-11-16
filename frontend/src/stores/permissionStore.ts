import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { UserInfo } from '@/api/auth'
import { useAuthStore } from '@/stores/authStore'

/**
 * Front-end permission groups.
 *
 * The account model is local (self-registration lives in localStorage), so the
 * groups and their memberships are persisted here too, per browser. Page access
 * is the permission unit: a group owns a set of pages, and the router guard plus
 * the sidebar read the same `can()` result.
 *
 * Administrators bypass groups entirely, which also guarantees the permission
 * page itself can never be locked out by a bad edit.
 */

export type PermissionKey = 'productGrid' | 'listingGenerator' | 'knowledgeBase' | 'modelManager'

export const PERMISSION_OPTIONS: Array<{ key: PermissionKey; labelKey: string }> = [
  { key: 'productGrid', labelKey: 'permissions.permissionNames.productGrid' },
  { key: 'listingGenerator', labelKey: 'permissions.permissionNames.listingGenerator' },
  { key: 'knowledgeBase', labelKey: 'permissions.permissionNames.knowledgeBase' },
  { key: 'modelManager', labelKey: 'permissions.permissionNames.modelManager' },
]

export interface PermissionGroup {
  id: string
  /** Custom groups carry a free name; built-ins carry an i18n key. */
  name?: string
  nameKey?: string
  permissions: PermissionKey[]
  /** Built-in groups cannot be deleted (their permissions are still editable). */
  system?: boolean
}

interface PermissionState {
  version: 1
  groups: PermissionGroup[]
  /** userId -> groupId */
  assignments: Record<string, string>
}

const STORAGE_KEY = 'rag-copilot-permissions-v1'
const ADMIN_GROUP = 'admin'
const DEFAULT_GROUP = 'standard'

const DEFAULT_GROUPS: PermissionGroup[] = [
  {
    id: ADMIN_GROUP,
    nameKey: 'permissions.groupNames.admin',
    permissions: ['productGrid', 'listingGenerator', 'knowledgeBase', 'modelManager'],
    system: true,
  },
  {
    id: DEFAULT_GROUP,
    nameKey: 'permissions.groupNames.standard',
    permissions: ['productGrid', 'listingGenerator', 'knowledgeBase'],
    system: true,
  },
  {
    id: 'guest',
    nameKey: 'permissions.groupNames.guest',
    permissions: ['productGrid'],
    system: true,
  },
]

function defaultState(): PermissionState {
  return {
    version: 1,
    groups: DEFAULT_GROUPS.map((group) => ({ ...group, permissions: [...group.permissions] })),
    assignments: {},
  }
}

function isPermissionKey(value: unknown): value is PermissionKey {
  return PERMISSION_OPTIONS.some((option) => option.key === value)
}

/** Stored state is repaired, never trusted: stale keys are dropped. */
function loadState(): PermissionState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultState()
    const parsed = JSON.parse(raw) as Partial<PermissionState> | null
    if (!parsed || !Array.isArray(parsed.groups)) return defaultState()

    const groups: PermissionGroup[] = parsed.groups
      .filter((group): group is PermissionGroup => Boolean(group && typeof group.id === 'string'))
      .map((group) => ({
        id: group.id,
        name: typeof group.name === 'string' ? group.name : undefined,
        nameKey: typeof group.nameKey === 'string' ? group.nameKey : undefined,
        permissions: (Array.isArray(group.permissions) ? group.permissions : []).filter(
          isPermissionKey,
        ),
        system: Boolean(group.system),
      }))

    // Built-in groups are part of the contract; a state that lost one is reset
    // rather than rendering a page with no default group.
    if (!groups.some((group) => group.id === ADMIN_GROUP) || !groups.some((group) => group.id === DEFAULT_GROUP)) {
      return defaultState()
    }

    // The admin group always owns every permission, including permissions added
    // after this browser last saved its state.
    const adminGroup = groups.find((group) => group.id === ADMIN_GROUP)
    if (adminGroup) {
      adminGroup.permissions = PERMISSION_OPTIONS.map((option) => option.key)
    }

    const knownIds = new Set(groups.map((group) => group.id))
    const assignments: Record<string, string> = {}
    for (const [userId, groupId] of Object.entries(parsed.assignments ?? {})) {
      if (typeof groupId === 'string' && knownIds.has(groupId)) assignments[userId] = groupId
    }

    return { version: 1, groups, assignments }
  } catch {
    return defaultState()
  }
}

export const usePermissionStore = defineStore('permission', () => {
  const auth = useAuthStore()
  const state = ref<PermissionState>(loadState())

  const groups = computed(() => state.value.groups)
  const assignments = computed(() => state.value.assignments)

  function persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.value))
    } catch {
      // Quota / private mode: permissions still apply for this session.
    }
  }

  function groupById(id: string): PermissionGroup | undefined {
    return groups.value.find((group) => group.id === id)
  }

  /** The group a user belongs to; falls back to the role default. */
  function groupFor(user: UserInfo | null | undefined): PermissionGroup {
    if (!user) return groupById('guest') ?? groups.value[0]
    const assigned = groupById(assignments.value[user.id])
    if (assigned) return assigned
    const fallback = user.role === 'admin' ? ADMIN_GROUP : DEFAULT_GROUP
    return groupById(fallback) ?? groups.value[0]
  }

  /** Administrators always pass, so the permission page can never self-lock. */
  function canFor(user: UserInfo | null | undefined, permission: PermissionKey): boolean {
    if (user?.role === 'admin') return true
    return groupFor(user).permissions.includes(permission)
  }

  function can(permission: PermissionKey): boolean {
    return canFor(auth.user, permission)
  }

  function assign(userId: string, groupId: string): boolean {
    if (!userId || !groupById(groupId)) return false
    state.value.assignments = { ...state.value.assignments, [userId]: groupId }
    persist()
    return true
  }

  function setGroupPermissions(groupId: string, permissions: PermissionKey[]): boolean {
    if (groupId === ADMIN_GROUP) return false
    const group = groupById(groupId)
    if (!group) return false
    group.permissions = permissions.filter(isPermissionKey)
    state.value.groups = [...state.value.groups]
    persist()
    return true
  }

  function createGroup(name: string): PermissionGroup | null {
    const trimmed = name.trim()
    if (!trimmed) return null
    if (groups.value.some((group) => (group.name ?? '').toLowerCase() === trimmed.toLowerCase())) {
      return null
    }
    const group: PermissionGroup = {
      id: `g_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      name: trimmed,
      permissions: ['productGrid'],
    }
    state.value.groups = [...state.value.groups, group]
    persist()
    return group
  }

  function renameGroup(groupId: string, name: string): boolean {
    const group = groupById(groupId)
    if (!group || group.system || !name.trim()) return false
    group.name = name.trim()
    state.value.groups = [...state.value.groups]
    persist()
    return true
  }

  /** Deleting a group moves its members back to the default group. */
  function deleteGroup(groupId: string): boolean {
    const group = groupById(groupId)
    if (!group || group.system) return false
    state.value.groups = state.value.groups.filter((item) => item.id !== groupId)
    const assignmentsNext: Record<string, string> = {}
    for (const [userId, assigned] of Object.entries(assignments.value)) {
      if (assigned !== groupId) assignmentsNext[userId] = assigned
    }
    state.value.assignments = assignmentsNext
    persist()
    return true
  }

  function memberCount(groupId: string): number {
    return Object.values(assignments.value).filter((assigned) => assigned === groupId).length
  }

  return {
    groups,
    assignments,
    groupById,
    groupFor,
    canFor,
    can,
    assign,
    setGroupPermissions,
    createGroup,
    renameGroup,
    deleteGroup,
    memberCount,
  }
})
