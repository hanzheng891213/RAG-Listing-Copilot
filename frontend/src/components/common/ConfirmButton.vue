<script setup lang="ts">
import { ElMessageBox } from 'element-plus'
import type { ButtonType, ButtonSize } from 'element-plus'

const props = withDefaults(defineProps<{
  confirmTitle?: string
  confirmMessage?: string
  confirmButtonText?: string
  cancelButtonText?: string
  type?: ButtonType
  size?: ButtonSize
  text?: boolean
  disabled?: boolean
  loading?: boolean
  icon?: string
  danger?: boolean
}>(), {
  confirmTitle: '确认操作',
  confirmMessage: '确定要执行此操作吗？',
  confirmButtonText: '确定',
  cancelButtonText: '取消',
  type: 'default' as ButtonType,
})

const emit = defineEmits<{
  click: []
}>()

async function handleClick() {
  try {
    await ElMessageBox.confirm(props.confirmMessage, props.confirmTitle, {
      confirmButtonText: props.confirmButtonText,
      cancelButtonText: props.cancelButtonText,
      type: 'warning',
      draggable: true,
    })
    emit('click')
  } catch {
    // cancelled
  }
}
</script>

<template>
  <el-button
    :type="type"
    :size="size"
    :text="text"
    :disabled="disabled"
    :loading="loading"
    @click="handleClick"
  >
    <slot />
  </el-button>
</template>
