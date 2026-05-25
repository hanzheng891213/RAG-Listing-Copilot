import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'

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
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

export default router
