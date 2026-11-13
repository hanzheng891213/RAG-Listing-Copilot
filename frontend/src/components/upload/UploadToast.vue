<script setup lang="ts">
import { watch, ref, onUnmounted } from 'vue'

const props = defineProps<{
  visible: boolean
  type: 'success' | 'error' | 'warning'
  title: string
  message: string
  icon: string
  autoDismiss: boolean
  duration?: number
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const show = ref(false)
let dismissTimer: ReturnType<typeof setTimeout> | null = null

watch(
  () => props.visible,
  (val) => {
    if (val) {
      show.value = true
      if (props.autoDismiss) {
        clearDismissTimer()
        dismissTimer = setTimeout(() => {
          handleClose()
        }, props.duration || 5000)
      }
    } else {
      show.value = false
      clearDismissTimer()
    }
  },
  { immediate: true },
)

function clearDismissTimer() {
  if (dismissTimer) {
    clearTimeout(dismissTimer)
    dismissTimer = null
  }
}

function handleClose() {
  show.value = false
  clearDismissTimer()
  setTimeout(() => emit('close'), 300)
}

function getBorderColor(): string {
  switch (props.type) {
    case 'success':
      return 'var(--success, #2dd4a8)'
    case 'error':
      return 'var(--danger, #e8785a)'
    case 'warning':
      return 'var(--warning, #e8b85a)'
    default:
      return 'var(--accent, #2dd4a8)'
  }
}

function getBgColor(): string {
  switch (props.type) {
    case 'success':
      return 'var(--accent-glow, rgba(45, 212, 168, 0.15))'
    case 'error':
      return 'color-mix(in srgb, var(--danger) 12%, transparent)'
    case 'warning':
      return 'rgba(232, 184, 90, 0.12)'
    default:
      return 'var(--accent-glow, rgba(45, 212, 168, 0.15))'
  }
}

onUnmounted(() => {
  clearDismissTimer()
})
</script>

<template>
  <Teleport to="body">
    <Transition name="toast-slide">
      <div v-if="show" class="upload-toast" :style="{ borderColor: getBorderColor(), background: getBgColor() }">
        <div class="toast-inner">
          <div class="toast-icon">
            <el-icon :size="20" :color="getBorderColor()">
              <component :is="icon" />
            </el-icon>
          </div>
          <div class="toast-body">
            <span class="toast-title">{{ title }}</span>
            <span class="toast-message">{{ message }}</span>
          </div>
          <button v-if="!autoDismiss" class="toast-close" @click="handleClose">
            <el-icon :size="16"><Close /></el-icon>
          </button>
        </div>
        <div v-if="autoDismiss" class="toast-progress" :style="{ '--dismiss-duration': (duration || 5) + 's' }" />
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped lang="scss">
@use '../../styles/components/upload/upload-toast.scss' as *;
</style>
