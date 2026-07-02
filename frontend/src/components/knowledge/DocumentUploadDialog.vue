<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import type { KnowledgeCategory } from '@/types/knowledge'
import { KNOWLEDGE_CATEGORIES, PLATFORMS } from '@/utils/constants'
import { useKnowledgeStore } from '@/stores/knowledgeStore'

const props = defineProps<{ visible: boolean }>()
const emit = defineEmits<{ 'update:visible': [value: boolean] }>()

const { t } = useI18n()
const knowledgeStore = useKnowledgeStore()

const form = ref({
  title: '',
  category: 'platform_rules' as KnowledgeCategory,
  platform: '',
  tags: [] as string[],
  description: '',
  content: '',
  file: null as File | null,
})

const tagInput = ref('')
const isUploading = ref(false)

function addTag() {
  const tag = tagInput.value.trim().toLowerCase()
  if (tag && !form.value.tags.includes(tag)) form.value.tags.push(tag)
  tagInput.value = ''
}

function removeTag(tag: string) {
  form.value.tags = form.value.tags.filter((t) => t !== tag)
}

function handleFileChange(file: File) {
  form.value.file = file
  if (!form.value.title) form.value.title = file.name.replace(/\.[^/.]+$/, '')
}

async function handleSubmit() {
  if (!form.value.title.trim()) {
    ElMessage.warning(t('knowledge.docTitleRequired'))
    return
  }

  isUploading.value = true
  try {
    const success = await knowledgeStore.uploadToServer({
      title: form.value.title.trim(),
      category: form.value.category,
      platform: form.value.platform || undefined,
      tags: form.value.tags,
      content: form.value.content || form.value.description,
      file: form.value.file || undefined,
    })

    if (success) {
      ElMessage.success(t('knowledge.uploaded'))
    } else {
      // Fallback: add locally
      knowledgeStore.addDocument({
        title: form.value.title.trim(),
        category: form.value.category,
        tags: form.value.tags,
        excerpt: form.value.description.trim() || form.value.content?.slice(0, 200) || '',
        content: form.value.content || '',
        platform: form.value.platform || undefined,
        fileType: form.value.file?.name.split('.').pop() || 'txt',
        fileSize: form.value.file?.size || 0,
        chunkCount: 1,
        uploadedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      ElMessage.success(t('knowledge.uploadedLocal'))
    }
  } catch (err) {
    ElMessage.error(t('knowledge.uploadFailed'))
  } finally {
    isUploading.value = false
    form.value = { title: '', category: 'platform_rules', platform: '', tags: [], description: '', content: '', file: null }
    emit('update:visible', false)
  }
}
</script>

<template>
  <el-dialog :model-value="visible" :title="t('knowledge.uploadTitle')" width="560px" destroy-on-close @close="emit('update:visible', false)">
    <div class="upload-form">
      <div class="form-field"><label>{{ t('knowledge.docTitle') }} *</label><el-input v-model="form.title" :placeholder="t('knowledge.docTitlePlaceholder')" /></div>
      <div class="form-row">
        <div class="form-field"><label>{{ t('knowledge.categoryLabel') }}</label>
          <el-select v-model="form.category" style="width:100%"><el-option v-for="cat in KNOWLEDGE_CATEGORIES" :key="cat.value" :label="t('knowledge.tabs.' + (cat.value === 'platform_rules' ? 'platformRules' : cat.value === 'templates' ? 'templates' : 'history'))" :value="cat.value" /></el-select>
        </div>
        <div class="form-field"><label>{{ t('knowledge.platform') }}</label>
          <el-select v-model="form.platform" :placeholder="t('common.back')" clearable style="width:100%"><el-option v-for="p in PLATFORMS" :key="p.value" :label="p.label" :value="p.value" /></el-select>
        </div>
      </div>
      <div class="form-field"><label>{{ t('knowledge.tags') }}</label>
        <div class="tag-input-row"><el-input v-model="tagInput" :placeholder="t('knowledge.tagPlaceholder')" @keyup.enter="addTag" /><el-button @click="addTag" :disabled="!tagInput.trim()">{{ t('knowledge.addTag') }}</el-button></div>
        <div v-if="form.tags.length > 0" class="tag-list"><el-tag v-for="tag in form.tags" :key="tag" closable size="small" @close="removeTag(tag)">{{ tag }}</el-tag></div>
      </div>
      <div class="form-field"><label>{{ t('knowledge.excerpt') }}</label><el-input v-model="form.description" type="textarea" :rows="2" :placeholder="t('knowledge.excerptPlaceholder')" /></div>
      <div class="form-field"><label>{{ t('knowledge.content') }}</label><el-input v-model="form.content" type="textarea" :rows="4" :placeholder="t('knowledge.contentPlaceholder')" /></div>
      <div class="form-field"><label>{{ t('knowledge.file') }}</label>
        <el-upload :auto-upload="false" :show-file-list="true" :limit="1" :on-change="(f: any) => handleFileChange(f.raw)" drag><el-icon><UploadFilled /></el-icon><span>{{ t('knowledge.dropFile') }}</span></el-upload>
      </div>
    </div>
    <template #footer>
      <el-button @click="emit('update:visible', false)">{{ t('common.cancel') }}</el-button>
      <el-button type="primary" :loading="isUploading" @click="handleSubmit">{{ isUploading ? t('knowledge.uploading') : t('common.upload') }}</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.upload-form { display: flex; flex-direction: column; gap: 20px; }
.form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
.form-field { display: flex; flex-direction: column; gap: 8px; }
.form-field label { font-size: 13px; font-weight: 500; color: var(--text-secondary); }
.tag-input-row { display: flex; gap: 8px; }
.tag-list { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 4px; }

@media (max-width: 768px) {
  .form-row { grid-template-columns: 1fr; }
  .upload-form { gap: 16px; }
}
</style>
