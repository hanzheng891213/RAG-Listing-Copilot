/**
 * Generation → write-back smoke test.
 *
 * Signs in as a visitor (the backend answers visitors with a streamed demo
 * listing), opens the row's 生成 ring, picks a language, and verifies that the
 * generated title/description/bullet points are written back into the same row
 * and persisted through the batch API.
 *
 * Usage: DSH_SMOKE_TOKEN=<visitor-jwt> node scripts/smoke-generate.mjs <sku>
 */
const CDP = process.env.DSH_CDP || 'http://127.0.0.1:9222'
const APP = process.env.DSH_APP || 'http://localhost:5175'
const TOKEN = process.env.DSH_SMOKE_TOKEN || ''
const SKU = process.argv[2] || ''

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function connect(wsUrl) {
  const ws = new WebSocket(wsUrl)
  let nextId = 0
  const pending = new Map()
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data)
    if (message.id && pending.has(message.id)) {
      const entry = pending.get(message.id)
      pending.delete(message.id)
      if (message.error) entry.reject(new Error(message.error.message))
      else entry.resolve(message.result)
    }
  }
  const ready = new Promise((res, rej) => {
    ws.onopen = res
    ws.onerror = rej
  })
  const send = (method, params = {}) =>
    new Promise((resolve2, reject2) => {
      const id = ++nextId
      pending.set(id, { resolve: resolve2, reject: reject2 })
      ws.send(JSON.stringify({ id, method, params }))
    })
  return { ws, send, ready }
}

async function main() {
  if (!TOKEN || !SKU) throw new Error('token and sku are required')

  const created = await fetch(`${CDP}/json/new?${encodeURIComponent('about:blank')}`, { method: 'PUT' })
  const page = await created.json()
  const cdp = connect(page.webSocketDebuggerUrl)
  await cdp.ready
  await cdp.send('Page.enable')
  await cdp.send('Runtime.enable')

  const evaluate = async (expression, awaitPromise = false) => {
    const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise })
    return r.result?.value
  }

  await cdp.send('Page.navigate', { url: `${APP}/` })
  await sleep(2500)
  await cdp.send('Runtime.evaluate', {
    expression: `localStorage.setItem('rag-copilot-token', ${JSON.stringify(TOKEN)});
                 localStorage.setItem('rag-copilot-provider-configs', JSON.stringify([{providerId:'deepseek',apiKey:'sk-demo-key',activeModel:'deepseek-v4-flash',temperature:0.7,maxTokens:4096}]));`,
  })
  await cdp.send('Page.navigate', { url: `${APP}/product-grid` })
  await sleep(4500)

  const clicked = await evaluate(`(() => {
    const row = [...document.querySelectorAll('.xgrid__row')].find((el) => el.innerText.includes(${JSON.stringify(SKU)}))
    if (!row) return 'row-not-found'
    const button = row.querySelector('.xact')
    if (!button) return 'button-not-found'
    button.click()
    return 'clicked'
  })()`)

  await sleep(700)
  const ring = await evaluate(`document.querySelectorAll('.radial-item').length`)

  // Pick English (first bubble).
  await evaluate(`document.querySelector('.radial-item')?.click()`)

  let fields = {}
  let toast = ''
  for (let attempt = 0; attempt < 30; attempt++) {
    await sleep(1000)
    const json = await evaluate(
      `fetch('/api/products?page=1&pageSize=50').then((r) => r.json()).then((d) => JSON.stringify(d.items.find((i) => (i.fields.sku || '') === ${JSON.stringify(SKU)})?.fields ?? {}))`,
      true,
    )
    fields = JSON.parse(json || '{}')
    if (fields.title && fields.description && fields.bulletPoints) break
    toast = await evaluate(
      `[...document.querySelectorAll('.el-message__content')].map((el) => el.textContent.trim()).join(' || ')`,
    )
    if (toast.includes('失败')) break
  }

  const report = {
    sku: SKU,
    clicked,
    ringItems: ring,
    toast,
    title: String(fields.title ?? '').slice(0, 60),
    bulletPoints: String(fields.bulletPoints ?? '').split('\n').length,
    description: String(fields.description ?? '').slice(0, 60),
    keywords: String(fields.keywords ?? '').slice(0, 40),
  }
  console.log(JSON.stringify(report, null, 2))

  const ok = Boolean(fields.title && fields.description && fields.bulletPoints) && ring === 7
  cdp.ws.close()
  if (!ok) process.exitCode = 1
}

main().catch((error) => {
  console.error('[smoke-generate] failed:', error)
  process.exitCode = 1
})
