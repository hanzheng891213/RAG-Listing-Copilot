<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import type { GeneratedListing } from '@/types/listing'

const props = defineProps<{ listing: GeneratedListing }>()
defineEmits<{ regenerate: []; export: [format: 'csv' | 'json'] }>()

const { t } = useI18n()

function copyAll() {
  const text = [
    `Title: ${props.listing.title}`,
    '',
    'Bullet Points:',
    ...props.listing.bulletPoints.map((b, i) => `${i + 1}. ${b}`),
    '',
    'Keywords:',
    props.listing.keywords.join(', '),
  ].join('\n')
  navigator.clipboard.writeText(text)
  ElMessage.success(t('listing.copied'))
}
</script>

<template>
  <div class="export-bar">
    <div class="export-info">
      <span class="version">{{ t('listing.version', { version: listing.version }) }}</span>
      <span class="platform-badge">{{ listing.platform }}</span>
      <span class="template-label">{{ listing.template }}</span>
    </div>
    <div class="export-actions">
      <el-button size="small" @click="copyAll()"><el-icon><CopyDocument /></el-icon>{{ t('listing.copyAll') }}</el-button>
      <el-button size="small" @click="$emit('regenerate')"><el-icon><Refresh /></el-icon>{{ t('common.regenerate') }}</el-button>
      <el-dropdown trigger="click" @command="(fmt: string) => $emit('export', fmt as 'csv' | 'json')">
        <el-button size="small" type="primary"><el-icon><Download /></el-icon>{{ t('common.export') }}<el-icon><ArrowDown /></el-icon></el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="csv">{{ t('listing.exportCSV') }}</el-dropdown-item>
            <el-dropdown-item command="json">{{ t('listing.exportJSON') }}</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>
  </div>
</template>

<style scoped>
.export-bar { display: flex; justify-content: space-between; align-items: center; margin-top: 24px; padding-top: 20px; border-top: 1px solid var(--border-color); flex-wrap: wrap; gap: 12px; }
.export-info { display: flex; align-items: center; gap: 10px; }
.version { font-family: var(--font-mono); font-size: 12px; color: var(--text-muted); background: var(--bg-secondary); padding: 2px 8px; border-radius: 4px; }
.platform-badge { font-size: 12px; color: var(--accent); background: var(--accent-glow); padding: 2px 10px; border-radius: 10px; font-weight: 500; text-transform: capitalize; }
.template-label { font-size: 12px; color: var(--text-muted); }
.export-actions { display: flex; gap: 8px; }
</style>
