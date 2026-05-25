<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { ComplianceResult } from '@/types/listing'

defineProps<{ results: ComplianceResult[] }>()
const { t } = useI18n()

function severityIcon(severity: string) {
  switch (severity) { case 'error': return 'CircleCloseFilled'; case 'warning': return 'WarningFilled'; default: return 'CircleCheckFilled' }
}
function severityColor(severity: string) {
  switch (severity) { case 'error': return 'var(--danger)'; case 'warning': return 'var(--warning)'; default: return 'var(--success)' }
}
</script>

<template>
  <div class="compliance-panel">
    <h3 class="panel-title">{{ t('listing.compliance') }}</h3>
    <div class="compliance-list">
      <div v-for="(item, i) in results" :key="i" class="compliance-item" :class="{ passed: item.passed, failed: !item.passed }">
        <el-icon :size="18" :style="{ color: severityColor(item.severity) }"><component :is="severityIcon(item.severity)" /></el-icon>
        <div class="compliance-info">
          <span class="compliance-rule">{{ item.rule }}</span>
          <span class="compliance-msg">{{ item.message }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.compliance-panel { display: flex; flex-direction: column; gap: 16px; margin-bottom: 24px; }
.panel-title { font-family: var(--font-body); font-size: 15px; font-weight: 600; color: var(--text-primary); }
.compliance-list { display: flex; flex-direction: column; gap: 8px; }
.compliance-item { display: flex; gap: 12px; padding: 12px; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-md); align-items: flex-start; transition: all var(--transition-fast); }
.compliance-item.passed { border-left: 3px solid var(--success); }
.compliance-item.failed { border-left: 3px solid var(--warning); }
.compliance-info { display: flex; flex-direction: column; gap: 4px; }
.compliance-rule { font-size: 13px; font-weight: 500; color: var(--text-primary); }
.compliance-msg { font-size: 12px; color: var(--text-muted); line-height: 1.5; }
</style>
