import client from '@/api/client'

interface ErrorPayload {
  message: string
  stack: string
  source: string
  route: string
  url: string
  userAgent: string
  timestamp: string
}

function buildPayload(err: unknown, source: string): ErrorPayload {
  const e = err instanceof Error ? err : new Error(String(err))
  return {
    message: e.message || String(err),
    stack: (e.stack || '').slice(0, 2000),
    source,
    route: window.location.pathname,
    url: window.location.href,
    userAgent: navigator.userAgent,
    timestamp: new Date().toISOString(),
  }
}

/** Forward an error to the backend log. Fire-and-forget — never throws. */
export function reportClientError(err: unknown, source = 'app', info?: string) {
  try {
    const payload = buildPayload(err, source)
    if (info) payload.message += ` (${info})`
    client.post('/client-error', payload).catch(() => {})
  } catch {
    // ignore
  }
}

/** Global uncaught-error capture: window errors + unhandled promise rejections. */
export function setupErrorMonitoring() {
  window.addEventListener('error', (event) => {
    reportClientError(event.error ?? event.message, 'window.onerror')
  })
  window.addEventListener('unhandledrejection', (event) => {
    reportClientError(event.reason, 'unhandledrejection')
  })
}
