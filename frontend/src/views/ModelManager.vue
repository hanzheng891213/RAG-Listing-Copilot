<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { PieChart, BarChart } from 'echarts/charts'
import { TitleComponent, TooltipComponent, LegendComponent, GridComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import ConfirmButton from '@/components/common/ConfirmButton.vue'
import {
  updateProviderConfig, getUsageStats,
  type UsageStats,
} from '@/api/models'
import { useModelStore } from '@/stores/modelStore'

use([PieChart, BarChart, TitleComponent, TooltipComponent, LegendComponent, GridComponent, CanvasRenderer])

const { t } = useI18n()
const modelStore = useModelStore()

const selectedId = ref('deepseek')
const saving = ref<Record<string, boolean>>({})
const showKey = ref<Record<string, boolean>>({})
const usageStats = ref<UsageStats>({
  totalCost: 0, totalTokens: 0, totalCalls: 0,
  byProvider: [], daily: [],
})

const providers = computed(() => modelStore.providers)
const configs = computed(() => modelStore.configs)

const selectedProvider = computed(() =>
  providers.value.find((p) => p.id === selectedId.value),
)

const selectedConfig = computed(() =>
  configs.value.find((c) => c.providerId === selectedId.value),
)

const editForm = ref({
  providerId: '', apiKey: '', activeModel: '',
  temperature: 0.7, maxTokens: 4096,
})

watch(selectedId, (id) => {
  const cfg = configs.value.find((c) => c.providerId === id)
  if (cfg) {
    editForm.value = { ...cfg, apiKey: '' }
  }
})

const configuredProviders = computed(() =>
  configs.value.filter((c) => c.apiKey && c.providerId !== 'custom'),
)

const PROVIDER_COLORS: Record<string, string> = {
  deepseek: '#4F46E5',
  qwen: '#7C3AED',
  doubao: '#10B981',
custom: '#6B7280',
}

const pieOption = computed(() => ({
  tooltip: { trigger: 'item', formatter: '{b}: ￥{c}（RMB）' },
  legend: { bottom: 0, textStyle: { fontSize: 11 } },
  series: [{
    type: 'pie',
    radius: ['45%', '75%'],
    center: ['50%', '45%'],
    itemStyle: { borderRadius: 4, borderColor: '#2dd4a8', borderWidth: 0.1 },
    label: { formatter: '{b}\n￥{c}（RMB）' },
    data: usageStats.value.byProvider.map((p) => ({
      name: p.providerName,
      value: p.cost,
      itemStyle: { color: PROVIDER_COLORS[p.providerId] || '#6B7280' },
    })),
  }],
}))

const barOption = computed(() => ({
  tooltip: { trigger: 'axis' },
  grid: { left: 40, right: 16, top: 10, bottom: 24 },
  xAxis: {
    type: 'category',
    data: usageStats.value.daily.map((d) => d.date.slice(5)),
    axisLabel: { fontSize: 10, rotate: 45 },
  },
  yAxis: {
    type: 'value',
    axisLabel: { fontSize: 10, formatter: (v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v) },
  },
  series: [{
    type: 'bar',
    barWidth: '10%',
    data: usageStats.value.daily.map((d) => d.tokens),
    itemStyle: { borderRadius: [4, 4, 0, 0], color: '#2dd4a8' },
    emphasis: {
      itemStyle: { color: '#58d7b7' },
    },
  }],
}))

async function loadData() {
  try {
    await modelStore.loadConfigs()
    usageStats.value = await getUsageStats()

    const cfg = configs.value.find((c) => c.providerId === selectedId.value)
    if (cfg) editForm.value = { ...cfg, apiKey: '' }
  } catch {
    // backend may not be available
  }
}

async function onSave(providerId: string) {
  saving.value[providerId] = true
  try {
    const payload: any = {
      apiKey: editForm.value.apiKey || undefined,
      activeModel: editForm.value.activeModel,
      temperature: editForm.value.temperature,
      maxTokens: editForm.value.maxTokens,
    }

    // Detect custom model: not in the provider's predefined list
    const sp = providers.value.find((p) => p.id === providerId)
    if (sp && editForm.value.activeModel && !sp.models.find((m) => m.id === editForm.value.activeModel)) {
      payload.customModels = [{ id: editForm.value.activeModel, name: editForm.value.activeModel }]
    }

    await updateProviderConfig(providerId, payload)
    ElMessage.success(t('modelManager.saved'))
    await loadData()
  } catch {
    ElMessage.error(t('modelManager.saveFailed'))
  } finally {
    saving.value[providerId] = false
  }
}

async function onDeleteKey(providerId: string) {
  try {
    await updateProviderConfig(providerId, { apiKey: '' })
    ElMessage.success(t('modelManager.keyDeleted'))
    editForm.value.apiKey = ''
    await loadData()
  } catch {
    ElMessage.error(t('modelManager.saveFailed'))
  }
}

function onSelectProvider(id: string) {
  selectedId.value = id
  showKey.value[id] = false
}

onMounted(loadData)
</script>

<template>
  <div class="model-manager">
    <div class="page-header">
      <h1 class="page-title">{{ t('modelManager.title') }}</h1>
      <p class="page-desc">{{ t('modelManager.description') }}</p>
    </div>

    <div class="manager-layout">
      <!-- Left: Provider Config -->
      <div class="panel panel-left">
        <div class="panel-title">{{ t('modelManager.providers') }}</div>

        <div class="provider-list">
          <div
            v-for="p in providers"
            :key="p.id"
            :class="['provider-card', { active: selectedId === p.id }]"
            @click="onSelectProvider(p.id)"
          >
            <div class="provider-name">{{ t('modelManager.providerNames.' + p.id) }}</div>
            <div class="provider-status">
              <span
                :class="['dot', configs.find(c => c.providerId === p.id && c.apiKey) ? 'green' : 'gray']"
              />
              {{ configs.find(c => c.providerId === p.id && c.apiKey) ? t('common.configured') : t('common.noKey') }}
            </div>
          </div>
        </div>

        <!-- Configured models summary -->
        <div v-if="configuredProviders.length > 0" class="configured-summary">
          <div class="summary-title">{{ t('model.configuredModels') }}</div>
          <div v-for="c in configuredProviders" :key="c.providerId" class="configured-item">
            <span class="configured-name">{{ t('modelManager.providerNames.' + c.providerId) }}</span>
            <span class="configured-model">{{ c.activeModel }}</span>
            <span class="configured-key">{{ modelStore.maskKey(c.apiKey) }}</span>
          </div>
        </div>

        <div v-if="selectedProvider" class="config-form">
          <div class="form-title">{{ t('modelManager.settings', { name: t('modelManager.providerNames.' + selectedProvider.id) }) }}</div>

          <!-- Signup link -->
          <div v-if="selectedProvider.signupUrl" class="signup-link">
            <a :href="selectedProvider.signupUrl" target="_blank" rel="noopener">
              {{ t('modelManager.getApiKey') }} &rarr;
            </a>
            <span class="signup-hint">{{ t('modelManager.apiConsole', { name: t('modelManager.providerNames.' + selectedProvider.id) }) }}</span>
          </div>

          <!-- Current key display -->
          <div v-if="selectedConfig?.apiKey" class="current-key">
            <span class="key-label">{{ t('modelManager.apiKey') }}:</span>
            <code class="key-value">{{ modelStore.maskKey(selectedConfig.apiKey) }}</code>
            <ConfirmButton size="small" text type="danger" :confirm-title="t('common.confirmTitle')" :confirm-message="t('modelManager.confirmDeleteKey')" @click="onDeleteKey(selectedId)">
              {{ t('modelManager.deleteKey') }}
            </ConfirmButton>
          </div>

          <!-- API Key -->
          <div class="form-group">
            <label>{{ selectedConfig?.apiKey ? 'Update ' + t('modelManager.apiKey') : t('modelManager.apiKey') }}</label>
            <el-input
              v-model="editForm.apiKey"
              :type="showKey[selectedId] ? 'text' : 'password'"
              :placeholder="selectedConfig?.apiKey ? '(leave blank to keep current key)' : t('modelManager.apiKeyPlaceholder')"
              size="small"
            >
              <template #suffix>
                <el-button text size="small" @click="showKey[selectedId] = !showKey[selectedId]">
                  {{ showKey[selectedId] ? t('common.hide') : t('common.show') }}
                </el-button>
              </template>
            </el-input>
          </div>

          <!-- Model -->
          <div class="form-group">
            <label>{{ t("modelManager.model") }}</label>
            <el-select v-model="editForm.activeModel" size="small" style="width: 100%" filterable allow-create default-first-option>
              <el-option
                v-for="m in selectedProvider.models"
                :key="m.id"
                :label="m.name"
                :value="m.id"
              />
            </el-select>
          </div>

          <!-- Temperature -->
          <div class="form-group">
            <label>{{ t("modelManager.temperature") }}: {{ editForm.temperature }}</label>
            <el-slider
              v-model="editForm.temperature"
              :min="0" :max="2" :step="0.1"
              size="small"
            />
          </div>

          <!-- Max Tokens -->
          <div class="form-group">
            <label>{{ t("modelManager.maxTokens") }}: {{ editForm.maxTokens }}</label>
            <el-input-number
              v-model="editForm.maxTokens"
              :min="256" :max="32768" :step="256"
              size="small"
              style="width: 100%"
            />
          </div>

          <el-button
            type="primary"
            :loading="saving[selectedId]"
            @click="onSave(selectedId)"
            style="width: 100%; margin-top: 8px"
          >
            {{ t("modelManager.save") }}
          </el-button>
        </div>
      </div>

      <!-- Right: Usage Charts -->
      <div class="panel panel-right">
        <div class="panel-title">{{ t('modelManager.usageAnalytics') }}</div>

        <!-- Summary Cards -->
        <div class="summary-cards">
          <div class="summary-card">
            <div class="card-value">￥{{ usageStats.totalCost.toFixed(4) }}（RMB）</div>
            <div class="card-label">{{ t("modelManager.totalCost") }}</div>
          </div>
          <div class="summary-card">
            <div class="card-value">{{ (usageStats.totalTokens / 1000).toFixed(0) }}K</div>
            <div class="card-label">{{ t("modelManager.totalTokens") }}</div>
          </div>
          <div class="summary-card">
            <div class="card-value">{{ usageStats.totalCalls }}</div>
            <div class="card-label">{{ t("modelManager.apiCalls") }}</div>
          </div>
        </div>

        <!-- Pie Chart: Cost by Provider -->
        <div class="chart-section">
          <div class="chart-title">{{ t('modelManager.costByProvider') }}</div>
          <div v-if="usageStats.byProvider.length > 0" class="chart-wrap">
            <VChart :option="pieOption" autoresize style="height: 220px" />
          </div>
          <div v-else class="chart-empty">{{ t('modelManager.noUsageData') }}</div>
        </div>

        <!-- Bar Chart: Daily Tokens -->
        <div class="chart-section">
          <div class="chart-title">{{ t('modelManager.dailyTokenUsage') }}</div>
          <div v-if="usageStats.daily.length > 0" class="chart-wrap">
            <VChart :option="barOption" autoresize style="height: 200px" />
          </div>
          <div v-else class="chart-empty">{{ t('modelManager.noUsageData') }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.model-manager { max-width: 1440px; }
.page-header { margin-bottom: 24px; }
.page-title { font-size: 28px; font-weight: 400; margin-bottom: 8px; }
.page-desc { color: var(--text-secondary); font-size: 15px; }

.manager-layout {
  display: grid;
  grid-template-columns: 360px 1fr;
  gap: 20px;
  align-items: start;
}
.panel {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: 20px;
}
.panel-title {
  font-size: 16px;
  font-weight: 500;
  margin-bottom: 16px;
  color: var(--text-primary);
}

/* Provider list */
.provider-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 20px;
}
.provider-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all 0.15s;
}
.provider-card:hover { background: var(--bg-secondary); }
.provider-card.active { border-color: var(--accent); background: rgba(99, 102, 241, 0.05); }
.provider-name { font-size: 14px; color: var(--text-primary); }
.provider-status { font-size: 12px; color: var(--text-muted); display: flex; align-items: center; gap: 4px; }
.dot { width: 6px; height: 6px; border-radius: 50%; }
.dot.green { background: #22c55e; }
.dot.gray { background: #9ca3af; }

/* Configured summary */
.configured-summary {
  border-top: 1px solid var(--border-color);
  padding-top: 16px;
  margin-bottom: 16px;
}
.summary-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  margin-bottom: 8px;
}
.configured-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  background: var(--bg-secondary);
  border-radius: var(--radius-sm);
  margin-bottom: 4px;
  font-size: 12px;
}
.configured-name { color: var(--text-primary); font-weight: 500; min-width: 60px; }
.configured-model { color: var(--accent); font-family: monospace; font-size: 11px; }
.configured-key { color: var(--text-muted); font-family: monospace; font-size: 11px; margin-left: auto; }

/* Current key */
.current-key {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  padding: 6px 10px;
  background: var(--bg-secondary);
  border-radius: var(--radius-sm);
  font-size: 12px;
}
.key-label { color: var(--text-secondary); }
.key-value { color: var(--text-muted); font-size: 11px; }

/* Config form */
.config-form {
  border-top: 1px solid var(--border-color);
  padding-top: 16px;
}
.form-title { font-size: 14px; font-weight: 500; margin-bottom: 12px; }
.signup-link {
  margin-bottom: 12px;
  padding: 8px 12px;
  background: var(--bg-secondary);
  border-radius: var(--radius-sm);
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.signup-link a { color: var(--accent); font-size: 13px; text-decoration: none; }
.signup-link a:hover { text-decoration: underline; }
.signup-hint { font-size: 11px; color: var(--text-muted); }
.form-group {
  margin-bottom: 14px;
}
.form-group label {
  display: block;
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 4px;
}

/* Summary cards */
.summary-cards {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-bottom: 24px;
}
.summary-card {
  padding: 16px;
  background: var(--bg-secondary);
  border-radius: var(--radius-md);
  text-align: center;
}
.card-value {
  font-size: 22px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 4px;
}
.card-label {
  font-size: 11px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* Charts */
.chart-section {
  margin-bottom: 20px;
}
.chart-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  margin-bottom: 8px;
}
.chart-wrap {
  background: var(--bg-secondary);
  border-radius: var(--radius-md);
  padding: 8px;
}
.chart-empty {
  padding: 40px;
  text-align: center;
  color: var(--text-muted);
  font-size: 13px;
  background: var(--bg-secondary);
  border-radius: var(--radius-md);
}

@media (max-width: 1000px) {
  .manager-layout { grid-template-columns: 1fr; }
  .summary-cards { grid-template-columns: 1fr 1fr; }
}
</style>
