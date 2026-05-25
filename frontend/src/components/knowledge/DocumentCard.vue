<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { KnowledgeDocument } from '@/types/knowledge'
import { formatFileSize, truncate } from '@/utils/formatters'
import dayjs from 'dayjs'

const props = defineProps<{ document: KnowledgeDocument }>()
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
      <el-button
        class="delete-btn"
        text
        size="small"
        type="danger"
        @click.stop="$emit('delete')"
      >
        <el-icon><Delete /></el-icon>
      </el-button>
    </div>
  </div>
</template>

<style scoped>
.doc-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: 24px;
  cursor: pointer;
  transition: all var(--transition-base);
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.doc-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 2px;
  background: linear-gradient(to right, transparent, var(--accent-dim), transparent);
  transform: translateX(-100%);
  transition: transform 0.6s;
}

.doc-card:hover::before {
  transform: translateX(0);
}

.doc-card:hover {
  border-color: var(--accent-dim);
  background: var(--bg-card-hover);
  transform: translateY(-2px);
  box-shadow: 0 8px 30px var(--shadow-color);
}

.doc-card-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.doc-icon {
  color: var(--accent-dim);
  font-size: 22px;
}

.doc-badges {
  display: flex;
  gap: 6px;
}

.doc-title {
  font-family: var(--font-body);
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.4;
}

.doc-excerpt {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.6;
  flex: 1;
}

.doc-tags {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  align-items: center;
}

.more-tags {
  font-size: 12px;
  color: var(--text-muted);
}

.doc-footer {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid var(--border-color);
}

.doc-meta {
  font-size: 12px;
  color: var(--text-muted);
}

.delete-btn {
  margin-left: auto;
  opacity: 0;
  transition: opacity var(--transition-fast);
}

.doc-card:hover .delete-btn {
  opacity: 1;
}
</style>
