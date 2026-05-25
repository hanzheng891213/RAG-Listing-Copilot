import { ref } from 'vue'
import axios from 'axios'
import type { SupplierProduct, ParseResult, ParseError } from '@/types/supplier'
import { uploadSupplier } from '@/api/supplier'

export const UPLOAD_STATUS = {
  IDLE: 'idle',
  VALIDATING: 'validating',
  CHECKING_BACKEND: 'checking_backend',
  UPLOADING: 'uploading',
  PARSING: 'parsing',
  SUCCESS: 'success',
  ERROR: 'error',
} as const

export type UploadStatus = (typeof UPLOAD_STATUS)[keyof typeof UPLOAD_STATUS]

export interface UploadLogEntry {
  timestamp: string
  fileName: string
  fileSize: number
  fileType: string
  status: 'success' | 'failure'
  errorCode?: string
  errorMessage?: string
  durationMs: number
}

export interface UploadFeedback {
  type: 'success' | 'error' | 'warning'
  title: string
  message: string
  icon: string
  autoDismiss: boolean
}

const ALLOWED_EXTENSIONS = ['.csv', '.xlsx', '.xls', '.txt']
const ALLOWED_MIME_TYPES = [
  'text/csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/plain',
]
const MAX_FILE_SIZE = 10 * 1024 * 1024
const BACKEND_HEALTH_URL = 'http://localhost:3001/health'
const BACKEND_API_URL = 'http://localhost:3001/api'
const UPLOAD_TIMEOUT_MS = 30000

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function writeLog(entry: UploadLogEntry) {
  const key = 'rag-upload-logs'
  try {
    const existing = JSON.parse(localStorage.getItem(key) || '[]')
    existing.unshift(entry)
    if (existing.length > 100) existing.length = 100
    localStorage.setItem(key, JSON.stringify(existing))
  } catch {
    // silently fail
  }
}

export function useFileUpload() {
  const isDragging = ref(false)
  const dragCounter = ref(0)
  const status = ref<UploadStatus>(UPLOAD_STATUS.IDLE)
  const feedback = ref<UploadFeedback | null>(null)
  const uploadResult = ref<ParseResult | null>(null)
  const progress = ref(0)

  let lastLogEntry: UploadLogEntry | null = null

  function setStatus(newStatus: UploadStatus) {
    status.value = newStatus
  }

  function showFeedback(fb: UploadFeedback) {
    feedback.value = fb
  }

  function clearFeedback() {
    feedback.value = null
  }

  function checkBrowserCompatibility(): boolean {
    if (typeof FileReader === 'undefined' || typeof FormData === 'undefined') {
      showFeedback({
        type: 'error',
        title: '浏览器不兼容',
        message: '当前浏览器不支持拖放上传功能，请使用最新版浏览器',
        icon: 'WarningFilled',
        autoDismiss: false,
      })
      return false
    }
    return true
  }

  function validateFile(file: File): string | null {
    const extension = '.' + (file.name.split('.').pop()?.toLowerCase() ?? '')
    if (!ALLOWED_EXTENSIONS.includes(extension)) {
      return 'format'
    }
    if (file.size > MAX_FILE_SIZE) {
      return 'size'
    }
    return null
  }

  function getValidationError(code: string, file: File): UploadFeedback {
    switch (code) {
      case 'format':
        return {
          type: 'error',
          title: '格式不兼容',
          message: '文件格式不兼容，请上传支持的文件类型',
          icon: 'DocumentDelete',
          autoDismiss: false,
        }
      case 'size':
        return {
          type: 'error',
          title: '文件过大',
          message: `文件大小超过限制（${formatSize(file.size)} > ${formatSize(MAX_FILE_SIZE)}），请上传更小的文件`,
          icon: 'WarningFilled',
          autoDismiss: false,
        }
      default:
        return {
          type: 'error',
          title: '上传失败',
          message: '文件验证失败，请重试',
          icon: 'CircleCloseFilled',
          autoDismiss: false,
        }
    }
  }

  function getErrorFeedback(error: unknown, file: File): UploadFeedback {
    if (axios.isAxiosError(error)) {
      if (error.code === 'ECONNREFUSED') {
        return {
          type: 'error',
          title: '后端未启动',
          message: '无法连接到后端服务，请在终端执行 npm run dev 启动后端后再试',
          icon: 'MonitorOff',
          autoDismiss: false,
        }
      }

      if (error.code === 'ERR_NETWORK' || error.code === 'ECONNABORTED') {
        if (error.message?.includes('timeout')) {
          return {
            type: 'error',
            title: '上传超时',
            message: '上传请求超时，请检查网络连接后重试',
            icon: 'Clock',
            autoDismiss: false,
          }
        }
        return {
          type: 'error',
          title: '网络异常',
          message: '网络连接异常，请检查网络后重试',
          icon: 'WifiOff',
          autoDismiss: false,
        }
      }

      if (error.response?.status === 404) {
        return {
          type: 'error',
          title: '上传接口缺失',
          message: '后端服务不支持文件上传功能，请检查后端是否正确部署或联系管理员',
          icon: 'Link',
          autoDismiss: false,
        }
      }

      if (error.response?.status === 500 || error.response?.status === 502 || error.response?.status === 503) {
        return {
          type: 'error',
          title: '服务器错误',
          message: '后端服务器处理异常，请稍后重试或联系管理员',
          icon: 'WarningFilled',
          autoDismiss: false,
        }
      }

      if (error.response?.status === 413) {
        return {
          type: 'error',
          title: '文件过大',
          message: `文件大小超过服务器限制，请上传小于 ${formatSize(MAX_FILE_SIZE)} 的文件`,
          icon: 'WarningFilled',
          autoDismiss: false,
        }
      }
      if (error.response?.status === 400) {
        const serverMsg = error.response?.data?.error || ''
        if (serverMsg.toLowerCase().includes('unsupported') || serverMsg.toLowerCase().includes('format')) {
          return {
            type: 'error',
            title: '格式不兼容',
            message: '文件格式不兼容，请上传支持的文件类型',
            icon: 'DocumentDelete',
            autoDismiss: false,
          }
        }
        return {
          type: 'error',
          title: '请求错误',
          message: serverMsg || '上传请求参数有误，请检查文件内容后重试',
          icon: 'WarningFilled',
          autoDismiss: false,
        }
      }
      return {
        type: 'error',
        title: '上传失败',
        message: error.response?.data?.error || error.message || '服务器处理失败，请稍后重试',
        icon: 'CircleCloseFilled',
        autoDismiss: false,
      }
    }

    if (error instanceof Error) {
      return {
        type: 'error',
        title: '上传失败',
        message: error.message || '发生未知错误，请重试',
        icon: 'CircleCloseFilled',
        autoDismiss: false,
      }
    }

    return {
      type: 'error',
      title: '上传失败',
      message: '发生未知错误，请重试',
      icon: 'CircleCloseFilled',
      autoDismiss: false,
    }
  }

  async function checkBackendHealth(): Promise<boolean> {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000)
      const response = await fetch(BACKEND_HEALTH_URL, {
        signal: controller.signal,
        method: 'GET',
      })
      clearTimeout(timeoutId)
      return response.ok
    } catch {
      return false
    }
  }

  async function checkUploadEndpoint(): Promise<boolean> {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000)
      const response = await fetch(`${BACKEND_API_URL}/upload-supplier`, {
        signal: controller.signal,
        method: 'HEAD',
      })
      clearTimeout(timeoutId)
      return response.status !== 404 && response.status !== 405
    } catch {
      return false
    }
  }

  async function uploadFile(file: File): Promise<ParseResult | null> {
    const startTime = Date.now()
    const logBase: Omit<UploadLogEntry, 'status' | 'durationMs'> = {
      timestamp: new Date().toISOString(),
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type || file.name.split('.').pop() || 'unknown',
    }

    if (!checkBrowserCompatibility()) {
      writeLog({ ...logBase, status: 'failure', errorCode: 'BROWSER_INCOMPATIBLE', errorMessage: 'Browser incompatible', durationMs: Date.now() - startTime })
      return null
    }

    const validationError = validateFile(file)
    if (validationError) {
      showFeedback(getValidationError(validationError, file))
      writeLog({ ...logBase, status: 'failure', errorCode: 'VALIDATION_' + validationError.toUpperCase(), errorMessage: validationError, durationMs: Date.now() - startTime })
      return null
    }

    setStatus(UPLOAD_STATUS.CHECKING_BACKEND)
    const backendAvailable = await checkBackendHealth()
    if (!backendAvailable) {
      status.value = UPLOAD_STATUS.ERROR
      showFeedback({
        type: 'error',
        title: '服务不可用',
        message: '后台无服务，无法完成文件上传',
        icon: 'MonitorOff',
        autoDismiss: false,
      })
      writeLog({ ...logBase, status: 'failure', errorCode: 'BACKEND_UNAVAILABLE', errorMessage: 'Backend health check failed', durationMs: Date.now() - startTime })
      return null
    }

    const endpointAvailable = await checkUploadEndpoint()
    if (!endpointAvailable) {
      status.value = UPLOAD_STATUS.ERROR
      showFeedback({
        type: 'error',
        title: '上传接口缺失',
        message: '后端服务不支持文件上传功能，请检查后端是否正确部署或联系管理员',
        icon: 'Link',
        autoDismiss: false,
      })
      writeLog({ ...logBase, status: 'failure', errorCode: 'ENDPOINT_NOT_FOUND', errorMessage: 'Upload endpoint missing (HEAD returned 404/405)', durationMs: Date.now() - startTime })
      return null
    }

    setStatus(UPLOAD_STATUS.UPLOADING)
    progress.value = 0

    const progressTimer = setInterval(() => {
      if (progress.value < 90) {
        progress.value += Math.random() * 15 + 5
        if (progress.value > 90) progress.value = 90
      }
    }, 300)

    try {
      const response = await uploadSupplier(file)
      clearInterval(progressTimer)
      progress.value = 100

      setStatus(UPLOAD_STATUS.PARSING)

      const result: ParseResult = {
        products: (response as unknown as { products: SupplierProduct[] }).products || [],
        errors: (response as unknown as { errors: ParseError[] }).errors || [],
        fileName: file.name,
      }

      uploadResult.value = result
      status.value = UPLOAD_STATUS.SUCCESS
      showFeedback({
        type: 'success',
        title: '上传成功',
        message: `文件 "${file.name}" 解析完成，共 ${result.products.length} 个商品`,
        icon: 'CircleCheckFilled',
        autoDismiss: true,
      })

      writeLog({ ...logBase, status: 'success', durationMs: Date.now() - startTime })

      return result
    } catch (error: unknown) {
      clearInterval(progressTimer)
      status.value = UPLOAD_STATUS.ERROR
      progress.value = 0

      const errFeedback = getErrorFeedback(error, file)
      showFeedback(errFeedback)

      let errorCode = 'UNKNOWN'
      let errorMessage = String(error)
      if (axios.isAxiosError(error)) {
        errorCode = error.code || 'NETWORK_ERROR'
        errorMessage = error.message
      } else if (error instanceof Error) {
        errorCode = 'JS_ERROR'
        errorMessage = error.message
      }

      writeLog({ ...logBase, status: 'failure', errorCode, errorMessage, durationMs: Date.now() - startTime })

      return null
    }
  }

  function handleDragEnter(e: DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.value++
    if (e.dataTransfer?.types.includes('Files')) {
      isDragging.value = true
    }
  }

  function handleDragLeave(e: DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.value--
    if (dragCounter.value <= 0) {
      dragCounter.value = 0
      isDragging.value = false
    }
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy'
    }
  }

  function handleDrop(e: DragEvent): File | null {
    e.preventDefault()
    e.stopPropagation()
    isDragging.value = false
    dragCounter.value = 0

    if (!checkBrowserCompatibility()) return null

    const files = e.dataTransfer?.files
    if (!files || files.length === 0) return null

    const file = files[0]
    return file
  }

  function reset() {
    status.value = UPLOAD_STATUS.IDLE
    feedback.value = null
    uploadResult.value = null
    progress.value = 0
  }

  return {
    isDragging,
    status,
    feedback,
    uploadResult,
    progress,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    uploadFile,
    validateFile,
    checkBackendHealth,
    checkUploadEndpoint,
    checkBrowserCompatibility,
    clearFeedback,
    reset,
  }
}
