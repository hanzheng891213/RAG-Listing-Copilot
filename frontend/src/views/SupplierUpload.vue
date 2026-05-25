<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import type { UploadInstance, UploadRawFile } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { useSupplierStore } from '@/stores/supplierStore'
import { useFileUpload, UPLOAD_STATUS } from '@/composables/useFileUpload'
import { FILE_ACCEPT_TYPES } from '@/utils/constants'
import SupplierFilePreview from '@/components/supplier/SupplierFilePreview.vue'
import UploadToast from '@/components/upload/UploadToast.vue'
import type { SupplierProduct } from '@/types/supplier'

const { t } = useI18n()
const router = useRouter()
const store = useSupplierStore()
const {
  isDragging,
  status,
  feedback,
  progress,
  handleDragEnter,
  handleDragLeave,
  handleDragOver,
  handleDrop,
  uploadFile,
  clearFeedback,
  reset,
} = useFileUpload()

const uploadRef = ref<UploadInstance>()
const showManualForm = ref(false)
const toastVisible = ref(false)
const toastProps = ref({
  type: 'success' as 'success' | 'error' | 'warning',
  title: '',
  message: '',
  icon: 'CircleCheckFilled',
  autoDismiss: true,
  duration: 5000,
})

function showToast(fb: ReturnType<typeof useFileUpload>['feedback']['value']) {
  if (!fb) {
    toastVisible.value = false
    return
  }
  toastProps.value = { ...fb, duration: 5000 }
  toastVisible.value = true
}

function onToastClosed() {
  toastVisible.value = false
  clearFeedback()
}

const pageRef = ref<HTMLElement | null>(null)

onMounted(() => {
  document.addEventListener('dragenter', handleDragEnter)
  document.addEventListener('dragleave', handleDragLeave)
  document.addEventListener('dragover', handleDragOver)
  document.addEventListener('drop', onPageDrop)

  if (store.pendingFile) {
    const file = store.pendingFile
    store.setPendingFile(null)
    handleFileProcess(file as unknown as UploadRawFile)
  }
})

onUnmounted(() => {
  document.removeEventListener('dragenter', handleDragEnter)
  document.removeEventListener('dragleave', handleDragLeave)
  document.removeEventListener('dragover', handleDragOver)
  document.removeEventListener('drop', onPageDrop)
})

function onPageDrop(e: DragEvent) {
  const file = handleDrop(e)
  if (file) {
    handleFileProcess(file as unknown as UploadRawFile)
  }
}

const manualForm = ref({
  title: '',
  description: '',
  price: null as number | null,
  category: '',
  specsText: '',
})

async function handleFileChange(file: UploadRawFile) {
  handleFileProcess(file)
  return false
}

async function handleFileProcess(file: UploadRawFile) {
  const result = await uploadFile(file as unknown as File)

  if (feedback.value) {
    showToast(feedback.value)
  }

  if (result && result.products.length > 0) {
    store.setProducts(result.products)
    store.parseErrors = result.errors
    store.currentFileName = result.fileName
    store.toggleSelectAll()
    router.push('/listing-generator')
  } else if (result && result.products.length === 0 && result.errors.length > 0) {
    store.parseErrors = result.errors
    store.currentFileName = result.fileName
    result.errors.forEach((e) => ElMessage.warning(`Row ${e.row}: ${e.message}`))
  }
}

function handleManualSubmit() {
  if (!manualForm.value.title.trim()) {
    ElMessage.warning(t('supplier.productTitleRequired'))
    return
  }
  const rawData: Record<string, string> = {
    title: manualForm.value.title.trim(),
    description: manualForm.value.description.trim(),
    category: manualForm.value.category.trim(),
    price: manualForm.value.price != null ? String(manualForm.value.price) : '',
  }
  if (manualForm.value.specsText.trim()) {
    manualForm.value.specsText.split('\n').filter(Boolean).forEach((line) => {
      const [key, ...val] = line.split(':')
      if (key && val.length) rawData[key.trim()] = val.join(':').trim()
    })
  }
  store.addManualProduct({ rawData })
  ElMessage.success(t('supplier.productAdded'))
  manualForm.value = { title: '', description: '', price: null, category: '', specsText: '' }
  showManualForm.value = false
}
</script>

<template>
  <div ref="pageRef" class="supplier-upload-page" :class="{ 'drag-active': isDragging }">
    <div class="page-header">
      <div>
        <h1 class="page-title">{{ t('supplier.title') }}</h1>
        <p class="page-desc">{{ t('supplier.description') }}</p>
      </div>
      <div class="header-actions">
        <el-button v-if="store.hasProducts" type="danger" text @click="store.clearAll()">{{ t('supplier.clearAll') }}</el-button>
        <el-button @click="showManualForm = !showManualForm">
          <el-icon><Edit /></el-icon>
          {{ showManualForm ? t('common.cancel') : t('supplier.manualInput') }}
        </el-button>
        <el-button type="primary" :disabled="store.selectedIds.size === 0" @click="$router.push('/listing-generator')">
          <el-icon><MagicStick /></el-icon>
          {{ t('supplier.generateListing') }} ({{ store.selectedIds.size }})
        </el-button>
      </div>
    </div>

    <div v-if="!store.hasProducts && !showManualForm" class="upload-section">
      <el-upload
        ref="uploadRef"
        class="upload-zone"
        drag
        :auto-upload="false"
        :accept="FILE_ACCEPT_TYPES"
        :show-file-list="false"
        :before-upload="handleFileChange"
      >
        <div class="upload-content">
          <div class="upload-icon">
            <el-icon :size="48"><UploadFilled /></el-icon>
          </div>
          <h3>{{ t('supplier.dropHere') }}</h3>
          <p>{{ t('supplier.supportsFormats') }}</p>
          <p class="upload-hint">{{ t('supplier.uploadHint') }}</p>
        </div>
      </el-upload>
    </div>

    <div v-if="showManualForm" class="manual-form">
      <div class="form-card">
        <h3 class="form-title">{{ t('supplier.manualTitle') }}</h3>
        <div class="form-grid">
          <div class="form-field"><label>{{ t('supplier.productTitle') }} *</label><el-input v-model="manualForm.title" /></div>
          <div class="form-field"><label>{{ t('supplier.price') }}</label><el-input-number v-model="manualForm.price" :min="0" :precision="2" style="width:100%" /></div>
          <div class="form-field full-width"><label>{{ t('supplier.productDescription') }}</label><el-input v-model="manualForm.description" type="textarea" :rows="3" :placeholder="t('supplier.productDescription')" /></div>
          <div class="form-field"><label>{{ t('supplier.category') }}</label><el-input v-model="manualForm.category" :placeholder="t('supplier.categoryPlaceholder')" /></div>
          <div class="form-field full-width"><label>{{ t('supplier.specifications') }}</label><el-input v-model="manualForm.specsText" type="textarea" :rows="4" :placeholder="t('supplier.specsPlaceholder')" /></div>
        </div>
        <div class="form-actions">
          <el-button @click="showManualForm = false">{{ t('common.cancel') }}</el-button>
          <el-button type="primary" @click="handleManualSubmit">{{ t('supplier.addProduct') }}</el-button>
        </div>
      </div>
    </div>

    <SupplierFilePreview v-if="store.hasProducts" />

    <div v-if="status === UPLOAD_STATUS.UPLOADING || status === UPLOAD_STATUS.PARSING" class="parsing-overlay">
      <el-icon class="spinner" :size="32"><Loading /></el-icon>
      <div class="uploading-info">
        <span class="uploading-label">{{ status === UPLOAD_STATUS.UPLOADING ? '上传中...' : '解析中...' }}</span>
        <div v-if="status === UPLOAD_STATUS.UPLOADING" class="progress-bar">
          <div class="progress-fill" :style="{ width: progress + '%' }" />
        </div>
      </div>
    </div>

    <div v-if="isDragging" class="drag-overlay">
      <div class="drag-hint">
        <el-icon :size="56"><UploadFilled /></el-icon>
        <span>释放文件以上传</span>
      </div>
    </div>

    <UploadToast
      :visible="toastVisible"
      :type="toastProps.type"
      :title="toastProps.title"
      :message="toastProps.message"
      :icon="toastProps.icon"
      :auto-dismiss="toastProps.autoDismiss"
      :duration="toastProps.duration"
      @close="onToastClosed"
    />
  </div>
</template>

<style scoped>
.supplier-upload-page {
  max-width: 1200px;
  min-height: calc(100vh - 120px);
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 32px;
  gap: 20px;
  flex-wrap: wrap;
}

.page-title {
  font-size: 28px;
  font-weight: 400;
  margin-bottom: 8px;
}

.page-desc {
  color: var(--text-secondary);
  font-size: 15px;
  max-width: 560px;
  line-height: 1.6;
}

.header-actions {
  display: flex;
  gap: 10px;
  flex-shrink: 0;
}

.upload-section {
  margin-bottom: 32px;
}

.upload-zone {
  width: 100%;
}

.upload-zone :deep(.el-upload-dragger) {
  background: var(--bg-card);
  border: 2px dashed var(--border-light);
  border-radius: var(--radius-lg);
  padding: 60px 40px;
  transition: all var(--transition-base);
}

.upload-zone :deep(.el-upload-dragger:hover) {
  border-color: var(--accent);
  box-shadow: 0 0 30px var(--accent-glow);
  background: var(--bg-card-hover);
}

.drag-active .upload-zone :deep(.el-upload-dragger) {
  border-color: var(--accent);
  box-shadow: 0 0 40px var(--accent-glow-strong);
  background: var(--bg-card-hover);
}

.upload-content {
  text-align: center;
}

.upload-icon {
  color: var(--accent-dim);
  margin-bottom: 20px;
}

.upload-content h3 {
  font-family: var(--font-body);
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 10px;
}

.upload-content p {
  color: var(--text-secondary);
  font-size: 14px;
}

.upload-hint {
  margin-top: 16px;
  font-size: 13px !important;
  color: var(--text-muted) !important;
}

.manual-form {
  margin-bottom: 32px;
}

.form-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: 28px;
}

.form-title {
  font-family: var(--font-body);
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 24px;
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-field.full-width {
  grid-column: 1 / -1;
}

.form-field label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 24px;
  padding-top: 20px;
  border-top: 1px solid var(--border-color);
}

.parsing-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 20px;
  z-index: 200;
  backdrop-filter: blur(8px);
}

.spinner {
  animation: spin 1s linear infinite;
}

.uploading-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.uploading-label {
  color: var(--text-primary);
  font-size: 16px;
}

.progress-bar {
  width: 200px;
  height: 4px;
  background: var(--border-light);
  border-radius: 2px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: var(--accent);
  border-radius: 2px;
  transition: width 0.3s ease;
}

.drag-overlay {
  position: fixed;
  inset: 0;
  background: rgba(32, 64, 53, 0.85);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 300;
  border: 3px dashed var(--accent);
  margin: 12px;
  border-radius: var(--radius-lg);
}

.drag-hint {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  color: var(--accent);
  font-size: 20px;
  font-weight: 600;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@media (max-width: 768px) {
  .page-header { flex-direction: column; }
  .header-actions { width: 100%; justify-content: flex-end; }
  .form-grid { grid-template-columns: 1fr; }
}
</style>
