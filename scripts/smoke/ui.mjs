/**
 * Headless UI smoke test over the Chrome DevTools Protocol.
 *
 * Loads the real SPA against the running dev API, signs in with a minted admin
 * JWT, and asserts that the routes that changed still render — and that no
 * render-time exception (e.g. the old `toFixed` crash) is thrown.
 *
 * Usage: DSH_SMOKE_TOKEN=<jwt> node scripts/smoke-ui.mjs
 */
const CDP = process.env.DSH_CDP || 'http://127.0.0.1:9222'
// Vite binds `localhost` (IPv6 ::1 on this host), so the page must be reached by
// name rather than by 127.0.0.1.
const APP = process.env.DSH_APP || 'http://localhost:5175'
const TOKEN = process.env.DSH_SMOKE_TOKEN || ''

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function openPage(url) {
  const response = await fetch(`${CDP}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' })
  if (!response.ok) throw new Error(`could not open page: ${response.status}`)
  return response.json()
}

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

  const ready = new Promise((resolve, reject) => {
    ws.onopen = () => resolve()
    ws.onerror = (err) => reject(err)
  })

  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++nextId
      pending.set(id, { resolve, reject })
      ws.send(JSON.stringify({ id, method, params }))
    })
  }

  return { ws, send, events, ready }
}

function problemsIn(events) {
  const problems = []
  for (const event of events) {
    if (event.method === 'Runtime.exceptionThrown') {
      const details = event.params?.exceptionDetails ?? {}
      problems.push(`exception: ${details.exception?.description || details.text}`)
    }
    if (event.method === 'Runtime.consoleAPICalled' && event.params?.type === 'error') {
      const text = (event.params.args ?? [])
        .map((arg) => arg.value ?? arg.description ?? '')
        .join(' ')
      problems.push(`console.error: ${text}`)
    }
    if (event.method === 'Log.entryAdded' && event.params?.entry?.level === 'error') {
      problems.push(`log.error: ${event.params.entry.text}`)
    }
  }
  return problems
}

const ROUTES = [
  {
    path: '/model-manager',
    expect: ['模型管理', '模型服务商', 'API 密钥', '用量分析', '各模型用量'],
  },
  {
    path: '/product-grid',
    expect: ['商品上架表', '操作', '导入表格', '商品名称', '详情描述', '五点描述'],
  },
  {
    path: '/listing-generator',
    expect: ['Listing 生成器', '批量生成', '选择商品'],
  },
]

async function main() {
  if (!TOKEN) throw new Error('DSH_SMOKE_TOKEN is required')

  const page = await openPage('about:blank')
  const cdp = connect(page.webSocketDebuggerUrl)
  await cdp.ready
  await cdp.send('Page.enable')
  await cdp.send('Runtime.enable')
  await cdp.send('Log.enable')

  const text = () =>
    cdp.send('Runtime.evaluate', {
      expression: 'document.body.innerText',
      returnByValue: true,
    })

  // First load establishes the origin, then the admin token is stored so the
  // router's auth guard can resolve a real profile from /api/auth/me.
  await cdp.send('Page.navigate', { url: `${APP}/` })
  await sleep(3000)
  await cdp.send('Runtime.evaluate', {
    expression: `localStorage.setItem('rag-copilot-token', ${JSON.stringify(TOKEN)})`,
  })

  const report = []
  let failed = false

  for (const route of ROUTES) {
    const mark = cdp.events.length
    await cdp.send('Page.navigate', { url: `${APP}${route.path}` })
    await sleep(4500)

    const body = await text()
    const value = String(body.result?.value ?? '')
    const missing = route.expect.filter((needle) => !value.includes(needle))
    const problems = problemsIn(cdp.events.slice(mark))

    // A route that bounced back to / means the auth guard rejected the session.
    const bounced = value.includes('上传供应商数据') || value.includes('体验演示')
    const ok = missing.length === 0 && problems.length === 0 && !bounced
    if (!ok) failed = true

    report.push({
      route: route.path,
      ok,
      url: await cdp
        .send('Runtime.evaluate', { expression: 'location.pathname', returnByValue: true })
        .then((r) => r.result?.value),
      missing,
      problems,
      excerpt: value.replace(/\s+/g, ' ').slice(0, 160),
    })
  }

  console.log(JSON.stringify(report, null, 2))
  cdp.ws.close()
  if (failed) process.exitCode = 1
}

main().catch((error) => {
  console.error('[smoke-ui] failed:', error)
  process.exitCode = 1
})
