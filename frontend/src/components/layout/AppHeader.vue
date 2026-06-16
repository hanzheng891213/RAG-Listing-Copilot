<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { setLocale, LANGUAGES } from '@/locales'
import { useAuthStore } from '@/stores/authStore'
import { useKnowledgeStore } from '@/stores/knowledgeStore'

defineEmits<{ toggleSidebar: [] }>()

const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()
const isDark = ref(true)
const auth = useAuthStore()
const knowledge = useKnowledgeStore()

watch(isDark, (val) => {
  document.documentElement.classList.toggle('light', !val)
}, { immediate: true })

function toggleLang(lang: string) {
  setLocale(lang)
  knowledge.refreshLocale()
}

function handleLogout() {
  auth.logout()
  ElMessage.success(t('user.logoutSuccess'))
  router.push('/')
}

function goModelManager() {
  router.push('/model-manager')
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
      <el-dropdown trigger="click" @command="toggleLang">
        <button class="lang-toggle" :title="LANGUAGES.find(l => l.code === locale)?.label">
          {{ LANGUAGES.find(l => l.code === locale)?.native || locale }}
        </button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item
              v-for="lang in LANGUAGES"
              :key="lang.code"
              :command="lang.code"
              :class="{ 'is-active': locale === lang.code }"
            >
              {{ lang.native }} <span style="color: var(--text-muted); font-size: 11px;">{{ lang.label }}</span>
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>

      <button
        class="theme-toggle"
        :title="isDark ? t('theme.switchLight') : t('theme.switchDark')"
        @click="isDark = !isDark"
      >
        <el-icon>
          <component :is="isDark ? 'Sunny' : 'Moon'" />
        </el-icon>
      </button>

      <!-- User / Login area -->
      <template v-if="auth.isLoggedIn">
        <el-dropdown trigger="click">
          <button class="avatar-btn" :class="{ admin: auth.isAdmin }">
            <el-icon :size="20"><UserFilled /></el-icon>
          </button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item disabled>
                <div class="user-info">
                  <span class="user-name">{{ auth.user?.username }}</span>
                  <span class="user-role" :class="auth.user?.role">
                    {{ auth.isAdmin ? t('user.adminRole') : t('user.userRole') }}
                  </span>
                </div>
              </el-dropdown-item>
              <el-dropdown-item v-if="auth.isAdmin" @click="goModelManager">
                <el-icon><Cpu /></el-icon>
                {{ t('nav.modelManager') }}
              </el-dropdown-item>
              <el-dropdown-item divided @click="handleLogout">
                <el-icon><SwitchButton /></el-icon>
                {{ t('user.logout') }}
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </template>
      <template v-else>
        <button
          class="avatar-btn register-btn"
          :title="t('user.register')"
          @click="auth.openLoginModal"
        >
          <el-icon :size="18"><UserPlus /></el-icon>
          <span class="register-text">{{ t('user.register') }}</span>
        </button>
        <button
          class="avatar-btn"
          :title="t('user.login')"
          @click="auth.openLoginModal"
        >
          <el-icon :size="20"><UserFilled /></el-icon>
        </button>
      </template>
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

/* Avatar / User button */
.avatar-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: 1px solid var(--border-color);
  border-radius: 50%;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.avatar-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
  box-shadow: 0 0 10px var(--accent-glow);
}

.avatar-btn.admin {
  border-color: var(--accent);
  color: var(--accent);
}

.avatar-btn.register-btn {
  width: auto;
  border-radius: var(--radius-md);
  padding: 0 12px;
  gap: 6px;
  font-family: var(--font-body);
  font-size: 13px;
  font-weight: 500;
}

.register-text {
  white-space: nowrap;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 140px;
}

.user-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.user-role {
  font-size: 11px;
  padding: 1px 8px;
  border-radius: 10px;
  font-weight: 500;
}

.user-role.admin {
  background: var(--accent-glow);
  color: var(--accent);
}

.user-role.user {
  background: var(--bg-secondary);
  color: var(--text-secondary);
}

.usage-text {
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
