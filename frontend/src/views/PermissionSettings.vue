<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import {
  fetchUsers,
  updateUser,
  type PermissionKey,
  type UserInfo,
} from '@/api/auth'
import { useAuthStore } from '@/stores/authStore'
import { PERMISSION_OPTIONS } from '@/stores/permissionStore'
import errors from '@/locales/errors'

/**
 * Admin-only account page.
 *
 * Accounts are the server's D1 directory now: a newly registered user lands
 * here with no permissions, and the administrator grants pages one checkbox at
 * a time. Each save is a single PATCH, and every API route checks the same
 * permission list, so the UI and the server cannot disagree.
 */
const { t, locale } = useI18n()
const auth = useAuthStore()

const users = ref<UserInfo[]>([])
const loading = ref(false)
const loadError = ref('')
const search = ref('')

const editing = ref<UserInfo | null>(null)
const dialogOpen = ref(false)
const saving = ref(false)
const draft = reactive<{
  role: 'admin' | 'user'
  disabled: boolean
  permissions: PermissionKey[]
}>({ role: 'user', disabled: false, permissions: [] })

const filteredUsers = computed(() => {
  const query = search.value.trim().toLowerCase()
  const rows = [...users.value].sort((a, b) => {
    if (a.role !== b.role) return a.role === 'admin' ? -1 : 1
    return a.createdAt.localeCompare(b.createdAt)
  })
  if (!query) return rows
  return rows.filter((user) => user.username.toLowerCase().includes(query))
})

const pendingCount = computed(
  () => users.value.filter((user) => user.role !== 'admin' && user.permissions.length === 0).length,
)

function errorMessage(error: any, fallbackKey: string): string {
  const code = error?.response?.data?.code
  const table = (errors as Record<string, Record<string, string>>)[locale.value]
  return (
    (code && (table?.[code] || errors.en?.[code])) ||
    error?.response?.data?.error ||
    t(fallbackKey)
  )
}

async function loadUsers(): Promise<void> {
  loading.value = true
  loadError.value = ''
  try {
    const response = await fetchUsers()
    users.value = Array.isArray(response?.users) ? response.users : []
  } catch (error) {
    loadError.value = errorMessage(error, 'permissions.loadFailed')
  } finally {
    loading.value = false
  }
}

function roleLabel(user: UserInfo): string {
  return user.role === 'admin' ? t('user.adminRole') : t('user.userRole')
}

function registeredAt(user: UserInfo): string {
  if (!user.createdAt) return '—'
  const date = new Date(user.createdAt)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString()
}

function permissionLabel(key: PermissionKey): string {
  const option = PERMISSION_OPTIONS.find((item) => item.key === key)
  return option ? t(option.labelKey) : key
}

function permissionLabels(user: UserInfo): string[] {
  if (user.role === 'admin') return PERMISSION_OPTIONS.map((option) => t(option.labelKey))
  return user.permissions.map(permissionLabel)
}

function isSelf(user: UserInfo): boolean {
  return user.id === auth.user?.id
}

function openEditor(user: UserInfo): void {
  editing.value = user
  draft.role = user.role
  draft.disabled = user.disabled
  draft.permissions = [...user.permissions]
  dialogOpen.value = true
}

function togglePermission(key: PermissionKey, checked: boolean): void {
  const next = new Set(draft.permissions)
  if (checked) next.add(key)
  else next.delete(key)
  draft.permissions = [...next]
}

function isAdminDraft(): boolean {
  return draft.role === 'admin'
}

/**
 * Demotion is not a grant: switching an admin to user clears the inherited
 * "all permissions" ticks so the administrator has to choose explicitly.
 */
function onRoleChange(value: string | number | boolean | undefined): void {
  const role = value === 'admin' ? 'admin' : 'user'
  draft.role = role
  if (role === 'user') draft.permissions = []
}

async function save(): Promise<void> {
  const target = editing.value
  if (!target || saving.value) return
  if (isSelf(target)) {
    ElMessage.warning(t('permissions.cannotEditSelf'))
    return
  }

  saving.value = true
  try {
    const response = await updateUser(target.id, {
      role: draft.role,
      disabled: draft.disabled,
      permissions: draft.role === 'admin' ? undefined : draft.permissions,
    })
    const updated = response?.user
    if (updated) {
      const index = users.value.findIndex((user) => user.id === updated.id)
      if (index >= 0) users.value[index] = updated
    }
    dialogOpen.value = false
    ElMessage.success(t('permissions.saved'))
  } catch (error) {
    ElMessage.error(errorMessage(error, 'permissions.saveFailed'))
  } finally {
    saving.value = false
  }
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

    <section class="permission-panel">
      <div class="panel-head">
        <div>
          <h2 class="panel-title">{{ t('permissions.users') }}</h2>
          <p class="panel-hint">
            {{ t('permissions.usersHint') }}
            <span v-if="pendingCount > 0" class="pending-note">
              {{ t('permissions.pendingCount', { count: pendingCount }) }}
            </span>
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

      <el-alert
        v-if="loadError"
        type="error"
        :closable="false"
        show-icon
        :title="loadError"
        class="permission-alert"
      />

      <el-table
        v-loading="loading"
        :data="filteredUsers"
        size="small"
        class="users-table"
        :empty-text="t('permissions.noUsers')"
      >
        <el-table-column :label="t('permissions.user')" min-width="220">
          <template #default="{ row }">
            <div class="user-cell">
              <span class="user-avatar" :class="{ admin: row.role === 'admin' }">
                {{ row.username.slice(0, 1).toUpperCase() }}
              </span>
              <div class="user-copy">
                <span class="user-name">{{ row.username }}</span>
                <span class="user-meta">
                  {{ registeredAt(row) }}
                  <template v-if="isSelf(row)"> · {{ t('permissions.you') }}</template>
                </span>
              </div>
            </div>
          </template>
        </el-table-column>

        <el-table-column :label="t('permissions.role')" width="100">
          <template #default="{ row }">
            <span class="role-tag" :class="row.role">{{ roleLabel(row) }}</span>
          </template>
        </el-table-column>

        <el-table-column :label="t('permissions.pagePermissions')" min-width="260">
          <template #default="{ row }">
            <div class="permission-tags">
              <span
                v-for="label in permissionLabels(row)"
                :key="label"
                class="permission-tag"
              >
                {{ label }}
              </span>
              <span v-if="permissionLabels(row).length === 0" class="permission-tag empty">
                {{ t('permissions.noAccessYet') }}
              </span>
            </div>
          </template>
        </el-table-column>

        <el-table-column :label="t('permissions.status')" width="92">
          <template #default="{ row }">
            <span class="role-tag" :class="{ disabled: row.disabled }">
              {{ row.disabled ? t('permissions.disabled') : t('permissions.active') }}
            </span>
          </template>
        </el-table-column>

        <el-table-column :label="t('permissions.actions')" width="92" align="right">
          <template #default="{ row }">
            <el-button
              size="small"
              text
              type="primary"
              :disabled="isSelf(row)"
              @click="openEditor(row)"
            >
              {{ t('permissions.edit') }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </section>

    <el-dialog
      v-model="dialogOpen"
      :title="t('permissions.editUser', { name: editing?.username ?? '' })"
      width="480px"
      append-to-body
    >
      <div class="permission-editor">
        <div class="editor-row">
          <span class="editor-label">{{ t('permissions.role') }}</span>
          <el-radio-group v-model="draft.role" size="small" @change="onRoleChange">
            <el-radio-button value="user">{{ t('user.userRole') }}</el-radio-button>
            <el-radio-button value="admin">{{ t('user.adminRole') }}</el-radio-button>
          </el-radio-group>
        </div>

        <div class="editor-row">
          <span class="editor-label">{{ t('permissions.status') }}</span>
          <el-switch
            v-model="draft.disabled"
            :active-text="t('permissions.disabled')"
            :inactive-text="t('permissions.active')"
          />
        </div>

        <div class="editor-block">
          <span class="editor-label">{{ t('permissions.pagePermissions') }}</span>
          <p v-if="isAdminDraft()" class="panel-hint">{{ t('permissions.adminLocked') }}</p>
          <div class="permission-checks" :class="{ locked: isAdminDraft() }">
            <el-checkbox
              v-for="option in PERMISSION_OPTIONS"
              :key="option.key"
              :model-value="isAdminDraft() ? true : draft.permissions.includes(option.key)"
              :disabled="isAdminDraft()"
              @update:model-value="(checked: any) => togglePermission(option.key, Boolean(checked))"
            >
              {{ t(option.labelKey) }}
            </el-checkbox>
          </div>
        </div>
      </div>

      <template #footer>
        <el-button @click="dialogOpen = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="saving" @click="save">
          {{ t('common.save') }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/components/views/permission-settings.scss' as *;

.pending-note {
  margin-left: 6px;
  color: var(--accent);
}

.permission-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.permission-tag {
  padding: 1px 7px;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  font-size: 10.5px;
  color: var(--text-secondary);
  white-space: nowrap;
}

.permission-tag.empty {
  border-style: dashed;
  color: var(--text-muted);
}

.role-tag.disabled {
  border-style: dashed;
  color: var(--text-muted);
}

.permission-editor {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.editor-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.editor-block {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.editor-label {
  font-size: 12px;
  color: var(--text-secondary);
}

.permission-checks.locked {
  opacity: 0.7;
}
</style>
