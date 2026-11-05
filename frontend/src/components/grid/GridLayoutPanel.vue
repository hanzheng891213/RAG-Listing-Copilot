<script setup lang="ts">
import { computed, ref, watch } from 'vue'
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
    title="列设置"
    width="560px"
    @update:model-value="(value: boolean) => emit('update:open', value)"
  >
    <el-alert
      type="info"
      :closable="false"
      show-icon
      title="布局只影响显示：隐藏的列仍会保存，复制粘贴仍按列的原始顺序映射。"
      class="layout-hint"
    />

    <div class="layout-section">
      <div class="layout-section__title">
        列顺序与显示
        <span class="layout-section__meta">当前显示 {{ visibleCount }} / {{ fields.length }} 列</span>
      </div>
      <div class="layout-list">
        <div v-for="field in orderedFields" :key="field.key" class="layout-row">
          <el-checkbox
            :model-value="!draft.hidden.includes(field.key)"
            @update:model-value="toggleHidden(field.key)"
          />
          <span class="layout-row__label" :class="{ 'is-hidden': draft.hidden.includes(field.key) }">
            {{ field.label }}
            <el-tag v-if="!field.core" size="small" type="info">上传列</el-tag>
          </span>
          <el-button-group>
            <el-button size="small" text :disabled="draft.order[0] === field.key" @click="move(field.key, -1)">
              ↑
            </el-button>
            <el-button
              size="small"
              text
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
      <div class="layout-section__title">冻结与序号</div>
      <div class="layout-inline">
        <label>左侧冻结列数</label>
        <el-input-number
          :model-value="draft.fixedLeft"
          size="small"
          :min="0"
          :max="Math.max(0, visibleCount - 1)"
          @update:model-value="(value: number | undefined) => setFreeze('fixedLeft', value ?? 0)"
        />
        <label>右侧冻结列数</label>
        <el-input-number
          :model-value="draft.fixedRight"
          size="small"
          :min="0"
          :max="Math.max(0, visibleCount - 1)"
          @update:model-value="(value: number | undefined) => setFreeze('fixedRight', value ?? 0)"
        />
        <label>显示行号</label>
        <el-switch
          :model-value="draft.showRowNumber"
          @update:model-value="(value: boolean) => (draft = { ...draft, showRowNumber: value })"
        />
      </div>
      <p class="layout-note">左冻结优先；两侧合计不会超过可见列数，避免同一列被钉两次。</p>
    </div>

    <template #footer>
      <div class="layout-footer">
        <div>
          <el-button size="small" @click="reset">恢复默认</el-button>
          <el-button size="small" @click="emit('save-default', normaliseLayout(draft, fields))">
            存为我的默认
          </el-button>
        </div>
        <div>
          <el-button size="small" @click="emit('update:open', false)">取消</el-button>
          <el-button size="small" type="primary" @click="apply">应用</el-button>
        </div>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped>
.layout-hint {
  margin-bottom: 12px;
}

.layout-section {
  margin-bottom: 16px;
}

.layout-section__title {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 8px;
}

.layout-section__meta {
  font-size: 12px;
  font-weight: 400;
  color: var(--el-text-color-secondary);
}

.layout-list {
  max-height: 260px;
  overflow: auto;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 4px;
  padding: 4px 8px;
}

.layout-row {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 32px;
  border-bottom: 1px dashed var(--el-border-color-lighter);
}

.layout-row:last-child {
  border-bottom: none;
}

.layout-row__label {
  flex: 1;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.layout-row__label.is-hidden {
  color: var(--el-text-color-disabled);
  text-decoration: line-through;
}

.layout-inline {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 13px;
}

.layout-note {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.layout-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
</style>
