<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/authStore'
import { ElMessage } from 'element-plus'
import errors from '@/locales/errors'

const { t, locale } = useI18n()
const auth = useAuthStore()

const isRegisterMode = ref(false)
const username = ref('')
const password = ref('')
const confirmPassword = ref('')
const showPassword = ref(false)

const PASSWORD_MIN = 10

watch(() => auth.showLoginModal, (val) => {
  if (val) {
    username.value = ''
    password.value = ''
    confirmPassword.value = ''
    isRegisterMode.value = false
  }
})

/** Localised API error: the server sends a code, the client owns the wording. */
function errorMessage(error: any, fallbackKey: string): string {
  const code = error?.response?.data?.code
  const table = (errors as Record<string, Record<string, string>>)[locale.value]
  return (
    (code && (table?.[code] || errors.en?.[code])) ||
    error?.response?.data?.error ||
    t(fallbackKey)
  )
}

async function handleLogin() {
  if (!username.value.trim() || !password.value) {
    ElMessage.warning(t('user.fillAllFields'))
    return
  }
  try {
    await auth.login(username.value.trim(), password.value)
    ElMessage.success(t('user.loginSuccess'))
  } catch (e: any) {
    ElMessage.error(errorMessage(e, 'user.loginFailed'))
  }
}

async function handleRegister() {
  if (!username.value.trim() || !password.value || !confirmPassword.value) {
    ElMessage.warning(t('user.fillAllFields'))
    return
  }
  if (password.value !== confirmPassword.value) {
    ElMessage.warning(t('user.passwordMismatch'))
    return
  }
  // Mirror of the server rule for instant feedback; the server re-checks it.
  if (password.value.length < PASSWORD_MIN || !/[A-Za-z]/.test(password.value) || !/[0-9]/.test(password.value)) {
    ElMessage.warning(t('user.passwordRule'))
    return
  }

  try {
    await auth.register(username.value.trim(), password.value)
    ElMessage.success(t('user.registerSuccess'))
    ElMessage.info(t('user.registerPending'))
  } catch (e: any) {
    ElMessage.warning(errorMessage(e, 'user.registerFailed'))
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
          <p v-if="isRegisterMode" class="field-hint">{{ t('user.usernameRule') }}</p>
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
          <p v-if="isRegisterMode" class="field-hint">{{ t('user.passwordRule') }}</p>
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

<style scoped lang="scss">
@use '../../styles/components/auth/login-modal.scss' as *;

.field-hint {
  margin: 6px 0 0;
  font-size: 11px;
  line-height: 1.5;
  color: var(--text-muted);
}
</style>
