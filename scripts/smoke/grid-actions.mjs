/**
 * Action-column smoke test, two scenarios:
 *  1. no model configured → 生成 warns and routes to Model Manager;
 *  2. a provider configured → 生成 opens the 7-language radial menu, Escape closes it.
 *
 * Usage: DSH_SMOKE_TOKEN=<jwt> node scripts/smoke-grid-actions.mjs
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

  const clickGenerate = () =>
    evaluate(`(() => {
      const row = [...document.querySelectorAll('.xgrid__row')].find((el) => el.querySelector('.xact'))
      if (!row) return 'no-row'
      row.querySelector('.xact').click()
      return 'clicked'
    })()`)

  await cdp.send('Page.navigate', { url: `${APP}/` })
  await sleep(2500)
  await cdp.send('Runtime.evaluate', {
    expression: `localStorage.removeItem('rag-copilot-provider-configs'); localStorage.setItem('rag-copilot-token', ${JSON.stringify(TOKEN)})`,
  })
  await cdp.send('Page.navigate', { url: `${APP}/product-grid` })
  await sleep(4000)

  // 1. no model configured
  const clickedWithoutModel = await clickGenerate()
  await sleep(1200)
  const guardPath = await evaluate(`location.pathname`)
  const guardToast = await evaluate(
    `[...document.querySelectorAll('.el-message__content')].map((el) => el.textContent.trim()).join(' || ')`,
  )

  // 2. configure a provider (fake key), reload, open the ring
  await cdp.send('Runtime.evaluate', {
    expression: `localStorage.setItem('rag-copilot-provider-configs', JSON.stringify([{providerId:'deepseek',apiKey:'sk-smoke-test',activeModel:'deepseek-v4-flash',temperature:0.7,maxTokens:4096}]))`,
  })
  await cdp.send('Page.navigate', { url: `${APP}/product-grid` })
  await sleep(4000)

  const clickedWithModel = await clickGenerate()
  await sleep(700)

  const ringCount = await evaluate(`document.querySelectorAll('.radial-item').length`)
  const ringCodes = await evaluate(
    `[...document.querySelectorAll('.radial-item')].map((el) => el.textContent.trim()).join(',')`,
  )

  // Escape must close it without generating.
  await evaluate(
    `document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`,
  )
  await sleep(400)
  const ringAfterEscape = await evaluate(`document.querySelectorAll('.radial-item').length`)
  const pathAfterEscape = await evaluate(`location.pathname`)

  const report = {
    clickedWithoutModel,
    guardPath,
    guardToast,
    clickedWithModel,
    ringCount,
    ringCodes,
    ringAfterEscape,
    pathAfterEscape,
  }
  console.log(JSON.stringify(report, null, 2))

  const ok =
    guardPath === '/model-manager' &&
    clickedWithModel === 'clicked' &&
    ringCount === 7 &&
    ringAfterEscape === 0 &&
    pathAfterEscape === '/product-grid'
  cdp.ws.close()
  if (!ok) process.exitCode = 1
}

main().catch((error) => {
  console.error('[smoke-grid-actions] failed:', error)
  process.exitCode = 1
})
