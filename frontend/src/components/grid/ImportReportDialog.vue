<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { GridImportIssue } from '@/types/grid'
import { CORE_FIELDS } from '@/utils/gridFields'

/**
 * Import result viewer.
 *
 * The file picker lives on the page (a toolbar button and the drop target), so
 * this dialog only reports what the last import did. Issues are grouped per
 * spreadsheet row, because "row 14: SKU empty, price not numeric" is actionable
 * while a flat list of 200 messages is not.
 */
const props = defineProps<{
  open: boolean
  report: {
    version: number
    fileName: string
    added: number
    skipped: number
    issues: GridImportIssue[]
  } | null
}>()

const emit = defineEmits<{ (e: 'update:open', value: boolean): void }>()

const { t } = useI18n()

/** The server reports a field key; show the same header the table shows. */
function fieldName(key: string): string {
  if (!key) return ''
  if (key === '*') return t('grid.rowError')
  const field = CORE_FIELDS.find((candidate) => candidate.key === key)
  return field?.labelKey ? t(field.labelKey) : key
}

const groupedIssues = computed(() => {
  if (!props.report) return []
  const map = new Map<number, GridImportIssue[]>()
  for (const issue of props.report.issues) {
    const list = map.get(issue.row) ?? []
    list.push(issue)
    map.set(issue.row, list)
  }
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .slice(0, 200)
    .map(([row, issues]) => ({ row, issues }))
})
</script>

<template>
  <el-dialog
    :model-value="open"
    :title="t('grid.importReportTitle')"
    width="640px"
    @update:model-value="(value: boolean) => emit('update:open', value)"
  >
    <template v-if="report">
      <div :key="report.version" class="import-report">
        <div class="import-report__summary">
          <strong>{{ report.fileName }}</strong>
          <span class="import-report__ok">
            {{ t('grid.importReportAdded', { count: report.added }) }}
          </span>
          <span v-if="report.skipped" class="import-report__bad">
            {{ t('grid.importReportSkipped', { count: report.skipped }) }}
          </span>
        </div>

        <div v-if="groupedIssues.length > 0" class="import-report__issues">
          <div v-for="group in groupedIssues" :key="group.row" class="import-issue">
            <span class="import-issue__row">
              {{ t('grid.importReportRow', { row: group.row }) }}
            </span>
            <span
              v-for="issue in group.issues"
              :key="`${issue.field}-${issue.message}`"
              class="import-issue__item"
            >
              {{ fieldName(issue.field) }}：{{ issue.message }}
            </span>
          </div>
        </div>

        <p v-else class="import-report__clean">
          {{ t('grid.importReportClean') }}
        </p>
      </div>
    </template>

    <template #footer>
      <el-button size="small" type="primary" @click="emit('update:open', false)">
        {{ t('grid.close') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped lang="scss">
@use '../../styles/components/grid/import-report-dialog.scss' as *;
</style>
