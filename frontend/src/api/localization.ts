import client from './client'
import type { Localization } from '@/types/localization'

export const localizationApi = {
  generate(productId: number, inputCn: string) {
    return client.post('/localization/generate', {
      product_id: productId,
      input_cn: inputCn
    }, {
      responseType: 'stream',
      headers: { Accept: 'text/event-stream' }
    })
  },

  regenerate(productId: number, inputCn: string) {
    return client.post('/localization/regenerate', {
      product_id: productId,
      input_cn: inputCn
    }, {
      responseType: 'stream',
      headers: { Accept: 'text/event-stream' }
    })
  },

  history(productId: number) {
    return client.get<Localization[]>(`/localization/history/${productId}`)
  }
}
