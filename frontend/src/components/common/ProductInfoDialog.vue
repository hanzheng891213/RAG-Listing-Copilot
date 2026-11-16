<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { GridField } from '@/types/grid'

/**
 * Product information modal, shared by the 上架表 and the listing generator.
 *
 * Read-only by default (listing detail). When `editable` is set and the row is
 * writable, every field is an input and the footer saves the whole record in one
 * go; ownership is still re-checked by the caller before writing.
 */
const props = withDefaults(
  defineProps<{
    open: boolean
    title: string
    subtitle?: string
    fields: GridField[]
    values: Record<string, string>
    editable?: boolean
    canEdit?: boolean
    saving?: boolean
  }>(),
  {
    subtitle: '',
    editable: false,
    canEdit: true,
    saving: false,
  },
)

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'save', values: Record<string, string>): void
}>()

const { t } = useI18n()
const draft = ref<Record<string, string>>({})

/** Fields that need the full row width instead of sharing two columns. */
const WIDE_FIELDS = new Set(['title', 'description', 'bulletPoints', 'keywords'])
const MULTILINE_FIELDS = new Set(['description', 'bulletPoints', 'keywords'])

const rows = computed(() => props.fields.filter((field) => !field.readOnly))
const effectiveCanEdit = computed(() => props.editable && props.canEdit)

function resetDraft(): void {
  const next: Record<string, string> = {}
  for (const field of props.fields) next[field.key] = props.values[field.key] ?? ''
  draft.value = next
}

// Snapshot on open, not on every prop change: a background save while the
// modal is open must not overwrite what the user is typing.
watch(
  () => props.open,
  (open) => {
    if (open) resetDraft()
  },
  { immediate: true },
)

function fieldLabel(field: GridField): string {
  return field.labelKey ? t(field.labelKey) : field.label
}

function isWide(field: GridField): boolean {
  return WIDE_FIELDS.has(field.key)
}

function isMultiline(field: GridField): boolean {
  return MULTILINE_FIELDS.has(field.key)
}

function close(): void {
  emit('update:open', false)
}

function save(): void {
  emit('save', { ...draft.value })
}
</script>

<template>
  <el-dialog
    :model-value="open"
    width="860px"
    class="product-info-dialog"
    append-to-body
    destroy-on-close
    :close-on-click-modal="!effectiveCanEdit"
    @update:model-value="(value: boolean) => emit('update:open', value)"
  >
    <template #header>
      <div class="pid-head">
        <span class="pid-kicker">{{ t('productInfo.kicker') }}</span>
        <h3 class="pid-title">{{ title }}</h3>
        <p v-if="subtitle" class="pid-subtitle">{{ subtitle }}</p>
      </div>
    </template>

    <div class="pid-body">
      <el-alert
        v-if="editable && !canEdit"
        type="info"
        :closable="false"
        show-icon
        :title="t('productInfo.readOnly')"
        class="pid-alert"
      />

      <div class="pid-grid">
        <div
          v-for="field in rows"
          :key="field.key"
          class="pid-field"
          :class="{ 'is-wide': isWide(field) }"
        >
          <label class="pid-label">{{ fieldLabel(field) }}</label>

          <template v-if="effectiveCanEdit">
            <el-input
              v-model="draft[field.key]"
              size="small"
              :type="isMultiline(field) ? 'textarea' : 'text'"
              :autosize="isMultiline(field) ? { minRows: 3, maxRows: 8 } : undefined"
              :placeholder="t('productInfo.emptyValue')"
            />
          </template>
          <div
            v-else
            class="pid-value"
            :class="{ 'is-long': isMultiline(field) || isWide(field) }"
          >{{ draft[field.key] || '—' }}</div>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="pid-actions">
        <span v-if="effectiveCanEdit" class="pid-hint">{{ t('productInfo.editHint') }}</span>
        <el-button @click="close">{{ t('common.close') }}</el-button>
        <el-button
          v-if="effectiveCanEdit"
          type="primary"
          :loading="saving"
          @click="save"
        >
          {{ t('common.save') }}
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped lang="scss">
@use '../../styles/components/common/product-info-dialog.scss' as *;
</style>
