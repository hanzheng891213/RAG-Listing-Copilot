import { defineStore } from 'pinia'
import { ref } from 'vue'
import { localizationApi } from '@/api/localization'
import type { Localization } from '@/types/localization'

export const useLocalizationStore = defineStore('localization', () => {
  const history = ref<Localization[]>([])
  const outputText = ref('')
  const generating = ref(false)
  const seoScore = ref<number | null>(null)

  async function generate(productId: number, inputCn: string) {
    generating.value = true
    outputText.value = ''

    try {
      const response = await localizationApi.generate(productId, inputCn)
      const reader = response.data.getReader()
      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const text = decoder.decode(value, { stream: true })
        const lines = text.split('\n')

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = JSON.parse(line.slice(6))
            if (data.type === 'chunk') {
              outputText.value += data.token
            } else if (data.type === 'meta') {
              seoScore.value = data.seo_score
            }
          }
        }
      }
    } finally {
      generating.value = false
    }
  }

  async function fetchHistory(productId: number) {
    const res = await localizationApi.history(productId)
    history.value = res.data
  }

  return {
    history, outputText, generating, seoScore,
    generate, fetchHistory
  }
})
