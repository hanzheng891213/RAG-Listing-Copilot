import { ref, onUnmounted } from 'vue'

interface SSEOptions {
  onToken?: (token: string) => void
  onMeta?: (data: Record<string, unknown>) => void
  onDone?: (data: Record<string, unknown>) => void
  onError?: (error: Error) => void
}

export function useSSE(url: string, options: SSEOptions = {}) {
  const outputText = ref('')
  const streaming = ref(false)
  const error = ref<Error | null>(null)
  let abortController: AbortController | null = null

  async function start(body?: Record<string, unknown>) {
    streaming.value = true
    error.value = null
    outputText.value = ''

    abortController = new AbortController()

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream'
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: abortController.signal
      })

      if (!response.ok) {
        throw new Error(`SSE 连接失败: ${response.status}`)
      }

      const reader = response.body?.getReader()
      if (!reader) throw new Error('无法读取响应流')

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const event = JSON.parse(line.slice(6))

              switch (event.type) {
                case 'chunk':
                  outputText.value += event.token
                  options.onToken?.(event.token)
                  break
                case 'meta':
                  options.onMeta?.(event)
                  break
                case 'done':
                  options.onDone?.(event)
                  break
              }
            } catch {
              // skip unparseable lines
            }
          }
        }
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        error.value = e
        options.onError?.(e)
      }
    } finally {
      streaming.value = false
    }
  }

  function stop() {
    abortController?.abort()
    streaming.value = false
  }

  onUnmounted(stop)

  return { outputText, streaming, error, start, stop }
}
