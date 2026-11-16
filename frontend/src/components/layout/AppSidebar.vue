<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/authStore'
import { usePermissionStore, type PermissionKey } from '@/stores/permissionStore'

const props = defineProps<{ collapsed: boolean; mobileOpen: boolean }>()
const emit = defineEmits<{ toggle: []; nav: [] }>()

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const permission = usePermissionStore()

interface NavItem {
  path: string
  labelKey: string
  icon: string
  requiresAdmin?: boolean
  permission?: PermissionKey
}

const BASE_NAV_ITEMS: NavItem[] = [
  { path: '/', labelKey: 'nav.home', icon: 'HomeFilled' },
  { path: '/product-grid', labelKey: 'nav.productGrid', icon: 'Grid', permission: 'productGrid' },
  { path: '/listing-generator', labelKey: 'nav.listingGenerator', icon: 'MagicStick', permission: 'listingGenerator' },
  { path: '/knowledge-base', labelKey: 'nav.knowledgeBase', icon: 'Collection', permission: 'knowledgeBase' },
  { path: '/model-manager', labelKey: 'nav.modelManager', icon: 'Cpu', permission: 'modelManager' },
  { path: '/permission-settings', labelKey: 'nav.permissionSettings', icon: 'Lock', requiresAdmin: true },
]

const navItems = computed(() =>
  BASE_NAV_ITEMS.filter((item) => {
    if (item.requiresAdmin && !auth.isAdmin) return false
    if (item.permission && !permission.can(item.permission)) return false
    return true
  }),
)

function isActive(path: string) {
  if (path === '/') return route.path === '/'
  return route.path.startsWith(path)
}

function navigate(path: string) {
  router.push(path)
  emit('nav')
}

// ── 路由预加载：hover 导航项时预取组件资源 ──────────────────────────
const prefetchTimers = new Map<string, ReturnType<typeof setTimeout>>()

function onNavHover(path: string) {
  if (path === route.path) return
  // 延迟 200ms 后预加载，避免快速划过时触发
  const timer = setTimeout(() => {
    const routeRecord = router.getRoutes().find((r) => r.path === path)
    if (routeRecord?.components?.default) {
      const comp = routeRecord.components.default
      // 已访问过的路由 components.default 会被 Vue Router 替换为组件对象，
      // 只有懒加载函数才需要调用预取
      if (typeof comp === 'function') {
        // Only the lazy loader is callable; a resolved component object is not.
        void (comp as () => Promise<unknown>)()
      }
    }
    prefetchTimers.delete(path)
  }, 200)
  prefetchTimers.set(path, timer)
}

function onNavLeave(path: string) {
  const timer = prefetchTimers.get(path)
  if (timer) {
    clearTimeout(timer)
    prefetchTimers.delete(path)
  }
}
</script>

<template>
  <aside class="sidebar" :class="{ collapsed, 'mobile-open': props.mobileOpen }">
    <div class="sidebar-header">
      <div class="logo" @click="navigate('/')">
        <span class="logo-icon">R</span>
        <span v-show="!collapsed" class="logo-text">{{ t('common.appName') }}</span>
      </div>
    </div>

    <nav class="sidebar-nav">
      <button
        v-for="item in navItems"
        :key="item.path"
        class="nav-item"
        :class="{ active: isActive(item.path) }"
        v-tooltip="collapsed ? t(item.labelKey) : ''"
        @click="navigate(item.path)"
        @mouseenter="onNavHover(item.path)"
        @mouseleave="onNavLeave(item.path)"
      >
        <el-icon class="nav-icon"><component :is="item.icon" /></el-icon>
        <span v-show="!collapsed" class="nav-label">{{ t(item.labelKey) }}</span>
        <span v-if="isActive(item.path)" class="active-indicator" />
      </button>
    </nav>

    <div class="sidebar-footer">
      <button
        class="collapse-btn"
        v-tooltip="collapsed ? t('common.expand') : t('common.collapse')"
        @click="$emit('toggle')"
      >
        <el-icon>
          <component :is="collapsed ? 'DArrowRight' : 'DArrowLeft'" />
        </el-icon>
      </button>
    </div>
  </aside>
</template>

<style scoped lang="scss">
@use '../../styles/components/layout/app-sidebar.scss' as *;
</style>
