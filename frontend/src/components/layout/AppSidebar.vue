<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'

const props = defineProps<{ collapsed: boolean; mobileOpen: boolean }>()
const emit = defineEmits<{ toggle: []; nav: [] }>()

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

const navItems = [
  { path: '/', labelKey: 'nav.home', icon: 'HomeFilled' },
  { path: '/supplier-upload', labelKey: 'nav.supplierUpload', icon: 'Upload' },
  { path: '/listing-generator', labelKey: 'nav.listingGenerator', icon: 'MagicStick' },
  { path: '/knowledge-base', labelKey: 'nav.knowledgeBase', icon: 'Collection' },
  { path: '/model-manager', labelKey: 'nav.modelManager', icon: 'Cpu' },
]

function isActive(path: string) {
  if (path === '/') return route.path === '/'
  return route.path.startsWith(path)
}

function navigate(path: string) {
  router.push(path)
  emit('nav')
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
        :title="collapsed ? t(item.labelKey) : ''"
        @click="navigate(item.path)"
      >
        <el-icon class="nav-icon"><component :is="item.icon" /></el-icon>
        <span v-show="!collapsed" class="nav-label">{{ t(item.labelKey) }}</span>
        <span v-if="isActive(item.path)" class="active-indicator" />
      </button>
    </nav>

    <div class="sidebar-footer">
      <button
        class="collapse-btn"
        :title="collapsed ? t('common.expand') : t('common.collapse')"
        @click="$emit('toggle')"
      >
        <el-icon>
          <component :is="collapsed ? 'DArrowRight' : 'DArrowLeft'" />
        </el-icon>
      </button>
    </div>
  </aside>
</template>

<style scoped>
.sidebar {
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  width: 220px;
  background: var(--bg-secondary);
  border-right: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  z-index: 100;
  transition: width var(--transition-base);
  overflow: hidden;
}

.sidebar.collapsed {
  width: 64px;
}

.sidebar-header {
  padding: 20px 16px;
  border-bottom: 1px solid var(--border-color);
}

.logo {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
}

.logo-icon {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
  background: var(--accent);
  color: var(--bg-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-display-serif);
  font-size: 18px;
  font-weight: 700;
  flex-shrink: 0;
}

.logo-text {
  font-family: var(--font-display-serif);
  font-size: 18px;
  color: var(--text-primary);
}

.sidebar-nav {
  flex: 1;
  padding: 12px 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.nav-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--text-secondary);
  font-family: var(--font-body);
  font-size: 14px;
  font-weight: 400;
  cursor: pointer;
  transition: all var(--transition-fast);
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
}

.nav-item::after {
  content: '';
  position: absolute;
  inset: 0;
  background: var(--accent);
  border-radius: var(--radius-md);
  transform: translateX(-100%);
  transition: transform var(--transition-base);
  z-index: -1;
  opacity: 0.12;
}

.nav-item:hover::after {
  transform: translateX(0);
}

.nav-item:hover {
  color: var(--text-primary);
}

.nav-item.active {
  color: var(--accent);
  background: var(--accent-glow);
}

.active-indicator {
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 20px;
  border-radius: 0 3px 3px 0;
  background: var(--accent);
  box-shadow: 0 0 8px var(--accent-glow-strong);
}

.nav-icon {
  font-size: 20px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
}

.nav-label {
  font-size: 14px;
}

.sidebar-footer {
  padding: 12px 8px;
  border-top: 1px solid var(--border-color);
}

.collapse-btn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 10px;
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  transition: all var(--transition-fast);
  font-size: 16px;
}

.collapse-btn:hover {
  background: var(--bg-card);
  color: var(--text-primary);
}

@media (max-width: 768px) {
  .sidebar {
    transform: translateX(-100%);
    width: 220px;
    box-shadow: none;
    transition: transform var(--transition-base);
  }

  .sidebar.mobile-open {
    transform: translateX(0);
    box-shadow: 8px 0 40px rgba(0, 0, 0, 0.4);
  }
}
</style>
