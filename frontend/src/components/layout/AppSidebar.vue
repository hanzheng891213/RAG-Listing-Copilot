<script setup lang="ts">
import { useRouter, useRoute } from 'vue-router'
import { computed } from 'vue'
import {
  DashboardOutlined,
  InboxOutlined,
  TranslationOutlined,
  SafetyOutlined,
  SettingOutlined,

} from '@ant-design/icons-vue'

const router = useRouter()
const route = useRoute()

interface NavItem {
  key: string
  path: string
  icon: any
  label: string
  children?: { key: string; path: string; label: string }[]
}

const navItems: NavItem[] = [
  { key: 'home', path: '/', icon: DashboardOutlined, label: '仪表盘' },
  {
    key: 'product',
    path: '/products',
    icon: InboxOutlined,
    label: '商品库',
    children: [
      { key: 'products', path: '/products', label: '商品列表' },
      { key: 'product-mapping', path: '/products/1/mapping', label: '文档映射' }
    ]
  },
  {
    key: 'localization',
    path: '/localization',
    icon: TranslationOutlined,
    label: '德语本土化',
    children: [
      { key: 'localization', path: '/localization', label: '本土化生成' },
      { key: 'style-guide', path: '/localization/style-guide', label: '风格指南' }
    ]
  },
  {
    key: 'compliance',
    path: '/compliance',
    icon: SafetyOutlined,
    label: '合规检查',
    children: [
      { key: 'compliance', path: '/compliance', label: '合规扫描' },
      { key: 'rules', path: '/compliance/rules', label: '政策浏览器' }
    ]
  },
  { key: 'settings', path: '/settings', icon: SettingOutlined, label: '系统设置' }
]

const activeKey = computed(() => {
  if (route.path.startsWith('/products')) return 'product'
  if (route.path.startsWith('/localization')) return 'localization'
  if (route.path.startsWith('/compliance')) return 'compliance'
  if (route.path === '/settings') return 'settings'
  return 'home'
})

const activeChildKey = computed(() => route.name as string)

function navigate(path: string) {
  router.push(path)
}
</script>

<template>
  <nav class="sidebar">
    <!-- Brand -->
    <div class="brand">
      <div class="brand-icon">K</div>
      <span class="brand-text">Kaufland Sync</span>
    </div>

    <!-- Nav Items -->
    <ul class="nav-list">
      <template v-for="item in navItems" :key="item.key">
        <!-- Parent item -->
        <li
          :class="['nav-item', { active: activeKey === item.key }]"
          @click="navigate(item.path)"
        >
          <div class="nav-link">
            <span class="nav-icon">
              <component :is="item.icon" />
            </span>
            <span class="nav-label">{{ item.label }}</span>
          </div>
        </li>

        <!-- Children -->
        <li
          v-for="child in item.children"
          :key="child.key"
          :class="['nav-item nav-child', { 'child-active': activeChildKey === child.key }]"
          @click.stop="navigate(child.path)"
        >
          <div class="nav-link">
            <span class="nav-dot" />
            <span class="nav-label">{{ child.label }}</span>
          </div>
        </li>
      </template>
    </ul>

    <!-- Footer -->
    <div class="sidebar-footer">
      <div class="status-dot" />
      <span class="status-text">系统运行中</span>
    </div>
  </nav>
</template>

<style scoped>
.sidebar {
  position: fixed;
  top: 0;
  left: 0;
  width: var(--sidebar-collapsed);
  height: 100vh;
  background: var(--bg-sidebar);
  border-right: 1px solid var(--border-default);
  z-index: 100;
  transition:
    width var(--duration-slow) var(--ease-out);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  padding: 0 12px;
}

.sidebar:hover {
  width: var(--sidebar-expanded);
}

/* ── Brand ── */
.brand {
  display: flex;
  align-items: center;
  gap: 12px;
  height: var(--header-height);
  padding: 0 8px;
  flex-shrink: 0;
}

.brand-icon {
  width: 36px;
  height: 36px;
  border-radius: var(--radius-md);
  background: var(--accent);
  color: var(--emphasis);
  font-family: var(--font-sans);
  font-weight: var(--fw-bold);
  font-size: var(--fs-lg);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  letter-spacing: -0.02em;
}

.brand-text {
  font-size: var(--fs-md);
  font-weight: var(--fw-semibold);
  color: var(--emphasis);
  white-space: nowrap;
  opacity: 0;
  transition: opacity var(--duration-normal) var(--ease-out);
  transition-delay: 0.05s;
  letter-spacing: -0.01em;
}

.sidebar:hover .brand-text {
  opacity: 1;
}

/* ── Nav List ── */
.nav-list {
  list-style: none;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 0;
  overflow-y: auto;
  overflow-x: hidden;
}

.nav-item {
  position: relative;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition:
    background var(--duration-fast) var(--ease-in-out);
}

.nav-item:hover {
  background: var(--emphasis-dim);
}

.nav-item.active {
  background: var(--accent-dim);
  border-radius: var(--radius-md);
}

/* Active curve — box-shadow must match sidebar bg to create concave cutout illusion */
.nav-item.active::before {
  content: '';
  position: absolute;
  top: -24px;
  right: 0;
  width: 24px;
  height: 24px;
  border-bottom-right-radius: 12px;
  box-shadow: 6px 6px 0 6px var(--bg-sidebar);
  background: transparent;
  pointer-events: none;
}

.nav-item.active::after {
  content: '';
  position: absolute;
  bottom: -24px;
  right: 0;
  width: 24px;
  height: 24px;
  border-top-right-radius: 12px;
  box-shadow: 6px -6px 0 6px var(--bg-sidebar);
  background: transparent;
  pointer-events: none;
}

.nav-link {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 8px;
  min-height: 44px;
  white-space: nowrap;
}

.nav-icon {
  position: relative;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-size: 18px;
  color: var(--text-secondary);
  transition: color var(--duration-fast);
}

.nav-item.active .nav-icon {
  color: var(--emphasis);
}

.nav-item.active .nav-icon::before {
  content: '';
  position: absolute;
  inset: 2px;
  width: 20px;
  height: 20px;
  background: var(--accent);
  border-radius: 50%;
  border: 2px solid var(--accent-bright);
  box-sizing: border-box;
}

.nav-label {
  font-size: var(--fs-sm);
  font-weight: var(--fw-medium);
  color: var(--text-secondary);
  opacity: 0;
  transition:
    opacity var(--duration-normal) var(--ease-out),
    color var(--duration-fast);
}

.sidebar:hover .nav-label {
  opacity: 1;
}

.nav-item.active .nav-label {
  color: var(--emphasis);
  font-weight: var(--fw-semibold);
}

.nav-item:hover .nav-label {
  color: var(--text-primary);
}

/* ── Child Items ── */
.nav-child {
  padding-left: 20px;
}

.nav-child .nav-link {
  padding: 6px 8px;
  min-height: 32px;
}

.nav-child .nav-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--text-tertiary);
  flex-shrink: 0;
  transition: background var(--duration-fast);
}

.nav-child.child-active .nav-dot {
  background: var(--accent-bright);
  box-shadow: 0 0 6px var(--accent-glow);
}

.nav-child.child-active .nav-label {
  color: var(--emphasis);
  font-weight: var(--fw-medium);
}

/* ── Footer ── */
.sidebar-footer {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px 8px;
  border-top: 1px solid var(--border-light);
  flex-shrink: 0;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--status-green);
  flex-shrink: 0;
  box-shadow: 0 0 8px var(--status-green-glow);
}

.status-text {
  font-size: var(--fs-xs);
  color: var(--text-tertiary);
  white-space: nowrap;
  opacity: 0;
  transition: opacity var(--duration-normal) var(--ease-out);
}

.sidebar:hover .status-text {
  opacity: 1;
}
</style>
