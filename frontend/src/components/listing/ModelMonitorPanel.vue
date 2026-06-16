<script setup lang="ts">
import { onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useModelStore } from '@/stores/modelStore'

const { t } = useI18n()
const modelStore = useModelStore()

onMounted(() => {
  modelStore.loadConfigs()
})
</script>

<template>
  <div class="model-monitor">
    <div class="monitor-header">
      <span class="monitor-title">{{ t("model.aiModel") }}</span>
      <span v-if="modelStore.hasAnyConfigured" class="status-dot active" />
      <span v-else class="status-dot inactive" />
    </div>

    <!-- Model switcher -->
    <div v-if="modelStore.hasAnyConfigured" class="monitor-body">
      <div class="form-group">
        <label>{{ t("model.switchModel") }}</label>
        <el-select
          :model-value="modelStore.activeProviderId"
          size="small"
          style="width: 100%"
          @change="modelStore.setActiveProvider"
        >
          <el-option
            v-for="c in modelStore.configuredProviders"
            :key="c.providerId"
            :label="`${modelStore.providers.find(p => p.id === c.providerId)?.name || c.providerId} — ${c.activeModel}`"
            :value="c.providerId"
          />
        </el-select>
      </div>

      <template v-if="modelStore.activeConfig">
        <div class="monitor-row">
          <span class="label">{{ t("model.provider") }}</span>
          <span class="value">{{ modelStore.activeProvider?.name || modelStore.activeConfig.providerId }}</span>
        </div>
        <div class="monitor-row">
          <span class="label">{{ t("model.model_") }}</span>
          <span class="value">{{ modelStore.activeModelName }}</span>
        </div>
        <div class="monitor-row">
          <span class="label">{{ t("model.temperature") }}</span>
          <span class="value">{{ modelStore.activeConfig.temperature }}</span>
        </div>
        <div class="monitor-row">
          <span class="label">{{ t("model.maxTokens") }}</span>
          <span class="value">{{ modelStore.activeConfig.maxTokens }}</span>
        </div>
        <div class="monitor-row">
          <span class="label">API Key</span>
          <span class="value key-masked">{{ modelStore.maskKey(modelStore.activeConfig.apiKey) }}</span>
        </div>
      </template>
    </div>

    <div v-else class="monitor-empty">
      <span>{{ t("model.noModelConfigured") }}</span>
      <el-button size="small" text type="primary" @click="$router.push('/model-manager')">
        {{ t('model.configure') }}
      </el-button>
    </div>
  </div>
</template>

<style scoped>
.model-monitor {
  margin-bottom: 12px;
  padding: 12px 14px;
  background: var(--bg-secondary);
  border-radius: var(--radius-md);
  font-size: 13px;
}
.monitor-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.monitor-title {
  font-weight: 500;
  color: var(--text-primary);
}
.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
.status-dot.active { background: #22c55e; }
.status-dot.inactive { background: #9ca3af; }
.monitor-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.monitor-row {
  display: flex;
  justify-content: space-between;
}
.monitor-row .label { color: var(--text-muted); }
.monitor-row .value { color: var(--text-primary); font-family: monospace; font-size: 12px; }
.monitor-row .key-masked { color: var(--text-muted); font-size: 11px; }
.form-group {
  margin-bottom: 4px;
}
.form-group label {
  display: block;
  font-size: 11px;
  color: var(--text-secondary);
  margin-bottom: 3px;
}
.monitor-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  color: var(--text-muted);
  font-size: 12px;
}
</style>
