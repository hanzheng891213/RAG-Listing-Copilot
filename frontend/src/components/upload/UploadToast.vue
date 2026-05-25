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
      return 'var(--accent-coral-glow, rgba(232, 120, 90, 0.15))'
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

<style scoped>
.upload-toast {
  position: fixed;
  top: 24px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 9999;
  min-width: 380px;
  max-width: 560px;
  border: 1px solid;
  border-radius: var(--radius-md, 10px);
  backdrop-filter: blur(16px);
  box-shadow: 0 8px 32px var(--shadow-color, rgba(0, 0, 0, 0.3));
  overflow: hidden;
}

.toast-inner {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 16px 20px;
}

.toast-icon {
  flex-shrink: 0;
  margin-top: 2px;
}

.toast-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.toast-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.4;
}

.toast-message {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.5;
  word-break: break-word;
}

.toast-close {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm, 6px);
  margin-top: -2px;
  transition: color var(--transition-fast, 0.2s);
}

.toast-close:hover {
  color: var(--text-primary);
}

.toast-progress {
  height: 3px;
  background: var(--accent, #2dd4a8);
  animation: toast-shrink var(--dismiss-duration, 5s) linear forwards;
  opacity: 0.6;
}

@keyframes toast-shrink {
  from { width: 100%; }
  to { width: 0%; }
}

.toast-slide-enter-active {
  transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1);
}

.toast-slide-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.toast-slide-enter-from {
  opacity: 0;
  transform: translateX(-50%) translateY(-12px);
}

.toast-slide-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(-12px);
}
</style>
