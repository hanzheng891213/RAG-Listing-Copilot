<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { setLocale } from '@/locales'
import { useAuthStore } from '@/stores/authStore'

defineEmits<{ toggleSidebar: [] }>()

const { t, locale } = useI18n()
const route = useRoute()
const isDark = ref(true)
const auth = useAuthStore()

watch(isDark, (val) => {
  document.documentElement.classList.toggle('light', !val)
}, { immediate: true })

function toggleLang() {
  setLocale(locale.value === 'zh' ? 'en' : 'zh')
}

function handleClearKey() {
  auth.clearKey()
  ElMessage.success(t('auth.cleared'))
}

</script>

<template>
  <header class="app-header">
    <div class="header-left">
      <button class="menu-btn" @click="$emit('toggleSidebar')">
        <el-icon><Expand /></el-icon>
      </button>
      <div class="breadcrumb">
        <span class="breadcrumb-current">
          {{ t((route.meta.titleKey as string) || 'nav.home') }}
        </span>
      </div>
    </div>

    <div class="header-right">
      <button
        class="lang-toggle"
        :title="locale === 'zh' ? 'Switch to English' : '切换到中文'"
        @click="toggleLang"
      >
        {{ locale === 'zh' ? 'EN' : '中文' }}
      </button>

      <button
        class="theme-toggle"
        :title="isDark ? t('theme.switchLight') : t('theme.switchDark')"
        @click="isDark = !isDark"
      >
        <el-icon>
          <component :is="isDark ? 'Sunny' : 'Moon'" />
        </el-icon>
      </button>

      <el-dropdown trigger="click">
        <button
          class="api-key-indicator"
          :class="{ configured: auth.isConfigured }"
          :title="auth.isConfigured ? t('auth.configured') : t('auth.notConfigured')"
        >
          <el-icon><Key /></el-icon>
          <span class="api-dot" :class="{ active: auth.isConfigured }" />
        </button>
        <template #dropdown>
          <el-dropdown-menu>
            <template v-if="auth.isConfigured">
              <el-dropdown-item disabled>
                <span class="key-display">{{ auth.maskedKey }}</span>
              </el-dropdown-item>
              <el-dropdown-item divided @click="auth.showModal = true">
                <el-icon><Edit /></el-icon>
                {{ t('auth.manage') }}
              </el-dropdown-item>
              <el-dropdown-item @click="handleClearKey">
                <el-icon><Delete /></el-icon>
                {{ t('auth.clear') }}
              </el-dropdown-item>
            </template>
            <template v-else>
              <el-dropdown-item disabled>
                {{ t('auth.notConfigured') }}
              </el-dropdown-item>
              <el-dropdown-item divided @click="auth.showModal = true">
                <el-icon><Key /></el-icon>
                {{ t('auth.confirm') }}
              </el-dropdown-item>
            </template>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>
  </header>
</template>

<style scoped>
.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  height: 56px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
  position: sticky;
  top: 0;
  z-index: 50;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.menu-btn {
  display: none;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all var(--transition-fast);
  font-size: 18px;
}

.menu-btn:hover {
  background: var(--bg-card);
  color: var(--text-primary);
}

.breadcrumb-current {
  font-family: var(--font-display-serif);
  font-size: 18px;
  color: var(--text-primary);
}

.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.lang-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 40px;
  height: 32px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--accent);
  cursor: pointer;
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.5px;
  transition: all var(--transition-fast);
  padding: 0 10px;
}

.lang-toggle:hover {
  border-color: var(--accent);
  box-shadow: 0 0 10px var(--accent-glow);
  background: var(--accent-glow);
}

.theme-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all var(--transition-fast);
  font-size: 18px;
}

.theme-toggle:hover {
  border-color: var(--accent);
  color: var(--accent);
  box-shadow: 0 0 12px var(--accent-glow);
}

.api-key-indicator {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  transition: all var(--transition-fast);
  font-size: 16px;
}

.api-key-indicator:hover {
  border-color: var(--accent-dim);
  color: var(--text-primary);
}

.api-key-indicator.configured {
  color: var(--accent);
  border-color: var(--accent-dim);
}

.api-dot {
  position: absolute;
  top: -3px;
  right: -3px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--text-muted);
  border: 2px solid var(--bg-secondary);
  transition: background var(--transition-fast);
}

.api-dot.active {
  background: var(--accent);
  box-shadow: 0 0 6px var(--accent-glow-strong);
}

.key-display {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-muted);
}

@media (max-width: 768px) {
  .app-header {
    padding: 0 16px;
  }

  .menu-btn {
    display: flex;
  }
}
</style>
