<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { PieChart, BarChart } from 'echarts/charts'
import { TitleComponent, TooltipComponent, LegendComponent, GridComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import ConfirmButton from '@/components/common/ConfirmButton.vue'
import {
  emptyUsageStats,
  getUsageStats,
  normaliseUsageStats,
  type ModelProvider,
  type ProviderConfig,
  type UsageStats,
} from '@/api/models'
import { useModelStore } from '@/stores/modelStore'

use([PieChart, BarChart, TitleComponent, TooltipComponent, LegendComponent, GridComponent, CanvasRenderer])

/**
 * Model manager, laid out after the DeepSeek Harness models page: one row per
 * provider, a single editor open at a time, credentials and extras inside it.
 *
 * Provider-side model catalogues are gone on purpose — the shipped model names
 * age faster than this page can be updated, and a preset default model hides
 * which model is actually being billed. A provider now carries one free model
 * name typed by the user from the provider's own documentation.
 */
const { t, te } = useI18n()
const modelStore = useModelStore()

const editingId = ref('')
const saving = ref(false)
const showAdvanced = ref(false)
const usageLoading = ref(false)
const rangeDays = ref(30)
const usageStats = ref<UsageStats>(emptyUsageStats())

const adding = ref(false)
const addForm = ref({ name: '', baseUrl: '' })

const PROVIDER_COLORS: Record<string, string> = {
  deepseek: '#4F46E5',
  qwen: '#7C3AED',
  doubao: '#10B981',
  custom: '#6B7280',
}

const providers = computed(() => modelStore.providers)
const configs = computed(() => modelStore.configs)

/** Draft of the currently edited provider; never the stored object. */
const editForm = ref<ProviderConfig>({
  providerId: '',
  apiKey: '',
  activeModel: '',
  temperature: 0.7,
  maxTokens: 4096,
  baseUrl: '',
})

function displayName(provider: ModelProvider): string {
  const key = `modelManager.providerNames.${provider.id}`
  return te(key) ? t(key) : provider.name
}

function isConfigured(providerId: string): boolean {
  return Boolean(configs.value.find((c) => c.providerId === providerId && c.apiKey))
}

function isActive(providerId: string): boolean {
  return modelStore.activeProviderId === providerId
}

function storedKeyOf(providerId: string): string {
  return modelStore.getConfig(providerId)?.apiKey || ''
}

function endpointOf(provider: ModelProvider): string {
  return modelStore.baseUrlFor(provider.id) || provider.baseUrl || ''
}

function hostOf(url: string): string {
  if (!url) return ''
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

function loadDraft(providerId: string): void {
  const provider = providers.value.find((p) => p.id === providerId)
  if (!provider) return
  const cfg = configs.value.find((c) => c.providerId === providerId)
  editForm.value = {
    providerId,
    // A stored key is never read back into the input; blank means "keep it".
    apiKey: '',
    activeModel: cfg?.activeModel || '',
    temperature: cfg?.temperature ?? 0.7,
    maxTokens: cfg?.maxTokens ?? 4096,
    baseUrl: cfg?.baseUrl || provider.baseUrl || '',
  }
  // A provider with no directory endpoint needs its address immediately.
  showAdvanced.value = !cfg?.baseUrl && !provider.baseUrl
}

function onAdvancedToggle(event: Event): void {
  showAdvanced.value = (event.target as HTMLDetailsElement).open
}

function toggleEditor(providerId: string): void {
  adding.value = false
  if (editingId.value === providerId) {
    editingId.value = ''
    return
  }
  loadDraft(providerId)
  editingId.value = providerId
}

function closeEditor(): void {
  editingId.value = ''
}

function startAdd(): void {
  editingId.value = ''
  adding.value = true
  addForm.value = { name: '', baseUrl: '' }
}

function cancelAdd(): void {
  adding.value = false
  addForm.value = { name: '', baseUrl: '' }
}

function onAddProvider(): void {
  const name = addForm.value.name.trim()
  if (!name) {
    ElMessage.warning(t('modelManager.providerNameRequired'))
    return
  }
  const id = modelStore.addProvider({ name, baseUrl: addForm.value.baseUrl })
  if (!id) {
    ElMessage.error(t('modelManager.addProviderFailed'))
    return
  }
  adding.value = false
  ElMessage.success(t('modelManager.providerAdded'))
  loadDraft(id)
  editingId.value = id
}

async function onSave(providerId: string): Promise<void> {
  if (saving.value) return

  const existing = modelStore.getConfig(providerId)
  const apiKey = editForm.value.apiKey.trim() || existing?.apiKey || ''
  if (!apiKey) {
    ElMessage.warning(t('modelManager.keyRequired'))
    return
  }

  const activeModel = editForm.value.activeModel.trim()
  if (!activeModel) {
    ElMessage.warning(t('modelManager.modelRequired'))
    return
  }

  // A provider without a directory endpoint (the built-in 自定义 row, or a
  // relay) must get one here — otherwise requests would be sent to "/chat/…".
  const baseUrl = (editForm.value.baseUrl ?? '').trim()
  const directoryUrl = providers.value.find((p) => p.id === providerId)?.baseUrl || ''
  if (!baseUrl && !directoryUrl) {
    showAdvanced.value = true
    ElMessage.warning(t('modelManager.baseUrlRequired'))
    return
  }

  saving.value = true
  try {
    modelStore.updateProviderConfig({
      providerId,
      apiKey,
      activeModel,
      temperature: editForm.value.temperature,
      maxTokens: editForm.value.maxTokens,
      baseUrl,
    })
    if (!modelStore.activeProviderId) modelStore.setActiveProvider(providerId)
    editingId.value = ''
    ElMessage.success(t('modelManager.saved'))
  } catch {
    ElMessage.error(t('modelManager.saveFailed'))
  } finally {
    saving.value = false
  }
}

function onDeleteKey(providerId: string): void {
  modelStore.clearProviderKey(providerId)
  editForm.value.apiKey = ''
  ElMessage.success(t('modelManager.keyDeleted'))
}

async function onDeleteProvider(providerId: string): Promise<void> {
  const provider = providers.value.find((p) => p.id === providerId)
  if (!provider) return
  try {
    await ElMessageBox.confirm(
      t('modelManager.confirmDeleteProvider', { name: displayName(provider) }),
      t('common.confirmTitle'),
      { type: 'warning', confirmButtonText: t('common.delete'), cancelButtonText: t('common.cancel') },
    )
  } catch {
    return
  }
  if (modelStore.removeProvider(providerId)) {
    if (editingId.value === providerId) editingId.value = ''
    ElMessage.success(t('modelManager.providerDeleted'))
  }
}

function onUseAsDefault(providerId: string): void {
  if (!isConfigured(providerId)) {
    ElMessage.warning(t('modelManager.keyRequiredFirst'))
    return
  }
  modelStore.setActiveProvider(providerId)
  ElMessage.success(t('modelManager.defaultSet'))
}

async function loadStats(): Promise<void> {
  usageLoading.value = true
  try {
    usageStats.value = normaliseUsageStats(await getUsageStats(rangeDays.value))
  } catch (error) {
    console.error('[ModelManager] usage stats failed:', error)
    usageStats.value = emptyUsageStats()
  } finally {
    usageLoading.value = false
  }
}

async function loadData(): Promise<void> {
  try {
    await modelStore.loadConfigs()
  } catch {
    // directory unavailable: local configs still render
  }
  await loadStats()
}

watch(rangeDays, () => void loadStats())

onMounted(loadData)

// ── Charts ───────────────────────────────────────────────────────────

function lighten(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16)
  const to2 = (c: number) => Math.round(c).toString(16).padStart(2, '0')
  const mix = (c: number) => c + (255 - c) * amount
  return `#${to2(mix((n >> 16) & 255))}${to2(mix((n >> 8) & 255))}${to2(mix(n & 255))}`
}

function shorten(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value
}

const avgTokens = computed(() => {
  const calls = usageStats.value.totalCalls
  return calls > 0 ? Math.round(usageStats.value.totalTokens / calls) : 0
})

const modelRows = computed(() =>
  [...usageStats.value.byModel]
    .sort((a, b) => b.tokens - a.tokens)
    .map((row) => ({
      ...row,
      share: usageStats.value.totalTokens > 0 ? (row.tokens / usageStats.value.totalTokens) * 100 : 0,
    })),
)

const pieData = computed(() => {
  const seen = new Map<string, number>()
  return usageStats.value.byModel.map((m) => {
    const nth = seen.get(m.providerId) ?? 0
    seen.set(m.providerId, nth + 1)
    const base = PROVIDER_COLORS[m.providerId] || '#2dd4a8'
    return {
      name: m.name,
      labelName: shorten(m.name.split(' · ').pop() || m.name, 18),
      value: Number(m.cost.toFixed(4)),
      itemStyle: { color: nth === 0 ? base : lighten(base, Math.min(nth * 0.3, 0.75)) },
    }
  })
})

const pieOption = computed(() => ({
  tooltip: {
    trigger: 'item',
    formatter: (p: any) => `${p.name}<br/>￥${p.value}（${p.percent}%）`,
  },
  legend: {
    type: 'scroll',
    bottom: 0,
    textStyle: { fontSize: 11 },
    itemWidth: 10,
    itemHeight: 10,
  },
  series: [{
    type: 'pie',
    radius: ['42%', '64%'],
    center: ['50%', '44%'],
    itemStyle: { borderRadius: 4, borderColor: 'rgba(255,255,255,0.08)', borderWidth: 1 },
    avoidLabelOverlap: true,
    labelLayout: { moveOverlap: 'shiftY', hideOverlap: false },
    label: {
      show: true,
      fontSize: 11,
      lineHeight: 14,
      formatter: (p: any) => `${p.data.labelName ?? p.name}\n￥${p.value}`,
    },
    labelLine: { length: 10, length2: 10, smooth: true },
    data: pieData.value,
  }],
}))

const barOption = computed(() => ({
  tooltip: { trigger: 'axis' },
  grid: { left: 44, right: 16, top: 12, bottom: 26 },
  xAxis: {
    type: 'category',
    data: usageStats.value.daily.map((d) => d.date.slice(5)),
    axisLabel: { fontSize: 10, rotate: 45 },
  },
  yAxis: {
    type: 'value',
    axisLabel: {
      fontSize: 10,
      formatter: (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)),
    },
  },
  series: [{
    type: 'bar',
    barWidth: '42%',
    data: usageStats.value.daily.map((d) => d.tokens),
    itemStyle: { borderRadius: [4, 4, 0, 0], color: '#2dd4a8' },
    emphasis: { itemStyle: { color: '#58d7b7' } },
  }],
}))

const hasUsage = computed(
  () => usageStats.value.totalCalls > 0 || usageStats.value.byModel.length > 0,
)

function formatCost(value: number): string {
  return Number(value ?? 0).toFixed(4)
}

function formatTokens(value: number): string {
  const n = Number(value ?? 0)
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}
</script>

<template>
  <div class="model-manager">
    <div class="page-header">
      <p class="page-desc">{{ t('modelManager.description') }}</p>
    </div>

    <div class="manager-layout">
      <!-- ── Left: model providers ─────────────────────────────────── -->
      <section class="provider-panel">
        <div class="provider-panel__head">
          <div>
            <h2 class="panel-title">{{ t('modelManager.providers') }}</h2>
            <p class="panel-hint">{{ t('modelManager.providersHint') }}</p>
          </div>
          <span class="provider-count">{{ providers.length }}</span>
        </div>

        <ul class="provider-list">
          <li
            v-for="p in providers"
            :key="p.id"
            class="provider-card"
            :class="{ open: editingId === p.id }"
          >
            <div class="provider-head">
              <span class="provider-identity">
                <span
                  class="credential-dot"
                  :class="isConfigured(p.id) ? 'ok' : 'off'"
                  role="img"
                  :aria-label="isConfigured(p.id) ? t('modelManager.keyConfigured') : t('modelManager.keyMissing')"
                  :title="isConfigured(p.id) ? t('modelManager.keyConfigured') : t('modelManager.keyMissing')"
                />
                <span class="provider-name">{{ displayName(p) }}</span>
                <span v-if="modelStore.isCustomProvider(p.id)" class="provider-tag">
                  {{ t('modelManager.customTag') }}
                </span>
                <span v-if="isActive(p.id)" class="provider-tag default">
                  {{ t('modelManager.defaultBadge') }}
                </span>
              </span>

              <span class="provider-endpoint">{{ hostOf(endpointOf(p)) }}</span>

              <span class="provider-actions">
                <button
                  type="button"
                  class="ghost-btn"
                  :aria-label="t('modelManager.editProvider', { name: displayName(p) })"
                  @click="toggleEditor(p.id)"
                >
                  {{ editingId === p.id ? t('modelManager.collapse') : t('modelManager.edit') }}
                </button>
                <button
                  v-if="modelStore.isCustomProvider(p.id)"
                  type="button"
                  class="ghost-btn danger"
                  :aria-label="t('modelManager.deleteProvider')"
                  @click="onDeleteProvider(p.id)"
                >
                  {{ t('common.delete') }}
                </button>
              </span>
            </div>

            <!-- Inline editor: one card open at a time, drafts stay inside. -->
            <div v-if="editingId === p.id" class="provider-editor">
              <div class="editor-head">
                <span class="editor-title">{{ t('modelManager.settings', { name: displayName(p) }) }}</span>
                <span v-if="!modelStore.isCustomProvider(p.id)" class="editor-route">{{ p.id }}</span>
              </div>

              <div class="field">
                <div class="field-label">
                  <span>{{ t('modelManager.apiKey') }}</span>
                  <a
                    v-if="p.signupUrl"
                    :href="p.signupUrl"
                    target="_blank"
                    rel="noopener"
                    class="field-link"
                  >
                    {{ t('modelManager.getApiKey') }} ↗
                  </a>
                </div>

                <div v-if="storedKeyOf(p.id)" class="stored-key">
                  <code>{{ modelStore.maskKey(storedKeyOf(p.id)) }}</code>
                  <ConfirmButton
                    size="small"
                    text
                    type="danger"
                    :confirm-title="t('common.confirmTitle')"
                    :confirm-message="t('modelManager.confirmDeleteKey')"
                    @click="onDeleteKey(p.id)"
                  >
                    {{ t('modelManager.deleteKey') }}
                  </ConfirmButton>
                </div>

                <el-input
                  v-model="editForm.apiKey"
                  type="password"
                  show-password
                  size="small"
                  autocomplete="new-password"
                  :placeholder="storedKeyOf(p.id) ? t('modelManager.keyKeepHint') : t('modelManager.apiKeyPlaceholder')"
                />
                <p v-if="storedKeyOf(p.id)" class="field-hint">{{ t('modelManager.keyStoredHint') }}</p>
              </div>

              <div class="field">
                <label class="field-label">{{ t('modelManager.model') }}</label>
                <el-input
                  v-model="editForm.activeModel"
                  size="small"
                  :placeholder="t('modelManager.modelPlaceholder')"
                />
                <p class="field-hint">{{ t('modelManager.modelHint') }}</p>
              </div>

              <details class="advanced" :open="showAdvanced" @toggle="onAdvancedToggle">
                <summary class="advanced-summary">{{ t('modelManager.customized') }}</summary>
                <div class="advanced-body">
                  <div class="field">
                    <label class="field-label">{{ t('modelManager.baseUrl') }}</label>
                    <el-input
                      v-model="editForm.baseUrl"
                      size="small"
                      :placeholder="p.baseUrl || 'https://api.example.com/v1'"
                    />
                  </div>

                  <div class="param-grid">
                    <div class="field">
                      <label class="field-label">{{ t('modelManager.temperature') }}</label>
                      <el-input-number
                        v-model="editForm.temperature"
                        :min="0"
                        :max="2"
                        :step="0.1"
                        :precision="1"
                        size="small"
                        controls-position="right"
                        style="width: 100%"
                      />
                    </div>
                    <div class="field">
                      <label class="field-label">{{ t('modelManager.maxTokens') }}</label>
                      <el-input-number
                        v-model="editForm.maxTokens"
                        :min="256"
                        :max="32768"
                        :step="256"
                        size="small"
                        controls-position="right"
                        style="width: 100%"
                      />
                    </div>
                  </div>
                </div>
              </details>

              <div class="editor-actions">
                <el-button
                  size="small"
                  text
                  type="primary"
                  :disabled="!isConfigured(p.id) || isActive(p.id)"
                  @click="onUseAsDefault(p.id)"
                >
                  {{ t('modelManager.setDefault') }}
                </el-button>
                <span class="spacer" />
                <el-button size="small" @click="closeEditor">{{ t('common.cancel') }}</el-button>
                <el-button size="small" type="primary" :loading="saving" @click="onSave(p.id)">
                  {{ t('common.save') }}
                </el-button>
              </div>
            </div>
          </li>
        </ul>

        <!-- Add a provider the directory does not know about. -->
        <button v-if="!adding" type="button" class="add-provider-btn" @click="startAdd">
          <el-icon><Plus /></el-icon>
          {{ t('modelManager.addProvider') }}
        </button>

        <div v-else class="add-card">
          <div class="editor-head">
            <span class="editor-title">{{ t('modelManager.newProvider') }}</span>
          </div>
          <div class="field">
            <label class="field-label">{{ t('modelManager.providerName') }}</label>
            <el-input
              v-model="addForm.name"
              size="small"
              :placeholder="t('modelManager.providerNamePlaceholder')"
            />
          </div>
          <div class="field">
            <label class="field-label">{{ t('modelManager.baseUrl') }}</label>
            <el-input v-model="addForm.baseUrl" size="small" placeholder="https://api.example.com/v1" />
          </div>
          <div class="editor-actions">
            <span class="spacer" />
            <el-button size="small" @click="cancelAdd">{{ t('common.cancel') }}</el-button>
            <el-button size="small" type="primary" @click="onAddProvider">
              {{ t('modelManager.add') }}
            </el-button>
          </div>
        </div>
      </section>

      <!-- ── Right: usage analytics ────────────────────────────────── -->
      <div class="panel panel-right">
        <div class="panel-head">
          <span class="panel-title">{{ t('modelManager.usageAnalytics') }}</span>
          <el-radio-group v-model="rangeDays" size="small">
            <el-radio-button :value="7">{{ t('modelManager.days7') }}</el-radio-button>
            <el-radio-button :value="30">{{ t('modelManager.days30') }}</el-radio-button>
            <el-radio-button :value="90">{{ t('modelManager.days90') }}</el-radio-button>
          </el-radio-group>
        </div>

        <div v-loading="usageLoading" class="usage-body">
          <div class="summary-cards">
            <div class="summary-card">
              <div class="card-value">￥{{ formatCost(usageStats.totalCost) }}</div>
              <div class="card-label">{{ t('modelManager.totalCost') }}</div>
            </div>
            <div class="summary-card">
              <div class="card-value">{{ formatTokens(usageStats.totalTokens) }}</div>
              <div class="card-label">{{ t('modelManager.totalTokens') }}</div>
            </div>
            <div class="summary-card">
              <div class="card-value">{{ usageStats.totalCalls }}</div>
              <div class="card-label">{{ t('modelManager.apiCalls') }}</div>
            </div>
            <div class="summary-card">
              <div class="card-value">{{ formatTokens(avgTokens) }}</div>
              <div class="card-label">{{ t('modelManager.avgTokens') }}</div>
            </div>
          </div>

          <div class="chart-section">
            <div class="chart-title">{{ t('modelManager.usageByModel') }}</div>
            <el-table
              v-if="modelRows.length > 0"
              :data="modelRows"
              size="small"
              class="usage-table"
              :empty-text="t('modelManager.noUsageData')"
            >
              <el-table-column prop="name" :label="t('modelManager.usageModel')" min-width="180" show-overflow-tooltip />
              <el-table-column :label="t('modelManager.tokens')" width="100" align="right">
                <template #default="{ row }">{{ formatTokens(row.tokens) }}</template>
              </el-table-column>
              <el-table-column :label="t('modelManager.calls')" width="80" align="right">
                <template #default="{ row }">{{ row.calls }}</template>
              </el-table-column>
              <el-table-column :label="t('modelManager.cost')" width="96" align="right">
                <template #default="{ row }">￥{{ formatCost(row.cost) }}</template>
              </el-table-column>
              <el-table-column :label="t('modelManager.share')" width="150">
                <template #default="{ row }">
                  <div class="share-cell">
                    <div class="share-bar"><span :style="{ width: `${Math.min(100, row.share)}%` }" /></div>
                    <span class="share-value">{{ row.share.toFixed(1) }}%</span>
                  </div>
                </template>
              </el-table-column>
            </el-table>
            <div v-else class="chart-empty">{{ t('modelManager.noUsageData') }}</div>
          </div>

          <div v-if="hasUsage" class="chart-grid">
            <div class="chart-section">
              <div class="chart-title">{{ t('modelManager.costByModel') }}</div>
              <div v-if="pieData.length > 0" class="chart-wrap">
                <VChart :option="pieOption" autoresize style="height: 250px" />
              </div>
              <div v-else class="chart-empty">{{ t('modelManager.noUsageData') }}</div>
            </div>

            <div class="chart-section">
              <div class="chart-title">{{ t('modelManager.dailyTokenUsage') }}</div>
              <div v-if="usageStats.daily.length > 0" class="chart-wrap">
                <VChart :option="barOption" autoresize style="height: 250px" />
              </div>
              <div v-else class="chart-empty">{{ t('modelManager.noUsageData') }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/components/views/model-manager.scss' as *;
</style>
