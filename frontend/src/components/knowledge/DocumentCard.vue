<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { KnowledgeDocument } from '@/types/knowledge'
import { formatFileSize, truncate } from '@/utils/formatters'
import dayjs from 'dayjs'
import ConfirmButton from '@/components/common/ConfirmButton.vue'

const props = defineProps<{ document: KnowledgeDocument; canDelete?: boolean }>()
defineEmits<{ click: []; delete: [] }>()

const { t, locale } = useI18n()

const categoryLabelKeys: Record<string, string> = {
  platform_rules: 'knowledge.tabs.platformRules',
  templates: 'knowledge.tabs.templates',
  history: 'knowledge.tabs.history',
}

const categoryTagTypes: Record<string, 'danger' | 'success' | 'info'> = {
  platform_rules: 'danger',
  templates: 'success',
  history: 'info',
}

const formattedDate = computed(() => {
  const d = dayjs(props.document.updatedAt)
  if (locale.value === 'zh') {
    return d.format('YYYY年M月D日')
  }
  return d.format('MMM DD, YYYY')
})
</script>

<template>
  <div class="doc-card" @click="$emit('click')">
    <div class="doc-card-top">
      <div class="doc-icon">
        <el-icon><Document /></el-icon>
      </div>
      <div class="doc-badges">
        <el-tag
          :type="categoryTagTypes[document.category]"
          size="small"
          effect="dark"
        >
          {{ t(categoryLabelKeys[document.category]) }}
        </el-tag>
        <el-tag
          v-if="document.platform"
          size="small"
          effect="plain"
        >
          {{ document.platform }}
        </el-tag>
      </div>
    </div>

    <h3 class="doc-title">{{ truncate(document.title, 64) }}</h3>
    <p class="doc-excerpt">{{ truncate(document.excerpt, 120) }}</p>

    <div class="doc-tags">
      <el-tag
        v-for="tag in document.tags.slice(0, 3)"
        :key="tag"
        size="small"
        effect="plain"
      >
        {{ tag }}
      </el-tag>
      <span v-if="document.tags.length > 3" class="more-tags">
        +{{ document.tags.length - 3 }}
      </span>
    </div>

    <div class="doc-footer">
      <span class="doc-meta">{{ formatFileSize(document.fileSize) }}</span>
      <span class="doc-meta">·</span>
      <span class="doc-meta">{{ formattedDate }}</span>
      <ConfirmButton
        v-if="canDelete"
        class="delete-btn"
        text
        size="small"
        type="danger"
        :confirm-title="t('common.confirmTitle')"
        :confirm-message="t('knowledge.confirmDelete')"
        @click.stop="$emit('delete')"
      >
        <el-icon><Delete /></el-icon>
      </ConfirmButton>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '../../styles/components/knowledge/document-card.scss' as *;
</style>
