<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, provide } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import AppSidebar from './AppSidebar.vue'
import AppHeader from './AppHeader.vue'
import { useI18n } from 'vue-i18n'
import { useSupplierStore } from '@/stores/supplierStore'
import { FILE_ACCEPT_EXTENSIONS } from '@/utils/constants'
import type { SupplierProduct } from '@/types/supplier'
import { useSupplierParser } from '@/composables/useSupplierParser'

const { t } = useI18n()
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
  // The 上架表 has its own drop target and overlay; a global overlay would sit
  // on top of the table and swallow the drop.
  if (route.path === '/product-grid') return
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

  // The table page handles its own drop (into the table, which is the point).
  if (route.path === '/product-grid') return

  const files = e.dataTransfer?.files
  if (!files || files.length === 0) return

  const file = files[0]
  if (!isAcceptedFile(file)) return

  // Dropping a file anywhere hands it to the 上架表, which imports and saves it.
  store.setPendingFile(file)
  router.push('/product-grid')
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

// 商品详情浮动面板（从 breadcrumb 下方滑出）
const { getProductLabel } = useSupplierParser()
const detailProduct = ref<SupplierProduct | null>(null)

function showProductDetail(product: SupplierProduct | null) {
  detailProduct.value = product
}

provide('showProductDetail', showProductDetail)
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

      <!-- 商品详情面板：从 breadcrumb 位置下滑出 -->
      <Transition name="detail-slide">
        <div v-if="detailProduct" class="product-detail-overlay" @click.self="detailProduct = null">
          <div class="product-detail-panel">
            <div class="detail-header">
              <span class="detail-title">{{ getProductLabel(detailProduct) }}</span>
              <button class="detail-close" @click="detailProduct = null">&times;</button>
            </div>
            <div class="detail-body">
              <div v-for="(value, key) in detailProduct.rawData" :key="key" class="detail-row">
                <span class="detail-label">{{ key }}</span>
                <span class="detail-value">{{ value || '-' }}</span>
              </div>
            </div>
          </div>
        </div>
      </Transition>

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
        <h3>{{ t('dropOverlay.title') }}</h3>
        <p>{{ t('dropOverlay.hint') }}</p>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '../../styles/components/layout/app-layout.scss' as *;
</style>
