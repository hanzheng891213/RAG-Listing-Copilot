<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/authStore'

const { t } = useI18n()
const auth = useAuthStore()
const keyInput = ref('')
const showKey = ref(false)

function submit() {
  const trimmed = keyInput.value.trim()
  if (trimmed) {
    auth.onKeySubmitted(trimmed)
  }
}

function skip() {
  auth.cancelApiKey()
}
</script>

<template>
  <el-dialog
    :model-value="auth.showApiKeyModal"
    :title="t('auth.title')"
    width="480px"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    class="auth-dialog"
    @close="skip"
  >
    <div class="auth-content">
      <div class="auth-icon">
        <el-icon :size="40"><Key /></el-icon>
      </div>

      <p class="auth-desc">{{ t('auth.description') }}</p>

      <div class="auth-benefits">
        <div class="benefit-item">
          <el-icon><CircleCheck /></el-icon>
          <span>{{ t('auth.benefit1') }}</span>
        </div>
        <div class="benefit-item">
          <el-icon><CircleCheck /></el-icon>
          <span>{{ t('auth.benefit2') }}</span>
        </div>
        <div class="benefit-item">
          <el-icon><CircleCheck /></el-icon>
          <span>{{ t('auth.benefit3') }}</span>
        </div>
      </div>

      <div class="key-input-section">
        <label>{{ t('auth.keyLabel') }}</label>
        <el-input
          v-model="keyInput"
          :type="showKey ? 'text' : 'password'"
          :placeholder="t('auth.keyPlaceholder')"
          size="large"
          @keyup.enter="submit"
        >
          <template #prefix>
            <el-icon><Lock /></el-icon>
          </template>
          <template #suffix>
            <el-button text @click="showKey = !showKey">
              <el-icon><component :is="showKey ? 'View' : 'Hide'" /></el-icon>
            </el-button>
          </template>
        </el-input>
      </div>

      <p class="auth-hint">{{ t('auth.hint') }}</p>
    </div>

    <template #footer>
      <el-button @click="skip">{{ t('auth.skip') }}</el-button>
      <el-button type="primary" :disabled="!keyInput.trim()" @click="submit">
        {{ t('auth.confirm') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.auth-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  padding: 8px 0;
}

.auth-icon {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: var(--accent-glow);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--accent);
}

.auth-desc {
  text-align: center;
  font-size: 14px;
  color: var(--text-secondary);
  line-height: 1.7;
  max-width: 360px;
}

.auth-benefits {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
  background: var(--bg-secondary);
  border-radius: var(--radius-md);
  padding: 18px 20px;
}

.benefit-item {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  color: var(--text-primary);
}

.benefit-item .el-icon {
  color: var(--accent);
  flex-shrink: 0;
}

.key-input-section {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.key-input-section label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
}

.auth-hint {
  font-size: 12px;
  color: var(--text-muted);
  text-align: center;
  line-height: 1.6;
}

/* Mobile: content sizing only (dialog shell handled globally) */
@media (max-width: 768px) {
  .auth-content { gap: 16px; }
  .auth-icon { width: 56px; height: 56px; }
  .auth-desc { font-size: 13px; }
  .auth-benefits { padding: 14px 16px; gap: 8px; }
  .benefit-item { font-size: 12px; }
}
</style>
