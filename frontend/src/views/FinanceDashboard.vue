<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { getFinanceSummary, type FinanceProduct, type FinanceSummary } from '@/api/finance'

/**
 * Estimated-margin dashboard.
 *
 * Everything is computed on the server from the listing table's dynamic JSON
 * fields, so this page does not need to fetch thousands of rows. Editing cost
 * columns happens in the listing table; this page is read-only by design.
 */
const { t, locale } = useI18n()
const router = useRouter()

const loading = ref(false)
const summary = ref<FinanceSummary | null>(null)

const hasRows = computed(() => (summary.value?.totalProducts ?? 0) > 0)
const hasComplete = computed(() => (summary.value?.completeCount ?? 0) > 0)

function formatMoney(value: number, currency: string): string {
  const code = /^[A-Z]{3}$/.test(currency) ? currency : ''
  try {
    return new Intl.NumberFormat(locale.value, {
      style: code ? 'currency' : 'decimal',
      currency: code || undefined,
      maximumFractionDigits: 2,
    }).format(Number(value) || 0)
  } catch {
    return `${currency} ${(Number(value) || 0).toFixed(2)}`
  }
}

function formatPercent(value: number): string {
  return `${(Number(value) || 0).toFixed(1)}%`
}

function marginClass(value: number): string {
  if (value < 0) return 'negative'
  if (value < 10) return 'low'
  if (value < 20) return 'medium'
  return 'good'
}

function formatDate(value: string): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString()
}

async function load(): Promise<void> {
  loading.value = true
  try {
    summary.value = await getFinanceSummary()
  } catch (error) {
    console.error('[Finance] load failed:', error)
    ElMessage.error(t('finance.loadFailed'))
  } finally {
    loading.value = false
  }
}

async function refresh(): Promise<void> {
  await load()
  ElMessage.success(t('finance.refreshed'))
}

function goToGrid(): void {
  router.push('/product-grid')
}

function productLabel(row: FinanceProduct): string {
  return row.name || row.sku || row.id
}

onMounted(load)
</script>

<template>
  <div class="finance-page">
    <div class="page-header">
      <div>
        <p class="page-desc">{{ t('finance.description') }}</p>
        <p v-if="summary?.generatedAt" class="page-meta">
          {{ t('finance.mixedCurrencyNote') }} · {{ formatDate(summary.generatedAt) }}
        </p>
      </div>
      <el-button size="small" :loading="loading" @click="refresh">
        {{ t('finance.refresh') }}
      </el-button>
    </div>

    <el-alert
      type="info"
      :closable="false"
      show-icon
      :title="t('finance.hint')"
      class="finance-alert"
    />

    <div v-if="!hasRows && !loading" class="empty-state">
      <h3>{{ t('finance.noData') }}</h3>
      <p>{{ t('finance.noDataHint') }}</p>
      <el-button type="primary" size="small" @click="goToGrid">{{ t('finance.goToGrid') }}</el-button>
    </div>

    <template v-else>
      <div class="stat-grid" v-loading="loading">
        <div class="stat-card">
          <span class="stat-value">{{ summary?.totalProducts ?? 0 }}</span>
          <span class="stat-label">{{ t('finance.totalProducts') }}</span>
        </div>
        <div class="stat-card">
          <span class="stat-value">{{ summary?.completeCount ?? 0 }}</span>
          <span class="stat-label">{{ t('finance.completeCount') }}</span>
        </div>
        <div class="stat-card warn">
          <span class="stat-value">{{ summary?.missingCostCount ?? 0 }}</span>
          <span class="stat-label">{{ t('finance.missingCostCount') }}</span>
        </div>
        <div class="stat-card">
          <span class="stat-value">{{ summary?.pricedCount ?? 0 }}</span>
          <span class="stat-label">{{ t('finance.pricedCount') }}</span>
        </div>
      </div>

      <div class="currency-grid">
        <section
          v-for="bucket in summary?.currencies ?? []"
          :key="bucket.currency"
          class="currency-card"
        >
          <div class="currency-head">
            <span class="currency-code">{{ bucket.currency }}</span>
            <span class="currency-count">{{ t('finance.count') }} · {{ bucket.count }}</span>
          </div>
          <div class="currency-values">
            <div>
              <span class="value-label">{{ t('finance.revenue') }}</span>
              <span class="value">{{ formatMoney(bucket.revenue, bucket.currency) }}</span>
            </div>
            <div>
              <span class="value-label">{{ t('finance.cost') }}</span>
              <span class="value">{{ formatMoney(bucket.cost, bucket.currency) }}</span>
            </div>
            <div>
              <span class="value-label">{{ t('finance.estimatedProfit') }}</span>
              <span class="value" :class="marginClass(bucket.margin)">
                {{ formatMoney(bucket.profit, bucket.currency) }}
              </span>
            </div>
            <div>
              <span class="value-label">{{ t('finance.margin') }}</span>
              <span class="value" :class="marginClass(bucket.margin)">
                {{ formatPercent(bucket.margin) }}
              </span>
            </div>
          </div>
        </section>
      </div>

      <div v-if="!hasComplete" class="empty-inline">
        {{ t('finance.noDataHint') }}
      </div>

      <section v-if="hasComplete" class="finance-panel">
        <div class="panel-head">
          <h2 class="panel-title">{{ t('finance.worst') }}</h2>
          <span class="panel-hint">{{ t('finance.mixedCurrencyNote') }}</span>
        </div>
        <el-table :data="summary?.worst ?? []" size="small" class="finance-table">
          <el-table-column :label="t('finance.product')" min-width="200" show-overflow-tooltip>
            <template #default="{ row }">{{ productLabel(row) }}</template>
          </el-table-column>
          <el-table-column prop="sku" :label="t('finance.sku')" width="140" show-overflow-tooltip />
          <el-table-column :label="t('finance.price')" width="120" align="right">
            <template #default="{ row }">{{ formatMoney(row.price, row.currency) }}</template>
          </el-table-column>
          <el-table-column :label="t('finance.totalCost')" width="120" align="right">
            <template #default="{ row }">{{ formatMoney(row.totalCost, row.currency) }}</template>
          </el-table-column>
          <el-table-column :label="t('finance.profit')" width="120" align="right">
            <template #default="{ row }">
              <span :class="marginClass(row.margin)">{{ formatMoney(row.profit, row.currency) }}</span>
            </template>
          </el-table-column>
          <el-table-column :label="t('finance.marginCol')" width="130">
            <template #default="{ row }">
              <div class="margin-cell">
                <div class="margin-bar">
                  <span
                    :class="marginClass(row.margin)"
                    :style="{ width: `${Math.max(0, Math.min(100, row.margin))}%` }"
                  />
                </div>
                <span class="margin-value" :class="marginClass(row.margin)">
                  {{ formatPercent(row.margin) }}
                </span>
              </div>
            </template>
          </el-table-column>
        </el-table>
      </section>

      <section v-if="hasComplete" class="finance-panel">
        <div class="panel-head">
          <h2 class="panel-title">{{ t('finance.best') }}</h2>
          <span class="panel-hint">{{ t('finance.mixedCurrencyNote') }}</span>
        </div>
        <el-table :data="summary?.best ?? []" size="small" class="finance-table">
          <el-table-column :label="t('finance.product')" min-width="200" show-overflow-tooltip>
            <template #default="{ row }">{{ productLabel(row) }}</template>
          </el-table-column>
          <el-table-column prop="sku" :label="t('finance.sku')" width="140" show-overflow-tooltip />
          <el-table-column :label="t('finance.price')" width="120" align="right">
            <template #default="{ row }">{{ formatMoney(row.price, row.currency) }}</template>
          </el-table-column>
          <el-table-column :label="t('finance.totalCost')" width="120" align="right">
            <template #default="{ row }">{{ formatMoney(row.totalCost, row.currency) }}</template>
          </el-table-column>
          <el-table-column :label="t('finance.profit')" width="120" align="right">
            <template #default="{ row }">
              <span :class="marginClass(row.margin)">{{ formatMoney(row.profit, row.currency) }}</span>
            </template>
          </el-table-column>
          <el-table-column :label="t('finance.marginCol')" width="130">
            <template #default="{ row }">
              <div class="margin-cell">
                <div class="margin-bar">
                  <span
                    :class="marginClass(row.margin)"
                    :style="{ width: `${Math.max(0, Math.min(100, row.margin))}%` }"
                  />
                </div>
                <span class="margin-value" :class="marginClass(row.margin)">
                  {{ formatPercent(row.margin) }}
                </span>
              </div>
            </template>
          </el-table-column>
        </el-table>
      </section>

      <section v-if="(summary?.incomplete.length ?? 0) > 0" class="finance-panel">
        <div class="panel-head">
          <h2 class="panel-title">{{ t('finance.incomplete') }}</h2>
          <span class="panel-hint">{{ summary?.incomplete.length }} / {{ summary?.missingCostCount }}</span>
        </div>
        <el-table :data="summary?.incomplete ?? []" size="small" class="finance-table">
          <el-table-column :label="t('finance.product')" min-width="220" show-overflow-tooltip>
            <template #default="{ row }">{{ row.name || row.sku || row.id }}</template>
          </el-table-column>
          <el-table-column prop="sku" :label="t('finance.sku')" width="160" show-overflow-tooltip />
          <el-table-column :label="t('finance.price')" width="140" align="right">
            <template #default="{ row }">
              {{ row.price > 0 ? formatMoney(row.price, row.currency) : '—' }}
            </template>
          </el-table-column>
          <el-table-column :label="t('finance.status')" width="200">
            <template #default="{ row }">
              <span class="reason-tag">
                {{ row.reason === 'missing_price' ? t('finance.reasonMissingPrice') : t('finance.reasonMissingCost') }}
              </span>
            </template>
          </el-table-column>
        </el-table>
      </section>
    </template>
  </div>
</template>

<style scoped lang="scss">
.finance-page {
  max-width: 1440px;
}

.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 12px;
}

.page-desc {
  margin: 0;
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 1.6;
}

.page-meta {
  margin: 6px 0 0;
  font-size: 11px;
  color: var(--text-muted);
}

.finance-alert {
  margin-bottom: 16px;
}

.empty-state {
  padding: 56px 20px;
  text-align: center;
  background: var(--bg-card);
  border: 1px dashed var(--border-color);
  border-radius: var(--radius-lg);

  h3 {
    margin: 0 0 8px;
    font-size: 16px;
    color: var(--text-primary);
  }

  p {
    margin: 0 0 16px;
    font-size: 12.5px;
    color: var(--text-muted);
  }
}

.stat-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}

.stat-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 14px 16px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
}

.stat-card.warn .stat-value {
  color: #f59e0b;
}

.stat-value {
  font-family: var(--font-mono);
  font-size: 22px;
  color: var(--text-primary);
}

.stat-label {
  font-size: 11.5px;
  color: var(--text-muted);
}

.currency-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}

.currency-card {
  padding: 14px 16px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
}

.currency-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 10px;
}

.currency-code {
  font-family: var(--font-mono);
  font-size: 14px;
  color: var(--accent);
}

.currency-count {
  font-size: 11px;
  color: var(--text-muted);
}

.currency-values {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px 16px;

  > div {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
}

.value-label {
  font-size: 10.5px;
  color: var(--text-muted);
}

.value {
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--text-primary);
}

.finance-panel {
  padding: 16px;
  margin-bottom: 14px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
}

.panel-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.panel-title {
  margin: 0;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
}

.panel-hint {
  font-size: 10.5px;
  color: var(--text-muted);
}

.finance-table {
  background: transparent;
}

.empty-inline {
  padding: 18px;
  margin-bottom: 14px;
  font-size: 12px;
  color: var(--text-muted);
  text-align: center;
  border: 1px dashed var(--border-color);
  border-radius: var(--radius-md);
}

.margin-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}

.margin-bar {
  flex: 1;
  height: 4px;
  overflow: hidden;
  background: var(--bg-secondary);
  border-radius: 999px;

  span {
    display: block;
    height: 100%;
    border-radius: 999px;
    background: currentColor;
  }
}

.margin-value {
  width: 46px;
  text-align: right;
  font-family: var(--font-mono);
  font-size: 11px;
}

.negative {
  color: #ef4444;
}

.low {
  color: #f59e0b;
}

.medium {
  color: #38bdf8;
}

.good {
  color: #22c55e;
}

.reason-tag {
  padding: 1px 7px;
  font-size: 10.5px;
  color: #f59e0b;
  border: 1px dashed #f59e0b;
  border-radius: 999px;
}

@media (max-width: 900px) {
  .stat-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
