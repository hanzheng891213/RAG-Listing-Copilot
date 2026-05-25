<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import AppSidebar from './AppSidebar.vue'
import AppHeader from './AppHeader.vue'
import { useSupplierStore } from '@/stores/supplierStore'
import { FILE_ACCEPT_EXTENSIONS } from '@/utils/constants'

const router = useRouter()
const route = useRoute()
const store = useSupplierStore()

const sidebarCollapsed = ref(false)
const mobileSidebarOpen = ref(false)
const isMobile = ref(window.innerWidth < 768)

const isDragging = ref(false)
let dragCounter = 0

const sidebarWidth = computed(() => {
  if (isMobile.value) return '0'
  return sidebarCollapsed.value ? '64px' : '220px'
})

function toggleSidebar() {
  if (isMobile.value) {
    mobileSidebarOpen.value = !mobileSidebarOpen.value
  } else {
    sidebarCollapsed.value = !sidebarCollapsed.value
  }
}

function closeMobileSidebar() {
  mobileSidebarOpen.value = false
}

function onResize() {
  isMobile.value = window.innerWidth < 768
  if (!isMobile.value) {
    mobileSidebarOpen.value = false
  }
}

function isAcceptedFile(file: File): boolean {
  const ext = '.' + file.name.split('.').pop()?.toLowerCase()
  return FILE_ACCEPT_EXTENSIONS.includes(ext)
}

function onDragEnter(e: DragEvent) {
  e.preventDefault()
  e.stopPropagation()
  dragCounter++
  if (e.dataTransfer?.types.includes('Files')) {
    isDragging.value = true
  }
}

function onDragOver(e: DragEvent) {
  e.preventDefault()
  e.stopPropagation()
  if (e.dataTransfer) {
    e.dataTransfer.dropEffect = 'copy'
  }
}

function onDragLeave(e: DragEvent) {
  e.preventDefault()
  e.stopPropagation()
  dragCounter--
  if (dragCounter <= 0) {
    dragCounter = 0
    isDragging.value = false
  }
}

function onDrop(e: DragEvent) {
  e.preventDefault()
  e.stopPropagation()
  isDragging.value = false
  dragCounter = 0

  // On the supplier-upload page, let el-upload handle the drop natively
  if (route.path === '/supplier-upload') return

  const files = e.dataTransfer?.files
  if (!files || files.length === 0) return

  const file = files[0]
  if (!isAcceptedFile(file)) return

  store.setPendingFile(file)
  router.push('/supplier-upload')
}

onMounted(() => {
  window.addEventListener('resize', onResize)
  window.addEventListener('dragenter', onDragEnter)
  window.addEventListener('dragover', onDragOver)
  window.addEventListener('dragleave', onDragLeave)
  window.addEventListener('drop', onDrop)
})

onUnmounted(() => {
  window.removeEventListener('resize', onResize)
  window.removeEventListener('dragenter', onDragEnter)
  window.removeEventListener('dragover', onDragOver)
  window.removeEventListener('dragleave', onDragLeave)
  window.removeEventListener('drop', onDrop)
})
</script>

<template>
  <div class="app-layout" :class="{ 'sidebar-collapsed': sidebarCollapsed }">
    <AppSidebar
      :collapsed="sidebarCollapsed"
      :mobile-open="mobileSidebarOpen"
      @toggle="toggleSidebar"
      @nav="closeMobileSidebar"
    />
    <div class="main-area" :style="{ marginLeft: sidebarWidth }">
      <AppHeader @toggle-sidebar="toggleSidebar" />
      <main class="main-content">
        <router-view v-slot="{ Component }">
          <transition name="page" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </main>
    </div>
    <!-- Mobile overlay -->
    <div
      v-if="mobileSidebarOpen"
      class="mobile-overlay"
      @click="closeMobileSidebar"
    />

    <!-- Global file drop overlay -->
    <div v-if="isDragging" class="global-drop-overlay">
      <div class="global-drop-zone">
        <div class="global-drop-icon">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
        </div>
        <h3>释放文件以开始上传</h3>
        <p>支持 Excel (.xlsx, .xls)、CSV、TXT 格式</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.app-layout {
  display: flex;
  min-height: 100vh;
}

.main-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  transition: margin-left var(--transition-base);
  min-width: 0;
}

.main-content {
  flex: 1;
  padding: 24px 32px;
  max-width: 1440px;
  width: 100%;
  margin: 0 auto;
}

.mobile-overlay {
  display: none;
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 90;
  backdrop-filter: blur(2px);
}

.global-drop-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  animation: fade-in 0.15s ease;
}

.global-drop-zone {
  background: var(--bg-card);
  border: 2px dashed var(--accent);
  border-radius: var(--radius-lg);
  padding: 60px 80px;
  text-align: center;
  box-shadow: 0 0 60px var(--accent-glow);
  animation: scale-in 0.2s ease;
}

.global-drop-icon {
  color: var(--accent);
  margin-bottom: 20px;
}

.global-drop-zone h3 {
  font-family: var(--font-body);
  font-size: 22px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 10px;
}

.global-drop-zone p {
  color: var(--text-secondary);
  font-size: 14px;
}

@keyframes fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes scale-in {
  from { transform: scale(0.95); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}

@media (max-width: 1024px) {
  .main-content {
    padding: 20px 24px;
  }
}

@media (max-width: 768px) {
  .main-area {
    margin-left: 0 !important;
  }

  .main-content {
    padding: 16px;
  }

  .mobile-overlay {
    display: block;
  }

  .global-drop-zone {
    padding: 40px 30px;
    margin: 20px;
  }
}
</style>
