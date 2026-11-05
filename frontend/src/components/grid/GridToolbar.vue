<script setup lang="ts">
import { computed } from 'vue'

/**
 * Grid toolbar: actions only. It knows nothing about rows or saving strategy —
 * the page decides what "save" means (single batch) and what needs confirming.
 */
const props = defineProps<{
  dirty: boolean
  summary: { added: number; modified: number; deleted: number }
  saving: boolean
  loading: boolean
  canWrite: boolean
  selectedCount: number
  page: number
  pageSize: number
  totalItems: number
  totalPages: number
  search: string
  ephemeral: boolean
}>()

const emit = defineEmits<{
  (e: 'add'): void
  (e: 'delete'): void
  (e: 'save'): void
  (e: 'discard'): void
  (e: 'import'): void
  (e: 'export'): void
  (e: 'layout'): void
  (e: 'update:page', value: number): void
  (e: 'update:pageSize', value: number): void
  (e: 'update:search', value: string): void
  (e: 'refresh'): void
}>()

const summaryText = computed(() => {
  const parts: string[] = []
  if (props.summary.added) parts.push(`新增 ${props.summary.added}`)
  if (props.summary.modified) parts.push(`修改 ${props.summary.modified}`)
  if (props.summary.deleted) parts.push(`删除 ${props.summary.deleted}`)
  return parts.join(' · ')
})

function onSearchInput(value: string): void {
  emit('update:search', value)
}
</script>

<template>
  <div class="grid-toolbar">
    <div class="grid-toolbar__left">
      <el-button size="small" :disabled="!canWrite || saving" @click="emit('add')">
        新增行
      </el-button>
      <el-button
        size="small"
        :disabled="!canWrite || saving || selectedCount === 0"
        @click="emit('delete')"
      >
        删除选中<span v-if="selectedCount">（{{ selectedCount }}）</span>
      </el-button>
      <el-button
        size="small"
        type="primary"
        :loading="saving"
        :disabled="!canWrite || !dirty || saving"
        @click="emit('save')"
      >
        保存
      </el-button>
      <el-button size="small" :disabled="!dirty || saving" @click="emit('discard')">
        放弃修改
      </el-button>

      <el-divider direction="vertical" />

      <el-button size="small" :disabled="saving" @click="emit('import')">导入 Excel</el-button>
      <el-button size="small" :disabled="saving" @click="emit('export')">导出</el-button>
      <el-button size="small" :disabled="saving" @click="emit('layout')">列设置</el-button>
    </div>

    <div class="grid-toolbar__right">
      <span v-if="summaryText" class="grid-toolbar__dirty">{{ summaryText }}</span>
      <span v-if="ephemeral" class="grid-toolbar__badge">内存模式</span>
      <el-input
        :model-value="search"
        size="small"
        clearable
        placeholder="搜索商品"
        class="grid-toolbar__search"
        @update:model-value="onSearchInput"
        @keyup.enter="emit('refresh')"
        @clear="emit('refresh')"
      />
      <el-pagination
        small
        layout="total, prev, pager, next"
        :current-page="page"
        :page-size="pageSize"
        :total="totalItems"
        :disabled="saving"
        @current-change="(value: number) => emit('update:page', value)"
      />
    </div>
  </div>
</template>

<style scoped>
.grid-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding: 8px 12px;
  border: 1px solid var(--el-border-color);
  border-radius: 6px;
  background: var(--el-bg-color);
  margin-bottom: 8px;
}

.grid-toolbar__left,
.grid-toolbar__right {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.grid-toolbar__dirty {
  font-size: 12px;
  color: var(--el-color-warning);
  margin-right: 4px;
}

.grid-toolbar__badge {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  border: 1px dashed var(--el-border-color);
  border-radius: 3px;
  padding: 1px 5px;
}

.grid-toolbar__search {
  width: 180px;
}
</style>
