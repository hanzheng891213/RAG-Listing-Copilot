<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { getSettings, updateSettings, type AdminSettings } from '@/api/admin'
import { useAuthStore } from '@/stores/authStore'

const { t } = useI18n()
const auth = useAuthStore()

const settings = ref<AdminSettings>({
  deepseekApiKey: '',
  modelName: 'deepseek-chat',
  temperature: 0.7,
  maxTokens: 4096,
})
const loading = ref(false)
const saving = ref(false)
const showKey = ref(false)

onMounted(async () => {
  loading.value = true
  try {
    const data = await getSettings()
    settings.value = { ...data, deepseekApiKey: '' }
  } catch {
    ElMessage.error(t('admin.loadFailed'))
  } finally {
    loading.value = false
  }
})

async function handleSave() {
  saving.value = true
  try {
    const payload: Partial<AdminSettings> = {
      modelName: settings.value.modelName,
      temperature: settings.value.temperature,
      maxTokens: settings.value.maxTokens,
    }
    // Only send API key if the user entered a new one
    if (settings.value.deepseekApiKey && !settings.value.deepseekApiKey.startsWith('sk-****')) {
      payload.deepseekApiKey = settings.value.deepseekApiKey
    }
    await updateSettings(payload)
    ElMessage.success(t('admin.saveSuccess'))
    if (settings.value.deepseekApiKey) {
      auth.setKey(settings.value.deepseekApiKey)
    }
    settings.value.deepseekApiKey = ''
  } catch {
    ElMessage.error(t('admin.saveFailed'))
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="admin-settings">
    <div class="page-header">
      <h2>{{ t('admin.title') }}</h2>
      <p class="page-desc">{{ t('admin.description') }}</p>
    </div>

    <div class="settings-card" v-loading="loading">
      <div class="setting-group">
        <label>{{ t('admin.deepseekApiKey') }}</label>
        <el-input
          v-model="settings.deepseekApiKey"
          :type="showKey ? 'text' : 'password'"
          :placeholder="t('admin.apiKeyPlaceholder')"
          size="large"
        >
          <template #prefix>
            <el-icon><Key /></el-icon>
          </template>
          <template #suffix>
            <el-button text @click="showKey = !showKey">
              <el-icon><component :is="showKey ? 'View' : 'Hide'" /></el-icon>
            </el-button>
          </template>
        </el-input>
        <span class="setting-hint">{{ t('admin.apiKeyHint') }}</span>
      </div>

      <div class="setting-group">
        <label>{{ t('admin.modelName') }}</label>
        <el-select v-model="settings.modelName" size="large" style="width: 100%">
          <el-option label="deepseek-chat" value="deepseek-chat" />
          <el-option label="deepseek-reasoner" value="deepseek-reasoner" />
        </el-select>
      </div>

      <div class="setting-row">
        <div class="setting-group">
          <label>{{ t('admin.temperature') }}: {{ settings.temperature }}</label>
          <el-slider
            v-model="settings.temperature"
            :min="0"
            :max="2"
            :step="0.1"
            :marks="{ 0: '0', 0.7: '0.7', 1: '1', 2: '2' }"
          />
        </div>
        <div class="setting-group">
          <label>{{ t('admin.maxTokens') }}</label>
          <el-input-number
            v-model="settings.maxTokens"
            :min="1"
            :max="32768"
            :step="256"
            size="large"
            style="width: 100%"
          />
        </div>
      </div>

      <div class="setting-actions">
        <el-button type="primary" size="large" :loading="saving" @click="handleSave">
          {{ t('common.save') }}
        </el-button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.admin-settings {
  max-width: 680px;
  margin: 0 auto;
}

.page-header {
  margin-bottom: 24px;
}

.page-header h2 {
  font-family: var(--font-display-serif);
  font-size: 24px;
  color: var(--text-primary);
  margin: 0 0 8px;
}

.page-desc {
  font-size: 14px;
  color: var(--text-secondary);
  margin: 0;
  line-height: 1.6;
}

.settings-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: 32px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.setting-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.setting-group label {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
}

.setting-hint {
  font-size: 12px;
  color: var(--text-muted);
}

.setting-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 32px;
}

.setting-actions {
  padding-top: 8px;
  display: flex;
  justify-content: flex-end;
}

@media (max-width: 768px) {
  .settings-card {
    padding: 20px;
  }
  .setting-row {
    grid-template-columns: 1fr;
    gap: 16px;
  }
}
</style>
