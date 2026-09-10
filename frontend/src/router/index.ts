import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { useAuthStore } from '@/stores/authStore'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'Home',
    component: () => import('@/views/HomePage.vue'),
    meta: { titleKey: 'nav.home', icon: 'HomeFilled' },
  },
  {
    path: '/supplier-upload',
    name: 'SupplierUpload',
    component: () => import('@/views/SupplierUpload.vue'),
    meta: { titleKey: 'nav.supplierUpload', icon: 'Upload', requiresAuth: true },
  },
  {
    path: '/listing-generator',
    name: 'ListingGenerator',
    component: () => import('@/views/ListingGenerator.vue'),
    meta: { titleKey: 'nav.listingGenerator', icon: 'MagicStick', requiresAuth: true },
  },
  {
    path: '/knowledge-base',
    name: 'KnowledgeBase',
    component: () => import('@/views/KnowledgeBase.vue'),
    meta: { titleKey: 'nav.knowledgeBase', icon: 'Collection', requiresAuth: true },
  },
  {
    path: '/model-manager',
    name: 'ModelManager',
    component: () => import('@/views/ModelManager.vue'),
    meta: { titleKey: 'nav.modelManager', icon: 'Cpu', requiresAdmin: true },
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
  }
  return true
})

export default router
