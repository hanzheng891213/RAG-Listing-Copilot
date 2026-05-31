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
    meta: { titleKey: 'nav.supplierUpload', icon: 'Upload' },
  },
  {
    path: '/listing-generator',
    name: 'ListingGenerator',
    component: () => import('@/views/ListingGenerator.vue'),
    meta: { titleKey: 'nav.listingGenerator', icon: 'MagicStick' },
  },
  {
    path: '/knowledge-base',
    name: 'KnowledgeBase',
    component: () => import('@/views/KnowledgeBase.vue'),
    meta: { titleKey: 'nav.knowledgeBase', icon: 'Collection' },
  },
  {
    path: '/admin',
    name: 'AdminSettings',
    component: () => import('@/views/AdminSettings.vue'),
    meta: { titleKey: 'nav.adminSettings', icon: 'Setting', requiresAuth: true, requiresAdmin: true },
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach((to, _from, next) => {
  if (to.meta.requiresAuth) {
    const auth = useAuthStore()
    if (!auth.isLoggedIn) {
      auth.openLoginModal()
      next('/')
      return
    }
    if (to.meta.requiresAdmin && !auth.isAdmin) {
      next('/')
      return
    }
  }
  next()
})

export default router
