/**
 * End-to-end import smoke test.
 *
 * Drives the real 上架表 page: attaches a CSV to the hidden file input through
 * CDP (the same path as clicking 导入表格), then checks that the rows are mapped
 * onto the canonical columns and persisted through the batch API.
 *
 * Usage: DSH_SMOKE_TOKEN=<jwt> node scripts/smoke-import.mjs <csv-path>
 */
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const CDP = process.env.DSH_CDP || 'http://127.0.0.1:9222'
const APP = process.env.DSH_APP || 'http://localhost:5175'
const TOKEN = process.env.DSH_SMOKE_TOKEN || ''
const CSV = resolve(process.argv[2] || '')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function connect(wsUrl) {
  const ws = new WebSocket(wsUrl)
  let nextId = 0
  const pending = new Map()
  const events = []
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data)
    if (message.id && pending.has(message.id)) {
      const entry = pending.get(message.id)
      pending.delete(message.id)
      if (message.error) entry.reject(new Error(message.error.message))
      else entry.resolve(message.result)
      return
    }
    events.push(message)
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
  return { ws, send, events, ready }
}

function problemsIn(events) {
  const out = []
  for (const e of events) {
    if (e.method === 'Runtime.exceptionThrown') {
      out.push(`exception: ${e.params?.exceptionDetails?.exception?.description ?? e.params?.exceptionDetails?.text}`)
    }
    if (e.method === 'Runtime.consoleAPICalled' && e.params?.type === 'error') {
      out.push(`console.error: ${(e.params.args ?? []).map((a) => a.value ?? a.description ?? '').join(' ')}`)
    }
  }
  return out
}

async function main() {
  if (!TOKEN) throw new Error('DSH_SMOKE_TOKEN is required')
  if (!CSV || !existsSync(CSV)) throw new Error(`csv not found: ${CSV}`)

  const created = await fetch(`${CDP}/json/new?${encodeURIComponent('about:blank')}`, { method: 'PUT' })
  const page = await created.json()
  const cdp = connect(page.webSocketDebuggerUrl)
  await cdp.ready
  await cdp.send('Page.enable')
  await cdp.send('Runtime.enable')
  await cdp.send('DOM.enable')
  await cdp.send('Network.enable')

  const evaluate = async (expression, awaitPromise = false) => {
    const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise })
    return r.result?.value
  }

  await cdp.send('Page.navigate', { url: `${APP}/` })
  await sleep(2500)
  await cdp.send('Runtime.evaluate', {
    expression: `localStorage.setItem('rag-copilot-token', ${JSON.stringify(TOKEN)})`,
  })

  const mark = cdp.events.length
  await cdp.send('Page.navigate', { url: `${APP}/product-grid` })
  await sleep(4000)

  const headerText = await evaluate(
    `[...document.querySelectorAll('.xhead')].map((el) => el.textContent.trim()).join('|')`,
  )
  const actionButtons = await evaluate(
    `[...document.querySelectorAll('.xcell--actions .xact')].map((el) => el.textContent.trim()).slice(0, 4).join('|')`,
  )

  const doc = await cdp.send('DOM.getDocument', { depth: -1 })
  const node = await cdp.send('DOM.querySelector', {
    nodeId: doc.root.nodeId,
    selector: 'input.hidden-file-input',
  })
  if (!node.nodeId) throw new Error('file input not found')
  await cdp.send('DOM.setFileInputFiles', { nodeId: node.nodeId, files: [CSV] })
  await cdp.send('Runtime.evaluate', {
    expression: `document.querySelector('input.hidden-file-input').dispatchEvent(new Event('change', { bubbles: true }))`,
  })

  await sleep(6000)

  const api = await evaluate(
    `fetch('/api/products?page=1&pageSize=50').then((r) => r.json()).then((d) => JSON.stringify(d.items.map((i) => i.fields)))`,
    true,
  )
  const bodyText = await evaluate(`document.body.innerText`)
  const problems = problemsIn(cdp.events.slice(mark))

  const rows = JSON.parse(api || '[]')
  const imported = rows.filter((f) => String(f.sku || '').startsWith('IMP-'))
  const mapped = imported.every(
    (f) => f.productName && f.sku && f.description !== undefined && f.bulletPoints !== undefined,
  )

  const toasts = await evaluate(
    `[...document.querySelectorAll('.el-message__content')].map((el) => el.textContent.trim()).join(' || ')`,
  )
  const reportBox = await evaluate(
    `document.querySelector('.import-report')?.innerText?.replace(/\\s+/g, ' ') ?? ''`,
  )
  const uploads = cdp.events
    .filter((e) => e.method === 'Network.responseReceived')
    .map((e) => e.params?.response)
    .filter((r) => r && String(r.url).includes('upload-supplier'))
    .map((r) => `${r.status} ${r.url}`)

  const apiCalls = cdp.events
    .filter((e) => e.method === 'Network.responseReceived')
    .map((e) => e.params?.response)
    .filter((r) => r && String(r.url).includes('/api/'))
    .map((r) => `${r.status} ${String(r.url).replace(APP, '')}`)

  const batchPayloads = cdp.events
    .filter((e) => e.method === 'Network.requestWillBeSent')
    .filter((e) => String(e.params?.request?.url).includes('/api/products/batch'))
    .map((e) => String(e.params?.request?.postData ?? '').slice(0, 800))

  const gridRows = await evaluate(`document.querySelectorAll('.xgrid__row').length`)
  const bodyExcerpt = String(bodyText || '').replace(/\s+/g, ' ').slice(0, 700)

  const report = {
    headers: headerText,
    actionButtons,
    importedRows: imported,
    importedCount: imported.length,
    mapped,
    tableShowsImported: imported.every((f) => bodyText.includes(f.sku)),
    uploads,
    apiCalls,
    batchPayloads,
    gridRows,
    bodyExcerpt,
    toasts,
    reportBox,
    problems,
  }
  console.log(JSON.stringify(report, null, 2))

  const ok = imported.length === 2 && mapped && report.tableShowsImported && problems.length === 0
  cdp.ws.close()
  if (!ok) process.exitCode = 1
}

main().catch((error) => {
  console.error('[smoke-import] failed:', error)
  process.exitCode = 1
})
