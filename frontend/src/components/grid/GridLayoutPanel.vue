<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { GridField, GridLayout } from '@/types/grid'
import { normaliseLayout, defaultLayout } from '@/utils/gridFields'

/**
 * Column layout editor: order / hide / freeze / row numbers.
 *
 * It edits a local copy and only emits on "应用", so cancelling cannot leave the
 * grid in a half-applied layout. The page re-normalises whatever comes back.
 */
const props = defineProps<{
  open: boolean
  layout: GridLayout
  fields: GridField[]
}>()

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'apply', layout: GridLayout): void
  (e: 'reset'): void
  (e: 'save-default', layout: GridLayout): void
}>()

const { t } = useI18n()

/** Core columns are translated; uploaded columns keep their raw header. */
function fieldLabel(field: GridField): string {
  return field.labelKey ? t(field.labelKey) : field.label
}

const draft = ref<GridLayout>(defaultLayout(props.fields))

watch(
  () => props.open,
  (open) => {
    if (open) draft.value = normaliseLayout(props.layout, props.fields)
  },
)

const orderedFields = computed(() =>
  draft.value.order
    .map((key) => props.fields.find((f) => f.key === key))
    .filter((f): f is GridField => Boolean(f)),
)

const visibleCount = computed(
  () => orderedFields.value.filter((f) => !draft.value.hidden.includes(f.key)).length,
)

function move(key: string, delta: number): void {
  const order = [...draft.value.order]
  const index = order.indexOf(key)
  const next = index + delta
  if (index < 0 || next < 0 || next >= order.length) return
  ;[order[index], order[next]] = [order[next], order[index]]
  draft.value = { ...draft.value, order }
}

function toggleHidden(key: string): void {
  const hidden = draft.value.hidden.includes(key)
    ? draft.value.hidden.filter((value) => value !== key)
    : [...draft.value.hidden, key]
  // Never hide the last visible column: an empty grid has no way back.
  if (hidden.length >= props.fields.length) return
  draft.value = { ...draft.value, hidden }
}

function setFreeze(side: 'fixedLeft' | 'fixedRight', value: number): void {
  const next = { ...draft.value, [side]: Number(value) || 0 }
  draft.value = normaliseLayout(next, props.fields)
}

function apply(): void {
  emit('apply', normaliseLayout(draft.value, props.fields))
  emit('update:open', false)
}

function reset(): void {
  draft.value = normaliseLayout(defaultLayout(props.fields), props.fields)
  emit('reset')
}
</script>

<template>
  <el-dialog
    :model-value="open"
    :title="t('grid.layoutTitle')"
    width="560px"
    @update:model-value="(value: boolean) => emit('update:open', value)"
  >
    <el-alert
      type="info"
      :closable="false"
      show-icon
      :title="t('grid.layoutHint')"
      class="layout-hint"
    />

    <div class="layout-section">
      <div class="layout-section__title">
        {{ t('grid.layoutOrder') }}
        <span class="layout-section__meta">
          {{ t('grid.layoutVisibleCount', { visible: visibleCount, total: fields.length }) }}
        </span>
      </div>
      <div class="layout-list">
        <div v-for="field in orderedFields" :key="field.key" class="layout-row">
          <el-checkbox
            :model-value="!draft.hidden.includes(field.key)"
            @update:model-value="toggleHidden(field.key)"
          />
          <span class="layout-row__label" :class="{ 'is-hidden': draft.hidden.includes(field.key) }">
            {{ fieldLabel(field) }}
            <el-tag v-if="!field.core" size="small" type="info">{{ t('grid.uploadColumn') }}</el-tag>
          </span>
          <el-button-group>
            <el-button
              size="small"
              text
              v-tooltip="t('grid.moveUp')"
              :disabled="draft.order[0] === field.key"
              @click="move(field.key, -1)"
            >
              ↑
            </el-button>
            <el-button
              size="small"
              text
              v-tooltip="t('grid.moveDown')"
              :disabled="draft.order[draft.order.length - 1] === field.key"
              @click="move(field.key, 1)"
            >
              ↓
            </el-button>
          </el-button-group>
        </div>
      </div>
    </div>

    <div class="layout-section">
      <div class="layout-section__title">{{ t('grid.layoutFreeze') }}</div>
      <div class="layout-inline">
        <label>{{ t('grid.fixedLeft') }}</label>
        <el-input-number
          :model-value="draft.fixedLeft"
          size="small"
          :min="0"
          :max="Math.max(0, visibleCount - 1)"
          @update:model-value="(value: number | undefined) => setFreeze('fixedLeft', value ?? 0)"
        />
        <label>{{ t('grid.fixedRight') }}</label>
        <el-input-number
          :model-value="draft.fixedRight"
          size="small"
          :min="0"
          :max="Math.max(0, visibleCount - 1)"
          @update:model-value="(value: number | undefined) => setFreeze('fixedRight', value ?? 0)"
        />
        <label>{{ t('grid.showRowNumber') }}</label>
        <el-switch
          :model-value="draft.showRowNumber"
          @update:model-value="(value: boolean) => (draft = { ...draft, showRowNumber: value })"
        />
      </div>
      <p class="layout-note">{{ t('grid.layoutNote') }}</p>
    </div>

    <template #footer>
      <div class="layout-footer">
        <div>
          <el-button size="small" @click="reset">{{ t('grid.restoreDefault') }}</el-button>
          <el-button size="small" @click="emit('save-default', normaliseLayout(draft, fields))">
            {{ t('grid.saveAsDefault') }}
          </el-button>
        </div>
        <div>
          <el-button size="small" @click="emit('update:open', false)">
            {{ t('grid.cancel') }}
          </el-button>
          <el-button size="small" type="primary" @click="apply">
            {{ t('grid.apply') }}
          </el-button>
        </div>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped lang="scss">
@use '../../styles/components/grid/grid-layout-panel.scss' as *;
</style>
