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

<style scoped lang="scss">
@use '../../styles/components/listing/compliance-panel.scss' as *;
</style>
