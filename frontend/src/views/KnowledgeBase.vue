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
        <h1 class="page-title">{{ t('knowledge.title') }}</h1>
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

<style scoped>
.knowledge-base-page { max-width: 1200px; }
.page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; gap: 20px; flex-wrap: wrap; }
.page-title { font-size: 28px; font-weight: 400; margin-bottom: 8px; }
.page-desc { color: var(--text-secondary); font-size: 15px; max-width: 560px; line-height: 1.6; }
.header-actions { flex-shrink: 0; display: flex; align-items: center; gap: 12px; }
.sync-indicator { font-size: 13px; color: var(--text-muted); display: flex; align-items: center; gap: 4px; }
.sync-indicator.synced { color: var(--success); }
.spin { animation: spin 1s linear infinite; }
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
.toolbar { display: flex; gap: 16px; margin-bottom: 24px; flex-wrap: wrap; align-items: center; }
.search-bar { flex: 1; min-width: 260px; }
.platform-filters { display: flex; gap: 8px; flex-wrap: wrap; }
.tabs { display: flex; gap: 4px; margin-bottom: 28px; border-bottom: 1px solid var(--border-color); padding-bottom: 0; }
.tab { display: flex; align-items: center; gap: 8px; padding: 12px 24px; border: none; background: transparent; color: var(--text-secondary); font-family: var(--font-body); font-size: 14px; font-weight: 500; cursor: pointer; transition: all var(--transition-fast); border-bottom: 2px solid transparent; margin-bottom: -1px; }
.tab:hover { color: var(--text-primary); }
.tab.active { color: var(--accent); border-bottom-color: var(--accent); }
.tab-count { font-size: 12px; background: var(--bg-secondary); color: var(--text-muted); padding: 2px 8px; border-radius: 10px; min-width: 24px; text-align: center; }
.tab.active .tab-count { background: var(--accent-glow); color: var(--accent); }
.doc-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px; grid-auto-flow: dense; }
.empty-state { text-align: center; padding: 80px 20px; color: var(--text-muted); }
.empty-state h3 { font-family: var(--font-body); font-size: 18px; margin: 16px 0 8px; color: var(--text-secondary); }
.empty-state p { font-size: 14px; }
.doc-detail { display: flex; flex-direction: column; gap: 16px; }
.doc-meta { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.doc-date { font-size: 13px; color: var(--text-muted); }
.doc-tags { display: flex; gap: 6px; flex-wrap: wrap; }
.doc-body { background: var(--bg-secondary); border-radius: var(--radius-md); padding: 24px; font-size: 14px; line-height: 1.8; color: var(--text-primary); max-height: 60vh; overflow-y: auto; }
.doc-body h1, .doc-body h2, .doc-body h3 { margin: 1.2em 0 0.6em; }
.doc-body h1 { font-size: 22px; }
.doc-body h2 { font-size: 18px; border-bottom: 1px solid var(--border-color); padding-bottom: 6px; }
.doc-body h3 { font-size: 16px; }
.doc-body p { margin: 0.6em 0; }
.doc-body table { border-collapse: collapse; width: 100%; margin: 12px 0; font-size: 13px; }
.doc-body th, .doc-body td { border: 1px solid var(--border-color); padding: 8px 12px; text-align: left; }
.doc-body th { background: var(--bg-card); font-weight: 600; }
.doc-body code { background: var(--bg-card); padding: 2px 6px; border-radius: 4px; font-size: 13px; }
.doc-body pre { background: var(--bg-card); padding: 16px; border-radius: var(--radius-md); overflow-x: auto; }
.doc-body ul, .doc-body ol { padding-left: 24px; margin: 8px 0; }
.doc-body li { margin: 4px 0; }
.doc-body blockquote { border-left: 3px solid var(--accent-dim); padding-left: 16px; margin: 12px 0; color: var(--text-secondary); }
.doc-body a { color: var(--accent); text-decoration: underline; }
.doc-body hr { border: none; border-top: 1px solid var(--border-color); margin: 20px 0; }
.doc-loading { display: flex; align-items: center; gap: 10px; padding: 40px; justify-content: center; color: var(--text-muted); }
.spin { animation: spin 1s linear infinite; }
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
.doc-file-info { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text-muted); }
@media (max-width: 768px) { .page-header { flex-direction: column; } .tabs { overflow-x: auto; } .tab { padding: 10px 16px; white-space: nowrap; } .doc-grid { grid-template-columns: 1fr; } }
</style>
