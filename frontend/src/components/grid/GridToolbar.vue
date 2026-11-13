<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { GRID_PAGE_SIZES } from '@/utils/constants'

/**
 * Grid toolbar: actions and paging. It knows nothing about rows or saving
 * strategy — the page decides what "save" means (single batch) and what needs
 * confirming when a page or page size changes.
 */
const props = defineProps<{
  dirty: boolean
  summary: { added: number; modified: number; deleted: number }
  saving: boolean
  loading: boolean
  importing?: boolean
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

const { t } = useI18n()

const summaryText = computed(() => {
  const parts: string[] = []
  if (props.summary.added) parts.push(t('grid.summaryAdded', { count: props.summary.added }))
  if (props.summary.modified) {
    parts.push(t('grid.summaryModified', { count: props.summary.modified }))
  }
  if (props.summary.deleted) {
    parts.push(t('grid.summaryDeleted', { count: props.summary.deleted }))
  }
  return parts.join(' · ')
})

function onSearchInput(value: string): void {
  emit('update:search', value)
}

function onPageSizeChange(value: number): void {
  emit('update:pageSize', Number(value))
}
</script>

<template>
  <div class="grid-toolbar">
    <div class="grid-toolbar__left">
      <el-button size="small" :disabled="!canWrite || saving" @click="emit('add')">
        {{ t('grid.addRow') }}
      </el-button>
      <el-button
        size="small"
        :disabled="!canWrite || saving || selectedCount === 0"
        @click="emit('delete')"
      >
        {{
          selectedCount
            ? t('grid.deleteSelectedCount', { count: selectedCount })
            : t('grid.deleteSelected')
        }}
      </el-button>
      <el-button
        size="small"
        type="primary"
        :loading="saving"
        :disabled="!canWrite || !dirty || saving"
        @click="emit('save')"
      >
        {{ t('grid.saveChanges') }}
      </el-button>
      <el-button size="small" :disabled="!dirty || saving" @click="emit('discard')">
        {{ t('grid.discardChanges') }}
      </el-button>

      <el-divider direction="vertical" />

      <el-button
        size="small"
        type="primary"
        plain
        :loading="importing"
        :disabled="saving || !canWrite"
        @click="emit('import')"
      >
        <el-icon><Upload /></el-icon>
        {{ t('grid.importFile') }}
      </el-button>
      <el-button size="small" :disabled="saving" @click="emit('export')">
        {{ t('grid.exportFile') }}
      </el-button>
      <el-button size="small" :disabled="saving" @click="emit('layout')">
        {{ t('grid.columnSettings') }}
      </el-button>
    </div>

    <div class="grid-toolbar__right">
      <span v-if="summaryText" class="grid-toolbar__dirty">{{ summaryText }}</span>
      <span v-if="ephemeral" class="grid-toolbar__badge">{{ t('grid.memoryMode') }}</span>
      <el-input
        :model-value="search"
        size="small"
        clearable
        :placeholder="t('grid.searchPlaceholder')"
        class="grid-toolbar__search"
        @update:model-value="onSearchInput"
        @keyup.enter="emit('refresh')"
        @clear="emit('refresh')"
      />

      <div class="grid-toolbar__pager">
        <span class="grid-toolbar__total">{{ t('grid.totalItems', { total: totalItems }) }}</span>
        <el-select
          :model-value="pageSize"
          size="small"
          :disabled="saving || loading"
          :aria-label="t('grid.pageSizeLabel')"
          class="grid-toolbar__size"
          @change="onPageSizeChange"
        >
          <el-option
            v-for="size in GRID_PAGE_SIZES"
            :key="size"
            :value="size"
            :label="t('grid.pageSizeOption', { size })"
          />
        </el-select>
        <el-pagination
          small
          layout="prev, pager, next"
          :current-page="page"
          :page-size="pageSize"
          :total="totalItems"
          :pager-count="5"
          :disabled="saving || loading"
          @current-change="(value: number) => emit('update:page', value)"
        />
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '../../styles/components/grid/grid-toolbar.scss' as *;
</style>
