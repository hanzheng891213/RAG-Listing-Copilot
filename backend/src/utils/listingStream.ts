// 流式生成 Listing 的共享解析工具。
// DSV4 等模型常把 JSON 用 ```json 代码围栏包裹或带前导/尾随文字，
// 整体 JSON.parse(accumulated) 会全程失败，导致没有任何字段下发。
// 这里改为对全文做字段级正则提取，天然容忍围栏，并支持边生成边下发。

export interface PartialListing {
  title?: string
  description?: string
  bulletPoints?: string[]
  keywords?: string[]
}

function unescapeJsonString(raw: string): string {
  return raw
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\')
}

const STRING_FIELDS = ['title', 'description'] as const
const ARRAY_FIELDS = ['bulletPoints', 'keywords'] as const

function stringFieldRegex(field: string): RegExp {
  // 捕获该字段的值前缀（不要求闭合引号），支持转义字符 \"
  return new RegExp(`"${field}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)`)
}

function arrayFieldRegex(field: string): RegExp {
  // 数组需闭合 ]，且其后必须是 , } 或行尾——避免把字符串内部的 ] 误判为数组结束
  return new RegExp(`"${field}"\\s*:\\s*\\[([\\s\\S]*?)\\]\\s*(?=[,}]|$)`)
}

/**
 * 从累计的原始输出里提取当前可用的字段值。
 * 字符串字段返回增长中的前缀；数组字段只在完整闭合时返回。
 */
export function extractListingFields(accumulated: string): PartialListing {
  const out: PartialListing = {}

  for (const field of STRING_FIELDS) {
    const m = accumulated.match(stringFieldRegex(field))
    if (m && m[1].length > 0) {
      const val = unescapeJsonString(m[1])
      if (val.trim().length >= 3) out[field] = val
    }
  }

  for (const field of ARRAY_FIELDS) {
    const m = accumulated.match(arrayFieldRegex(field))
    if (m) {
      try {
        const arr = JSON.parse(`[${m[1]}]`)
        if (Array.isArray(arr) && arr.length > 0) out[field] = arr
      } catch {
        // 数组还不完整或格式异常，等下一个 chunk
      }
    }
  }

  return out
}

/** 流结束后解析完整 JSON（跳过围栏与前导/尾随文字），供 done 事件使用。 */
export function parseFinalJson(accumulated: string): Record<string, any> | null {
  const start = accumulated.indexOf('{')
  const end = accumulated.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const parsed = JSON.parse(accumulated.slice(start, end + 1))
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

export interface NormalizedListing {
  title: string
  bulletPoints: string[]
  description: string
  keywords: string[]
}

function toArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string')
  if (typeof v === 'string') return v.split(',').map((s) => s.trim()).filter(Boolean)
  return []
}

/**
 * 归一化 DSV4 等模型的输出字段。
 * DSV4 常把 keywords 返回成逗号分隔字符串而非数组，这里统一转成数组。
 */
export function normalizeListingFields(parsed: Record<string, any>): NormalizedListing {
  return {
    title: typeof parsed.title === 'string' ? parsed.title : '',
    description: typeof parsed.description === 'string' ? parsed.description : '',
    bulletPoints: toArray(parsed.bulletPoints),
    keywords: toArray(parsed.keywords),
  }
}

const DEMO: {
  title: string
  bulletPoints: string[]
  description: string
  keywords: string[]
} = {
  title: 'Demo Title - High Quality | Fast Shipping | Best Value',
  bulletPoints: [
    '【Premium Quality】Professional-grade demo product crafted with durable materials.',
    '【Versatile Design】Suitable for home, office, and outdoor use.',
    '【Easy to Use】Simple setup with intuitive controls.',
    '【Perfect Gift】Great choice for family, friends, and colleagues.',
    '【Satisfaction Guaranteed】Backed by responsive customer support.',
  ],
  description: '## Product Description\n\nExperience the perfect blend of quality and value with this demo product.',
  keywords: ['demo', 'premium quality', 'fast shipping', 'best value'],
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * 访问者路径的 demo 流：按 350ms 间隔逐字段下发 field 事件，最后发 done。
 * emit 兼容 Express 的 res.write 和 Worker 的 controller.enqueue。
 */
export async function streamDemoSse(
  emit: (sseLine: string) => void,
  opts: { productId?: string; platform?: string; template?: string },
): Promise<void> {
  const sse = (obj: unknown) => emit(`data: ${JSON.stringify(obj)}\n\n`)

  const fields: Array<[string, unknown]> = [
    ['title', DEMO.title],
    ['bulletPoints', DEMO.bulletPoints],
    ['description', DEMO.description],
    ['keywords', DEMO.keywords],
  ]

  for (let i = 0; i < fields.length; i++) {
    if (i > 0) await sleep(350)
    sse({ type: 'field', field: fields[i][0], value: fields[i][1] })
  }

  await sleep(350)
  sse({
    type: 'done',
    listing: {
      id: 'gen-' + Date.now(),
      productId: opts.productId || '',
      ...DEMO,
      seoScore: 85,
      platform: opts.platform || 'amazon',
      template: opts.template || 'standard',
      version: 1,
      createdAt: new Date().toISOString(),
      isDemo: true,
    },
    complianceResults: [],
  })
}
