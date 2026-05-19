import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('@/views/HomePage.vue'),
      meta: { title: '仪表盘' }
    },
    {
      path: '/products',
      name: 'products',
      component: () => import('@/views/product/ProductListPage.vue'),
      meta: { title: '商品库' }
    },
    {
      path: '/products/:id/mapping',
      name: 'product-mapping',
      component: () => import('@/views/product/DocumentMappingPage.vue'),
      meta: { title: '文档映射' }
    },
    {
      path: '/localization',
      name: 'localization',
      component: () => import('@/views/localization/LocalizationPage.vue'),
      meta: { title: '德语本土化' }
    },
    {
      path: '/localization/style-guide',
      name: 'style-guide',
      component: () => import('@/views/localization/StyleGuidePage.vue'),
      meta: { title: '风格指南' }
    },
    {
      path: '/compliance',
      name: 'compliance',
      component: () => import('@/views/compliance/CompliancePage.vue'),
      meta: { title: '合规检查' }
    },
    {
      path: '/compliance/rules',
      name: 'rules',
      component: () => import('@/views/compliance/RuleExplorerPage.vue'),
      meta: { title: '政策浏览器' }
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('@/views/SettingsPage.vue'),
      meta: { title: '系统设置' }
    }
  ]
})

export default router
