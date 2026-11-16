<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import ConfirmButton from '@/components/common/ConfirmButton.vue'
import { fetchUsers, type UserInfo } from '@/api/auth'
import { useAuthStore } from '@/stores/authStore'
import {
  PERMISSION_OPTIONS,
  usePermissionStore,
  type PermissionGroup,
  type PermissionKey,
} from '@/stores/permissionStore'

/**
 * Admin-only permission page.
 *
 * Two surfaces in one screen: who exists (users, with the group they belong to)
 * and what a group can open (page permissions). Accounts come from the backend
 * directory when it is reachable, unioned with accounts registered in this
 * browser; groups and memberships persist in localStorage with the local auth
 * model.
 */
const { t } = useI18n()
const auth = useAuthStore()
const permission = usePermissionStore()

const users = ref<UserInfo[]>([])
const loading = ref(false)
const search = ref('')
const offline = ref(false)

const ADMIN_GROUP = 'admin'

const filteredUsers = computed(() => {
  const query = search.value.trim().toLowerCase()
  if (!query) return users.value
  return users.value.filter((user) => user.username.toLowerCase().includes(query))
})

function mergeUsers(local: UserInfo[], remote: UserInfo[]): UserInfo[] {
  const byName = new Map<string, UserInfo>()
  for (const user of local) byName.set(user.username.toLowerCase(), user)
  for (const user of remote) byName.set(user.username.toLowerCase(), user)
  return [...byName.values()].sort((a, b) => {
    if (a.role !== b.role) return a.role === 'admin' ? -1 : 1
    return a.createdAt.localeCompare(b.createdAt)
  })
}

async function loadUsers(): Promise<void> {
  loading.value = true
  const local = auth.listKnownUsers()
  let remote: UserInfo[] = []
  try {
    const response = await fetchUsers()
    remote = Array.isArray(response?.users) ? response.users : []
    offline.value = false
  } catch (error) {
    console.warn('[Permissions] user directory unavailable, using local accounts:', error)
    offline.value = true
  } finally {
    users.value = mergeUsers(local, remote)
    loading.value = false
  }
}

function roleLabel(user: UserInfo): string {
  return user.role === 'admin' ? t('user.adminRole') : t('user.userRole')
}

function groupLabel(group: PermissionGroup | undefined): string {
  if (!group) return ''
  return group.nameKey ? t(group.nameKey) : group.name ?? ''
}

function groupIdOf(user: UserInfo): string {
  return permission.groupFor(user).id
}

function membersOf(groupId: string): number {
  return users.value.filter((user) => permission.groupFor(user).id === groupId).length
}

function onAssign(user: UserInfo, groupId: string): void {
  if (!permission.assign(user.id, groupId)) return
  ElMessage.success(
    t('permissions.assigned', {
      name: user.username,
      group: groupLabel(permission.groupById(groupId)),
    }),
  )
}

function onPermissionsChange(groupId: string, value: PermissionKey[]): void {
  if (permission.setGroupPermissions(groupId, value)) {
    ElMessage.success(t('permissions.groupUpdated'))
  }
}

async function onCreateGroup(): Promise<void> {
  try {
    const result = await ElMessageBox.prompt(
      t('permissions.groupNamePlaceholder'),
      t('permissions.newGroupTitle'),
      {
        confirmButtonText: t('permissions.create'),
        cancelButtonText: t('common.cancel'),
        inputPattern: /\S+/,
        inputErrorMessage: t('permissions.nameRequired'),
      },
    )
    const group = permission.createGroup(result.value)
    if (!group) {
      ElMessage.warning(t('permissions.nameExists'))
      return
    }
    ElMessage.success(t('permissions.groupCreated'))
  } catch {
    // cancelled
  }
}

function onDeleteGroup(group: PermissionGroup): void {
  if (permission.deleteGroup(group.id)) {
    ElMessage.success(t('permissions.groupDeleted'))
  }
}

function registeredAt(user: UserInfo): string {
  if (!user.createdAt) return '—'
  const date = new Date(user.createdAt)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString()
}

onMounted(loadUsers)
</script>

<template>
  <div class="permission-settings">
    <div class="page-header">
      <p class="page-desc">{{ t('permissions.description') }}</p>
    </div>

    <el-alert
      type="info"
      :closable="false"
      show-icon
      :title="t('permissions.hint')"
      class="permission-alert"
    />

    <div class="permission-layout">
      <!-- ── Users ─────────────────────────────────────────────────── -->
      <section class="permission-panel users-panel">
        <div class="panel-head">
          <div>
            <h2 class="panel-title">{{ t('permissions.users') }}</h2>
            <p class="panel-hint">
              {{ offline ? t('permissions.usersOffline') : t('permissions.usersHint') }}
            </p>
          </div>
          <span class="panel-count">{{ users.length }}</span>
        </div>

        <div class="users-toolbar">
          <el-input
            v-model="search"
            size="small"
            clearable
            :placeholder="t('permissions.searchPlaceholder')"
          >
            <template #prefix><el-icon><Search /></el-icon></template>
          </el-input>
        </div>

        <el-table
          v-loading="loading"
          :data="filteredUsers"
          size="small"
          class="users-table"
          :empty-text="t('permissions.noUsers')"
        >
          <el-table-column :label="t('permissions.user')" min-width="200">
            <template #default="{ row }">
              <div class="user-cell">
                <span class="user-avatar" :class="{ admin: row.role === 'admin' }">
                  {{ row.username.slice(0, 1).toUpperCase() }}
                </span>
                <div class="user-copy">
                  <span class="user-name">{{ row.username }}</span>
                  <span class="user-meta">{{ registeredAt(row) }}</span>
                </div>
              </div>
            </template>
          </el-table-column>

          <el-table-column :label="t('permissions.role')" width="96">
            <template #default="{ row }">
              <span class="role-tag" :class="row.role">{{ roleLabel(row) }}</span>
            </template>
          </el-table-column>

          <el-table-column :label="t('permissions.group')" width="170">
            <template #default="{ row }">
              <el-tooltip
                v-if="row.role === 'admin'"
                :content="t('permissions.adminLocked')"
                placement="top"
              >
                <el-select :model-value="ADMIN_GROUP" size="small" disabled>
                  <el-option :label="groupLabel(permission.groupById(ADMIN_GROUP))" :value="ADMIN_GROUP" />
                </el-select>
              </el-tooltip>
              <el-select
                v-else
                :model-value="groupIdOf(row)"
                size="small"
                @change="(value: string) => onAssign(row, value)"
              >
                <el-option
                  v-for="group in permission.groups"
                  :key="group.id"
                  :label="groupLabel(group)"
                  :value="group.id"
                />
              </el-select>
            </template>
          </el-table-column>
        </el-table>
      </section>

      <!-- ── Groups ────────────────────────────────────────────────── -->
      <section class="permission-panel groups-panel">
        <div class="panel-head">
          <div>
            <h2 class="panel-title">{{ t('permissions.groups') }}</h2>
            <p class="panel-hint">{{ t('permissions.groupsHint') }}</p>
          </div>
          <el-button size="small" type="primary" plain @click="onCreateGroup">
            <el-icon><Plus /></el-icon>
            {{ t('permissions.newGroup') }}
          </el-button>
        </div>

        <ul class="group-list">
          <li v-for="group in permission.groups" :key="group.id" class="group-card">
            <div class="group-head">
              <div class="group-identity">
                <span class="group-name">{{ groupLabel(group) }}</span>
                <span v-if="group.system" class="group-tag">{{ t('permissions.systemGroup') }}</span>
                <span v-if="group.id === ADMIN_GROUP" class="group-tag admin">
                  {{ t('permissions.allAccess') }}
                </span>
              </div>
              <div class="group-actions">
                <span class="group-members">
                  {{ t('permissions.members', { count: membersOf(group.id) }) }}
                </span>
                <ConfirmButton
                  v-if="!group.system"
                  size="small"
                  text
                  type="danger"
                  :confirm-title="t('common.confirmTitle')"
                  :confirm-message="t('permissions.confirmDeleteGroup', { name: groupLabel(group) })"
                  @click="onDeleteGroup(group)"
                >
                  {{ t('common.delete') }}
                </ConfirmButton>
              </div>
            </div>

            <el-checkbox-group
              :model-value="group.permissions"
              class="permission-checks"
              :disabled="group.id === ADMIN_GROUP"
              @update:model-value="(value: any) => onPermissionsChange(group.id, value)"
            >
              <el-checkbox
                v-for="option in PERMISSION_OPTIONS"
                :key="option.key"
                :value="option.key"
              >
                {{ t(option.labelKey) }}
              </el-checkbox>
            </el-checkbox-group>

            <p v-if="group.id === ADMIN_GROUP" class="group-note">
              {{ t('permissions.adminLocked') }}
            </p>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/components/views/permission-settings.scss' as *;
</style>
