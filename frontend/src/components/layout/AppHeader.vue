<script setup lang="ts">
import { watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { setLocale, LANGUAGES } from '@/locales'
import { useAuthStore } from '@/stores/authStore'
import { usePermissionStore } from '@/stores/permissionStore'
import { useKnowledgeStore } from '@/stores/knowledgeStore'
import { useUiStore } from '@/stores/uiStore'

defineEmits<{ toggleSidebar: [] }>()

const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const permission = usePermissionStore()
const knowledge = useKnowledgeStore()
const ui = useUiStore()

watch(() => ui.isDark, (val) => {
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
        <button class="lang-toggle" v-tooltip="LANGUAGES.find(l => l.code === locale)?.label">
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
        v-tooltip="ui.isDark ? t('theme.switchLight') : t('theme.switchDark')"
        @click="ui.isDark = !ui.isDark"
      >
        <el-icon>
          <component :is="ui.isDark ? 'Sunny' : 'Moon'" />
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
              <el-dropdown-item v-if="permission.can('modelManager')" @click="goModelManager">
                <el-icon><Cpu /></el-icon>
                {{ t('nav.modelManager') }}
              </el-dropdown-item>
              <el-dropdown-item v-if="auth.isAdmin" @click="router.push('/permission-settings')">
                <el-icon><Lock /></el-icon>
                {{ t('nav.permissionSettings') }}
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
          v-tooltip="t('user.register')"
          @click="auth.openLoginModal"
        >
          <el-icon :size="18"><Plus /></el-icon>
          <span class="register-text">{{ t('user.register') }}</span>
        </button>
        <button
          class="avatar-btn"
          v-tooltip="t('user.login')"
          @click="auth.openLoginModal"
        >
          <el-icon :size="20"><UserFilled /></el-icon>
        </button>
      </template>
    </div>
  </header>
</template>

<style scoped lang="scss">
@use '../../styles/components/layout/app-header.scss' as *;
</style>
