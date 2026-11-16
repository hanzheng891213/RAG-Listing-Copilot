import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useAuthStore } from '@/stores/authStore'
import { usePermissionStore, type PermissionKey } from '@/stores/permissionStore'
import i18n from '@/locales'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'Home',
    component: () => import('@/views/HomePage.vue'),
    meta: { titleKey: 'nav.home', icon: 'HomeFilled' },
  },
  {
    path: '/supplier-upload',
    // Uploading is now part of the 上架表: old links land on the table, where
    // the import button and the drop target live.
    redirect: '/product-grid',
  },
  {
    path: '/listing-generator',
    name: 'ListingGenerator',
    component: () => import('@/views/ListingGenerator.vue'),
    meta: {
      titleKey: 'nav.listingGenerator',
      icon: 'MagicStick',
      requiresAuth: true,
      permission: 'listingGenerator',
    },
  },
  {
    path: '/product-grid',
    name: 'ProductGrid',
    component: () => import('@/views/ProductGrid.vue'),
    meta: {
      titleKey: 'nav.productGrid',
      icon: 'Grid',
      requiresAuth: true,
      permission: 'productGrid',
    },
  },
  {
    path: '/knowledge-base',
    name: 'KnowledgeBase',
    component: () => import('@/views/KnowledgeBase.vue'),
    meta: {
      titleKey: 'nav.knowledgeBase',
      icon: 'Collection',
      requiresAuth: true,
      permission: 'knowledgeBase',
    },
  },
  {
    path: '/model-manager',
    name: 'ModelManager',
    component: () => import('@/views/ModelManager.vue'),
    meta: {
      titleKey: 'nav.modelManager',
      icon: 'Cpu',
      requiresAuth: true,
      permission: 'modelManager',
    },
  },
  {
    path: '/finance',
    name: 'FinanceDashboard',
    component: () => import('@/views/FinanceDashboard.vue'),
    meta: {
      titleKey: 'nav.finance',
      icon: 'TrendCharts',
      requiresAuth: true,
      permission: 'finance',
    },
  },
  {
    path: '/permission-settings',
    name: 'PermissionSettings',
    component: () => import('@/views/PermissionSettings.vue'),
    meta: { titleKey: 'nav.permissionSettings', icon: 'Lock', requiresAdmin: true },
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

// ── Route-level RBAC guard ─────────────────────────────────────────────
// requiresAuth routes need a logged-in user; requiresAdmin additionally
// restricts to the admin role. Unauthorized visits fall back to home and
// open the login modal.
router.beforeEach(async (to) => {
  const auth = useAuthStore()
  const requiresAuth = to.meta.requiresAuth || to.meta.requiresAdmin

  if (requiresAuth) {
    // On a fresh load the user profile may not be fetched yet — wait for it
    // before deciding, so a valid session isn't rejected mid-flight.
    if (auth.token && !auth.user) {
      await auth.refreshUser()
    }
    if (!auth.isLoggedIn) {
      auth.openLoginModal()
      return { path: '/', replace: true }
    }
    if (to.meta.requiresAdmin && !auth.isAdmin) {
      return { path: '/', replace: true }
    }

    // Page permissions are a second gate below the auth check: an account can
    // be signed in and still not own this page's group permission.
    const permission = to.meta.permission as PermissionKey | undefined
    if (permission && !usePermissionStore().can(permission)) {
      ElMessage.warning(i18n.global.t('permissions.noAccess'))
      return { path: '/', replace: true }
    }
  }
  return true
})

export default router
