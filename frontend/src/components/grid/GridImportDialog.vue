<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { GridImportIssue } from '@/types/grid'
import { useSupplierParser } from '@/composables/useSupplierParser'

/**
 * Excel/CSV import dialog.
 *
 * Parsing is delegated to the existing supplier parser, so a sheet whose rows
 * and columns are transposed is handled the same way it is on the upload page —
 * that heuristic is the one piece of import logic worth reusing rather than
 * reimplementing.
 *
 * Errors are grouped per row (not one long list) and keyed by `version`, so
 * reopening the dialog rebuilds the list and resets its scroll position instead
 * of reusing stale DOM nodes.
 */
const props = defineProps<{
  open: boolean
  /** Result of the last import, filled in by the page. */
  report: {
    version: number
    fileName: string
    added: number
    skipped: number
    issues: GridImportIssue[]
  } | null
}>()

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'parsed', payload: { records: Array<Record<string, string>>; fileName: string }): void
}>()

const { isParsing, parseFile } = useSupplierParser()

const fileName = ref('')
const records = ref<Array<Record<string, string>>>([])
const parseError = ref('')

const canImport = computed(() => records.value.length > 0 && !isParsing.value)

/** Group issues by row number, preserving column order inside a row. */
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
    .map(([row, issues]) => ({ row, issues }))
})

watch(
  () => props.open,
  (open) => {
    if (!open) {
      fileName.value = ''
      records.value = []
      parseError.value = ''
    }
  },
)

async function onFileChange(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return

  parseError.value = ''
  records.value = []
  fileName.value = file.name

  const result = await parseFile(file)
  if (result.errors.length > 0 && result.products.length === 0) {
    parseError.value = result.errors.map((e) => e.message).join('；')
    return
  }
  records.value = result.products.map((product) => ({ ...product.rawData }))
}

function confirm(): void {
  if (!canImport.value) return
  emit('parsed', { records: records.value, fileName: fileName.value })
}
</script>

<template>
  <el-dialog
    :model-value="open"
    title="导入 Excel / CSV"
    width="640px"
    @update:model-value="(value: boolean) => emit('update:open', value)"
  >
    <div class="import-picker">
      <input type="file" accept=".xlsx,.xls,.csv,.txt" @change="onFileChange" />
      <span v-if="isParsing" class="import-picker__hint">解析中…</span>
      <span v-else-if="fileName" class="import-picker__hint">
        {{ fileName }} — 解析到 {{ records.length }} 行
      </span>
    </div>

    <el-alert
      v-if="parseError"
      type="error"
      :closable="false"
      show-icon
      :title="parseError"
      class="import-alert"
    />

    <el-alert
      type="info"
      :closable="false"
      show-icon
      title="导入的行会插在末尾空白行之前；单行校验失败只跳过该行，不影响其余行。"
      class="import-alert"
    />

    <div v-if="report" :key="report.version" class="import-report">
      <div class="import-report__summary">
        <strong>{{ report.fileName }}</strong>
        <span class="import-report__ok">导入 {{ report.added }} 行</span>
        <span v-if="report.skipped" class="import-report__bad">跳过 {{ report.skipped }} 行</span>
      </div>

      <div v-if="groupedIssues.length > 0" class="import-report__issues">
        <div v-for="group in groupedIssues" :key="group.row" class="import-issue">
          <span class="import-issue__row">第 {{ group.row }} 行</span>
          <span
            v-for="issue in group.issues"
            :key="`${issue.field}-${issue.message}`"
            class="import-issue__item"
          >
            {{ issue.field }}：{{ issue.message }}
          </span>
        </div>
      </div>
    </div>

    <template #footer>
      <el-button size="small" @click="emit('update:open', false)">关闭</el-button>
      <el-button size="small" type="primary" :disabled="!canImport" @click="confirm">
        导入到表格
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.import-picker {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.import-picker__hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.import-alert {
  margin-bottom: 10px;
}

.import-report {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 4px;
  padding: 8px 10px;
  max-height: 240px;
  overflow: auto;
}

.import-report__summary {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  margin-bottom: 6px;
}

.import-report__ok {
  color: var(--el-color-success);
}

.import-report__bad {
  color: var(--el-color-danger);
}

.import-issue {
  display: flex;
  gap: 8px;
  font-size: 12px;
  padding: 3px 0;
  border-top: 1px dashed var(--el-border-color-lighter);
}

.import-issue__row {
  flex: 0 0 68px;
  color: var(--el-color-danger);
  font-variant-numeric: tabular-nums;
}

.import-issue__item {
  color: var(--el-text-color-regular);
}
</style>
