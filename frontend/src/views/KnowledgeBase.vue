<script setup lang="ts">
import { ref, watch, onMounted, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { marked } from 'marked'
import { useKnowledgeBase } from '@/composables/useKnowledgeBase'
import { useDebounce } from '@/composables/useDebounce'
import { useAuthStore } from '@/stores/authStore'
import { KNOWLEDGE_CATEGORIES, PLATFORMS } from '@/utils/constants'
import DocumentCard from '@/components/knowledge/DocumentCard.vue'
import DocumentUploadDialog from '@/components/knowledge/DocumentUploadDialog.vue'

const { t } = useI18n()
const auth = useAuthStore()
const { store, uploadDialogVisible, viewDocument, selectedDoc, detailVisible, contentLoading, formatDocDate } = useKnowledgeBase()

function renderMarkdown(content: string): string {
  if (!content) return ''
  try {
    return marked.parse(content, { async: false }) as string
  } catch {
    return content
  }
}

onMounted(() => {
  store.fetchFromServer()
})

// ── 防抖搜索：输入停顿 300ms 后才更新 store，避免频繁过滤 ──
const searchInput = ref('')
const debouncedSearch = useDebounce(searchInput, 300)
watch(debouncedSearch, (val) => {
  store.searchQuery = val
})

onMounted(() => {
  store.fetchFromServer()
})

const categoryTagTypes: Record<string, 'danger' | 'success' | 'info'> = {
  platform_rules: 'danger', templates: 'success', history: 'info',
}

const tabKeys: Record<string, string> = {
  platform_rules: 'knowledge.tabs.platformRules',
  templates: 'knowledge.tabs.templates',
  history: 'knowledge.tabs.history',
}
</script>

<template>
  <div class="knowledge-base-page">
    <div class="page-header">
      <div>
        <p class="page-desc">{{ t('knowledge.description') }}</p>
      </div>
      <div class="header-actions">
        <span v-if="store.isLoading" class="sync-indicator">
          <el-icon class="spin"><Loading /></el-icon> {{ t('knowledge.syncing') }}
        </span>
        <span v-else-if="store.serverAvailable" class="sync-indicator synced">
          <el-icon><CircleCheck /></el-icon> {{ t('knowledge.synced') }}
        </span>
        <el-button v-if="auth.isAdmin" type="primary" @click="uploadDialogVisible = true">
          <el-icon><Upload /></el-icon>
          {{ t('knowledge.uploadDoc') }}
        </el-button>
      </div>
    </div>

    <div class="toolbar">
      <div class="search-bar">
        <el-input v-model="searchInput" :placeholder="t('knowledge.searchPlaceholder')" clearable size="large">
          <template #prefix><el-icon><Search /></el-icon></template>
        </el-input>
      </div>
      <div class="platform-filters">
        <el-button v-for="p in PLATFORMS" :key="p.value" :type="store.activePlatform === p.value ? 'primary' : 'default'" size="small" round @click="store.setPlatform(p.value)">{{ p.label }}</el-button>
      </div>
    </div>

    <div class="tabs">
      <button v-for="cat in KNOWLEDGE_CATEGORIES" :key="cat.value" class="tab" :class="{ active: store.activeTab === cat.value }" @click="store.setTab(cat.value)">
        <span class="tab-label">{{ t(tabKeys[cat.value]) }}</span>
        <span class="tab-count">{{ store.tabCounts[cat.value] }}</span>
      </button>
    </div>

    <div v-if="store.filteredDocuments.length > 0" class="doc-grid">
      <DocumentCard v-for="doc in store.filteredDocuments" :key="doc.id" :document="doc" :can-delete="auth.isAdmin" @click="viewDocument(doc)" @delete="store.removeDocument(doc.id)" />
    </div>

    <div v-else class="empty-state">
      <el-icon :size="48"><FolderOpened /></el-icon>
      <h3>{{ t('knowledge.noResults') }}</h3>
      <p v-if="store.searchQuery">{{ t('knowledge.noResultsSearch', { query: store.searchQuery }) }}</p>
      <p v-else>{{ t('knowledge.noResultsEmpty') }}</p>
    </div>

    <DocumentUploadDialog v-model:visible="uploadDialogVisible" />

    <el-dialog v-if="selectedDoc" v-model="detailVisible" :title="selectedDoc.title" width="800px" destroy-on-close top="5vh">
      <div class="doc-detail">
        <div class="doc-meta">
          <el-tag :type="categoryTagTypes[selectedDoc.category]" size="small">{{ t(tabKeys[selectedDoc.category]) }}</el-tag>
          <el-tag v-if="selectedDoc.platform" size="small" type="info">{{ selectedDoc.platform }}</el-tag>
          <span class="doc-date">{{ formatDocDate(selectedDoc.updatedAt) }}</span>
        </div>
        <div class="doc-tags">
          <el-tag v-for="tag in selectedDoc.tags" :key="tag" size="small" effect="plain">{{ tag }}</el-tag>
        </div>
        <div v-if="contentLoading" class="doc-loading">
          <el-icon class="spin"><Loading /></el-icon>
          <span>加载文档内容...</span>
        </div>
        <div v-else class="doc-body" v-html="renderMarkdown(selectedDoc.content || selectedDoc.excerpt)" />
        <div class="doc-file-info">
          <el-icon><Document /></el-icon>
          <span>{{ selectedDoc.fileType.toUpperCase() }}</span><span>·</span>
          <span>{{ (selectedDoc.fileSize / 1024).toFixed(1) }} KB</span>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/components/views/knowledge-base.scss' as *;
</style>
