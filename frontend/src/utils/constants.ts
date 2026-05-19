export const MODULE_NAMES: Record<string, string> = {
  product: '商品提取',
  localization: '德语本土化',
  compliance: '合规检查'
}

export const PARSE_STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending: { label: '等待解析', color: 'var(--text-tertiary)' },
  parsing: { label: '解析中', color: 'var(--status-yellow)' },
  completed: { label: '已完成', color: 'var(--status-green)' },
  failed: { label: '失败', color: 'var(--status-red)' }
}

export const CHECK_STATUS_MAP: Record<string, { label: string; color: string }> = {
  green: { label: '合规', color: 'var(--status-green)' },
  yellow: { label: '警告', color: 'var(--status-yellow)' },
  red: { label: '违规', color: 'var(--status-red)' }
}

export const FILE_ACCEPT = '.pdf,.xlsx,.xls,.docx,.doc'

export const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB
