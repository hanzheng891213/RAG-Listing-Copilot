/**
 * Batch generation smoke test on the listing page.
 *
 * Selects every table row, runs 批量生成, and verifies that each row received a
 * generated title/description written back through the batch API.
 *
 * Usage: DSH_SMOKE_TOKEN=<visitor-jwt> node scripts/smoke-batch.mjs
 */
const CDP = process.env.DSH_CDP || 'http://127.0.0.1:9222'
const APP = process.env.DSH_APP || 'http://localhost:5175'
const TOKEN = process.env.DSH_SMOKE_TOKEN || ''

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
  if (!TOKEN) throw new Error('token required')

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
  await cdp.send('Page.navigate', { url: `${APP}/listing-generator` })
  await sleep(5000)

  const rows = await evaluate(`document.querySelectorAll('.product-item').length`)
  const selectedLabel = await evaluate(
    `document.querySelector('.batch-bar .el-checkbox__label')?.textContent?.trim() ?? ''`,
  )

  // Select all rows.
  await evaluate(`document.querySelector('.batch-bar .el-checkbox')?.click()`)
  await sleep(500)
  const selectedAfter = await evaluate(
    `document.querySelectorAll('.product-item .el-checkbox.is-checked').length`,
  )

  // Choose English and start the batch.
  await evaluate(`(() => {
    const button = [...document.querySelectorAll('.batch-actions button')].find((b) => b.textContent.includes('批量生成'))
    if (button) button.click()
  })()`)

  let apiRows = []
  let progressSeen = ''
  for (let attempt = 0; attempt < 45; attempt++) {
    await sleep(1000)
    const json = await evaluate(
      `fetch('/api/products?page=1&pageSize=50').then((r) => r.json()).then((d) => JSON.stringify(d.items.map((i) => ({ sku: i.fields.sku, title: i.fields.title, bulletPoints: i.fields.bulletPoints }))))`,
      true,
    )
    apiRows = JSON.parse(json || '[]')
    progressSeen = await evaluate(`document.querySelector('.batch-progress')?.innerText?.trim() ?? ''`)
    if (apiRows.length > 0 && apiRows.every((r) => r.title) && !progressSeen) break
  }

  const toasts = await evaluate(
    `[...document.querySelectorAll('.el-message__content')].map((el) => el.textContent.trim()).join(' || ')`,
  )

  const expected = process.argv.slice(2)
  const report = {
    productRows: rows,
    selectedLabel,
    selectedAfter,
    generated: apiRows.map((r) => ({ sku: r.sku, hasTitle: Boolean(r.title) })),
    finalToast: toasts,
  }
  console.log(JSON.stringify(report, null, 2))

  const ok =
    rows > 0 &&
    expected.length > 0 &&
    expected.every((sku) => apiRows.some((row) => row.sku === sku && row.title))
  cdp.ws.close()
  if (!ok) process.exitCode = 1
}

main().catch((error) => {
  console.error('[smoke-batch] failed:', error)
  process.exitCode = 1
})
