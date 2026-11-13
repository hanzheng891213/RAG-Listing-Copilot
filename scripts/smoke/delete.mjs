/**
 * Row-delete smoke test: clicks the 删除 button of one row in the real grid and
 * verifies the row is gone from the API while the others survive.
 *
 * Usage: DSH_SMOKE_TOKEN=<jwt> node scripts/smoke-delete.mjs <sku>
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
    expression: `localStorage.setItem('rag-copilot-token', ${JSON.stringify(TOKEN)})`,
  })
  await cdp.send('Page.navigate', { url: `${APP}/product-grid` })
  await sleep(4000)

  const before = await evaluate(
    `fetch('/api/products?page=1&pageSize=50').then((r) => r.json()).then((d) => d.items.map((i) => i.fields.sku).join(','))`,
    true,
  )

  // Find the data row containing the SKU and click its delete button.
  const clicked = await evaluate(`(() => {
    const rows = [...document.querySelectorAll('.xgrid__row')]
    const row = rows.find((el) => el.innerText.includes(${JSON.stringify(SKU)}))
    if (!row) return 'row-not-found'
    const button = row.querySelector('.xact--danger')
    if (!button) return 'button-not-found'
    button.click()
    return 'clicked'
  })()`)

  await sleep(4500)

  const after = await evaluate(
    `fetch('/api/products?page=1&pageSize=50').then((r) => r.json()).then((d) => d.items.map((i) => i.fields.sku).join(','))`,
    true,
  )
  const bodyText = await evaluate(`document.body.innerText`)
  const batch = await evaluate(
    `performance.getEntriesByType('resource').filter((e) => e.name.includes('/api/products/batch')).length`,
  )

  const report = {
    sku: SKU,
    clicked,
    before,
    after,
    batchRequests: batch,
    removedFromApi: !String(after).split(',').includes(SKU),
    removedFromTable: !String(bodyText).includes(SKU),
  }
  console.log(JSON.stringify(report, null, 2))
  const ok = report.removedFromApi && report.removedFromTable && clicked === 'clicked'
  cdp.ws.close()
  if (!ok) process.exitCode = 1
}

main().catch((error) => {
  console.error('[smoke-delete] failed:', error)
  process.exitCode = 1
})
