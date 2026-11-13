import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isLanguageDrift, resolveListingLanguage } from '../src/utils/listingLanguage.ts'
import { deepseekService } from '../src/services/deepseek/deepseekService.ts'
import { KnowledgeService } from '../src/services/knowledge/knowledgeService.ts'
import type { SupplierProduct } from '../src/types/index.ts'

const product: SupplierProduct = {
  id: 'sku-1',
  rawData: { 商品名称: '猫王户外蓝牙音箱 标准版 灰色', 类目: '户外音箱' },
}

test('missing language resolves to English, not to "no instruction"', () => {
  assert.equal(resolveListingLanguage(undefined), 'English')
  assert.equal(resolveListingLanguage(''), 'English')
  assert.equal(resolveListingLanguage('english'), 'English')
  assert.equal(resolveListingLanguage('Thai'), 'Thai')
  // Unknown values are passed through instead of being dropped.
  assert.equal(resolveListingLanguage('portuguese'), 'Portuguese')
})

test('English prompt carries an explicit language instruction', () => {
  const prompt = deepseekService.buildPromptForProvider(product, 'amazon', 'standard', 'english')
  assert.match(prompt, /Output language: English/)
  // The Chinese source data must be called out as something to translate.
  assert.match(prompt, /translate them into English/)
  // And the reminder must be the last thing the model reads.
  assert.match(prompt.trimEnd(), /written in English\.$/)
})

test('non-English prompt names the target language and never asks for English output', () => {
  const prompt = deepseekService.buildPromptForProvider(product, 'amazon', 'standard', 'thai')
  assert.match(prompt, /Output language: Thai/)
  assert.match(prompt, /written in Thai\.$/)
})

test('system message pins the output language for every target, English included', () => {
  assert.match(deepseekService.buildSystemMessage(undefined), /Output language: English/)
  assert.match(deepseekService.buildSystemMessage('german'), /Output language: German/)
  assert.doesNotMatch(deepseekService.buildSystemMessage('german'), /written in English/)
})

test('retry messages state that the previous answer was rejected', () => {
  const [system, user] = deepseekService.buildMessages('PROMPT', 'english', { languageRetry: true })
  assert.equal(system.role, 'system')
  assert.match(system.content, /Output language: English/)
  assert.match(user.content, /^PROMPT/)
  assert.match(user.content, /previous answer was rejected/)
  // A plain call carries no rejection note.
  assert.doesNotMatch(deepseekService.buildMessages('PROMPT', 'english')[1].content, /rejected/)
})

test('drift is detected for script-checkable targets only', () => {
  const chinese = { title: '猫王户外蓝牙音箱 标准版 灰色', description: '360度环绕音效' }
  const english = { title: 'Outdoor Bluetooth Speaker - Grey', description: '360-degree sound' }

  assert.equal(isLanguageDrift(chinese, 'english'), true)
  assert.equal(isLanguageDrift(chinese, undefined), true)
  assert.equal(isLanguageDrift(english, 'english'), false)
  // Latin-script targets cannot be told apart by script, so they are not gated.
  assert.equal(isLanguageDrift(english, 'spanish'), false)
  // Empty output is a parse failure, not a language failure.
  assert.equal(isLanguageDrift({ title: '', description: '' }, 'english'), false)
})

test('grounding prefers the English body even when a Chinese query matches the Chinese one', async () => {
  const ks = new KnowledgeService({})
  await ks.ingestDocument(
    '# Product Detail Page Rules\n\n## Title Requirements\n\nKeep titles under 200 characters and lead with the core specification. Use Arabic numerals, never all caps, and no promotional phrases.',
    {
      title: 'Product Detail Page Rules',
      category: 'platform_rules',
      platform: 'amazon',
      tags: [],
      contentZh:
        '# 商品详情页规则\n\n## 标题要求\n\n标题不超过 200 个字符，并把核心参数放在最前面。使用阿拉伯数字，禁止全大写，禁止促销词。',
    },
  )

  // A Chinese product query is exactly the case that used to inject a Chinese rule body.
  const context = await ks.buildPromptContext('猫王户外蓝牙音箱 标准版 灰色 防水', { platform: 'amazon' })

  assert.match(context.rules, /Keep titles under 200 characters/)
  assert.doesNotMatch(context.rules, /标题不超过 200 个字符/)
  // The section header must survive so the model can tell rules from style.
  assert.match(context.rules, /Product Detail Page Rules/)
})
