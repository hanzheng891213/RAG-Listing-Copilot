import type { SupplierProduct, GeneratedListing, Platform, ComplianceResult, KnowledgeContext } from '../../types/index.ts'
import { ragService } from '../rag/ragService.ts'
import { isLanguageDrift, resolveListingLanguage } from '../../utils/listingLanguage.ts'
import { v4 as uuid } from 'uuid'

const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1'

function getProductLabel(product: SupplierProduct): string {
  const values = Object.values(product.rawData).filter((v): v is string => !!v)
  return values[0] || `Product ${product.id.slice(0, 6)}`
}

export class DeepSeekService {
  async generateListing(
    product: SupplierProduct,
    platform: Platform,
    template: string,
    apiKey?: string,
    language?: string,
  ): Promise<GeneratedListing> {
    const label = getProductLabel(product)
    const relevantDocs = ragService.searchRelevantDocs(label, platform)

    const prompt = this.buildPrompt(product, platform, template, relevantDocs, language)

    const key = apiKey || process.env.DEEPSEEK_API_KEY || ''

    if (key) {
      console.log('[DeepSeek] Using real API for generation')
      return this.callDeepSeekAPI(prompt, product, platform, template, key, language)
    }

    console.log('[DeepSeek] No API key configured, using demo mode')
    return this.generateDemoListing(product, platform, template, language)
  }

  /**
   * Query used to retrieve platform rules from the knowledge base. Joins every
   * populated product field so retrieval sees specifications and category, not
   * just whichever value happens to come first.
   */
  buildRetrievalQuery(product: SupplierProduct): string {
    const values = Object.values(product.rawData).filter((v): v is string => !!v)
    return values.join(' ').slice(0, 500).trim()
  }

  /**
   * @param knowledge Retrieved knowledge-base excerpts to ground the
   *   prompt. When omitted the caller has no knowledge service available, so
   *   the prompt falls back to the built-in rule list.
   */
  buildPromptForProvider(
    product: SupplierProduct,
    platform: Platform,
    template?: string,
    language?: string,
    knowledge?: KnowledgeContext,
  ): string {
    const label = getProductLabel(product)
    const docs = ragService.searchRelevantDocs(label, platform)
    return this.buildPrompt(product, platform, template || 'standard', docs, language, knowledge)
  }

  /**
   * System message for listing generation.
   *
   * The output language lives here as well as at the end of the user prompt:
   * providers weight the system message heavily, and the English case used to
   * carry no language instruction at all.
   */
  buildSystemMessage(language?: string): string {
    const target = resolveListingLanguage(language)
    const strictness = target === 'English'
      ? ' — even when the source product data or the retrieved rules are in Chinese'
      : ''
    return `You are a helpful e-commerce listing assistant. Respond in JSON format with: title, bulletPoints (array of 5 strings), description (markdown string), keywords (array of 5-10 strings).\n\nOutput language: ${target}. Every field must be written in ${target}${strictness}. Never mirror the source data's language.`
  }

  /**
   * The messages for one generation call.
   *
   * `languageRetry` is used for the single second attempt made when the answer
   * came back in the wrong language: the rejection is stated explicitly and the
   * note goes last in the user message, where instruction-following is strongest.
   */
  buildMessages(
    prompt: string,
    language?: string,
    options?: { languageRetry?: boolean },
  ): Array<{ role: 'system' | 'user'; content: string }> {
    const target = resolveListingLanguage(language)
    const retryNote = options?.languageRetry
      ? `\n\nYour previous answer was rejected: it was not written in ${target}. Rewrite the entire listing in ${target}; no other language may appear in any field.`
      : ''
    return [
      { role: 'system', content: this.buildSystemMessage(language) },
      { role: 'user', content: `${prompt}${retryNote}` },
    ]
  }

  /** True when the generated listing came back in the wrong language. */
  hasLanguageDrift(listing: { title?: string; description?: string }, language?: string): boolean {
    return isLanguageDrift(listing, language)
  }

  private buildPrompt(
    product: SupplierProduct,
    platform: Platform,
    _template: string,
    docs: ReturnType<typeof ragService.searchRelevantDocs>,
    language?: string,
    knowledge?: KnowledgeContext,
  ): string {
    const target = resolveListingLanguage(language)
    // English is the default target and must be stated too: this branch used to
    // be empty for English, leaving the model to follow the Chinese product
    // data (or the Chinese rule body injected by retrieval) instead.
    const langInstruction =
      `\nOutput language: ${target}. Write the title, all five bullet points, the description and the keywords entirely in ${target}.`
      + (target === 'English'
        ? ' The raw product data and the retrieved rules may be in Chinese or another language: translate them into English rather than answering in their language, and leave no CJK characters in the output.'
        : ' Translate any raw data that is in another language; do not mix languages in one listing.')

    // The retrieved regulations and the built-in list are both included: the
    // built-in red lines are short, and they must survive even when retrieval
    // comes back with nothing useful.
    const retrievedRules = knowledge?.rules?.trim()
    // Only some platforms define a built-in list, so the block is omitted
    // rather than printed with an empty header.
    const builtinRules = docs.platformRules.map((r) => `- ${r}`).join('\n')
    const baselineSection = builtinRules ? `\n\nBaseline red lines (always apply):\n${builtinRules}` : ''
    const rulesSection = `Platform Rules to Follow (authoritative for ${platform}):\n${
      retrievedRules || '(no platform regulations were retrieved for this product)'
    }${baselineSection}`

    // Templates are structure examples, not policy — kept in their own section
    // so they cannot be mistaken for binding rules.
    const styleSection = knowledge?.style?.trim()
      ? `\n\nListing Style Reference (structure and tone only — not policy):\n${knowledge.style}`
      : ''

    return `You are an expert e-commerce listing optimizer for ${platform}.

Raw Product Data:
${JSON.stringify(product.rawData, null, 2)}

Please analyze this data to identify the product name, description, price, specifications, category, and any other relevant attributes. Then generate an optimized e-commerce listing.

${rulesSection}${styleSection}

Restricted Keywords to Avoid:
${docs.restrictedKeywords.join(', ')}

Please generate:
1. An optimized product title (max 200 characters)
2. Five compelling bullet points highlighting key features and benefits
3. A detailed product description with specifications
4. SEO keywords for better search visibility
${langInstruction}
Respond in JSON format:
{
  "title": "...",
  "bulletPoints": ["...", "..."],
  "description": "...",
  "keywords": ["..."]
}

Reminder: every string in that JSON must be written in ${target}.`
  }

  private async callDeepSeekAPI(
    prompt: string,
    product: SupplierProduct,
    platform: Platform,
    template: string,
    apiKey: string,
    language?: string,
  ): Promise<GeneratedListing> {
    const response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: this.buildMessages(prompt, language),
        temperature: 0.7,
        max_tokens: 2000,
      }),
    })

    if (!response.ok) {
      throw new Error(`DeepSeek API error: ${response.statusText}`)
    }

    const data = await response.json() as {
      choices: Array<{ message: { content: string } }>
    }
    const content = data.choices[0]?.message?.content || '{}'
    const parsed = JSON.parse(content)

    const complianceResults = ragService.checkCompliance(
      [parsed.title, ...parsed.bulletPoints, parsed.description].join(' '),
      platform,
    )

    return {
      id: uuid(),
      productId: product.id,
      title: parsed.title,
      bulletPoints: parsed.bulletPoints,
      description: parsed.description,
      keywords: parsed.keywords,
      seoScore: this.calculateSEOScore(parsed),
      complianceResults,
      platform,
      template,
      version: 1,
      createdAt: new Date().toISOString(),
      isDemo: false,
    }
  }

  private generateDemoListing(
    product: SupplierProduct,
    platform: Platform,
    template: string,
    language?: string,
  ): GeneratedListing {
    const label = getProductLabel(product)
    const complianceResults = ragService.checkCompliance(label, platform)
    const isNonEnglish = language && language !== 'english'

    const title = isNonEnglish
      ? `高级${label} - 高品质 | 快速发货 | 最佳价值`
      : `Premium ${label} - High Quality | Fast Shipping | Best Value`

    const bulletPoints = isNonEnglish
      ? [
          `【优质品质】专业级 ${label}，采用耐用材料制成，性能稳定可靠。`,
          `【多功能设计】符合人体工学设计，适合家庭、办公室和户外活动。`,
          `【易于使用】简单设置，直观控制，无需专业技术知识，几分钟即可上手。`,
          `【完美礼物】精美包装，是送给家人、朋友和同事的理想礼物。`,
          `【100%满意保证】30天无条件退款保证和专业客服支持。`,
        ]
      : [
          `【Premium Quality】Professional-grade ${label} crafted with durable materials for long-lasting performance and reliability.`,
          `【Versatile Design】Ergonomically designed for everyday use, suitable for home, office, and outdoor activities.`,
          `【Easy to Use】Simple setup with intuitive controls - no technical expertise required. Get started in minutes.`,
          `【Perfect Gift Choice】Elegant packaging makes it an ideal present for family, friends, and colleagues on any occasion.`,
          `【100% Satisfaction Guarantee】Backed by our 30-day money-back guarantee and responsive customer support team.`,
        ]

    const description = isNonEnglish
      ? `## 产品描述\n\n体验 ${label} 品质与价值的完美结合。精心设计，注重细节，为您带来卓越的性能体验。\n\n### 主要特点\n\n- **优质工艺**：采用高级材料制造\n- **现代设计**：时尚外观，适合各种场景\n- **稳定可靠**：始终如一的品质保障\n- **易于维护**：简单的清洁和保养说明\n\n### 包装内含\n\n1x ${label}\n1x 用户手册\n1x 配件包`
      : `## Product Description\n\nExperience the perfect blend of quality and value with our ${label}. Designed with attention to detail, this product delivers exceptional performance for all your needs.\n\n### Key Features\n\n- **Superior Build**: Manufactured using premium-grade materials\n- **Modern Design**: Sleek aesthetics that complement any setting\n- **Reliable Performance**: Consistent quality you can count on\n- **Easy Maintenance**: Simple cleaning and care instructions\n\n### What's Included\n\n1x ${label}\n1x User Manual\n1x Accessory Kit`

    const keywords = isNonEnglish
      ? [label.toLowerCase(), '高级品质', '快速发货', '最佳价值', '专业级', '耐用']
      : [label.toLowerCase(), 'premium quality', 'fast shipping', 'best value', 'professional grade', 'durable', 'satisfaction guarantee']

    return {
      id: uuid(),
      productId: product.id,
      title,
      bulletPoints,
      description,
      keywords,
      seoScore: 87,
      complianceResults,
      platform,
      template,
      version: 1,
      createdAt: new Date().toISOString(),
      isDemo: true,
    }
  }

  private calculateSEOScore(listing: { title: string; bulletPoints: string[]; description: string; keywords: string[] }): number {
    let score = 70
    if (listing.title.length >= 50 && listing.title.length <= 200) score += 10
    if (listing.bulletPoints.length >= 5) score += 5
    if (listing.keywords.length >= 5) score += 5
    if (listing.description.length > 200) score += 5
    return Math.min(score, 100)
  }
}

export const deepseekService = new DeepSeekService()
