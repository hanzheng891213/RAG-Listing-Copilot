<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/authStore'
import { ElMessage } from 'element-plus'

const { t } = useI18n()
const auth = useAuthStore()

const isRegisterMode = ref(false)
const username = ref('')
const password = ref('')
const confirmPassword = ref('')
const showPassword = ref(false)

watch(() => auth.showLoginModal, (val) => {
  if (val) {
    username.value = ''
    password.value = ''
    confirmPassword.value = ''
    isRegisterMode.value = false
  }
})

async function handleLogin() {
  if (!username.value.trim() || !password.value) {
    ElMessage.warning(t('user.fillAllFields'))
    return
  }
  try {
    await auth.login(username.value.trim(), password.value)
    ElMessage.success(t('user.loginSuccess'))
  } catch (e: any) {
    const msg = e.response?.data?.error || t('user.loginFailed')
    ElMessage.error(msg)
  }
}

function handleRegister() {
  if (!username.value.trim() || !password.value || !confirmPassword.value) {
    ElMessage.warning(t('user.fillAllFields'))
    return
  }
  if (password.value !== confirmPassword.value) {
    ElMessage.warning(t('user.passwordMismatch'))
    return
  }
  const success = auth.register(username.value.trim(), password.value)
  if (success) {
    ElMessage.success(t('user.registerSuccess'))
  } else {
    ElMessage.warning(t('user.usernameExists'))
  }
}

function toggleMode() {
  isRegisterMode.value = !isRegisterMode.value
  username.value = ''
  password.value = ''
  confirmPassword.value = ''
}
</script>

<template>
  <el-dialog
    :model-value="auth.showLoginModal"
    :title="isRegisterMode ? t('user.register') : t('user.login')"
    width="400px"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    class="login-dialog"
    @close="auth.closeLoginModal"
  >
    <div class="login-content">
      <div class="login-icon">
        <el-icon :size="36"><UserFilled /></el-icon>
      </div>

      <div class="form-section">
        <div class="input-group">
          <label>{{ t('user.username') }}</label>
          <el-input
            v-model="username"
            :placeholder="t('user.usernamePlaceholder')"
            size="large"
            @keyup.enter="isRegisterMode ? handleRegister() : handleLogin()"
          >
            <template #prefix>
              <el-icon><User /></el-icon>
            </template>
          </el-input>
        </div>

        <div class="input-group">
          <label>{{ t('user.password') }}</label>
          <el-input
            v-model="password"
            :type="showPassword ? 'text' : 'password'"
            :placeholder="t('user.passwordPlaceholder')"
            size="large"
            @keyup.enter="isRegisterMode ? handleRegister() : handleLogin()"
          >
            <template #prefix>
              <el-icon><Lock /></el-icon>
            </template>
            <template #suffix>
              <el-button text @click="showPassword = !showPassword">
                <el-icon><component :is="showPassword ? 'View' : 'Hide'" /></el-icon>
              </el-button>
            </template>
          </el-input>
        </div>

        <div v-if="isRegisterMode" class="input-group">
          <label>{{ t('user.confirmPassword') }}</label>
          <el-input
            v-model="confirmPassword"
            :type="showPassword ? 'text' : 'password'"
            :placeholder="t('user.confirmPasswordPlaceholder')"
            size="large"
            @keyup.enter="handleRegister()"
          >
            <template #prefix>
              <el-icon><Lock /></el-icon>
            </template>
          </el-input>
        </div>
      </div>

      <button class="toggle-mode" @click="toggleMode">
        {{ isRegisterMode ? t('user.switchToLogin') : t('user.switchToRegister') }}
      </button>
    </div>

    <template #footer>
      <el-button @click="auth.closeLoginModal">{{ t('common.cancel') }}</el-button>
      <el-button
        v-if="isRegisterMode"
        type="primary"
        :loading="auth.authLoading"
        @click="handleRegister"
      >
        {{ t('user.register') }}
      </el-button>
      <el-button
        v-else
        type="primary"
        :loading="auth.authLoading"
        @click="handleLogin"
      >
        {{ t('user.login') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.login-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  padding: 8px 0;
}

.login-icon {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: var(--accent-glow);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--accent);
}

.form-section {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.input-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.input-group label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
}

.toggle-mode {
  background: none;
  border: none;
  color: var(--accent);
  font-size: 13px;
  cursor: pointer;
  padding: 4px 8px;
  transition: opacity var(--transition-fast);
}

.toggle-mode:hover {
  opacity: 0.8;
  text-decoration: underline;
}

@media (max-width: 768px) {
  .login-content { gap: 20px; }
  .login-icon { width: 52px; height: 52px; }
}
</style>
