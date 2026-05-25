import type { SupplierProduct, GeneratedListing, Platform, ComplianceResult } from '../types/index.js'
import { ragService } from '../rag/ragService.js'
import { v4 as uuid } from 'uuid'

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || ''
const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1'

function getProductLabel(product: SupplierProduct): string {
  const values = Object.values(product.rawData).filter((v) => v)
  return values[0] || `Product ${product.id.slice(0, 6)}`
}

export class DeepSeekService {
  async generateListing(
    product: SupplierProduct,
    platform: Platform,
    template: string,
  ): Promise<GeneratedListing> {
    const label = getProductLabel(product)
    const relevantDocs = ragService.searchRelevantDocs(label, platform)

    const prompt = this.buildPrompt(product, platform, template, relevantDocs)

    if (DEEPSEEK_API_KEY) {
      return this.callDeepSeekAPI(prompt, product, platform, template)
    }

    return this.generateDemoListing(product, platform, template)
  }

  private buildPrompt(
    product: SupplierProduct,
    platform: Platform,
    _template: string,
    docs: ReturnType<typeof ragService.searchRelevantDocs>,
  ): string {
    return `You are an expert e-commerce listing optimizer for ${platform}.

Raw Product Data:
${JSON.stringify(product.rawData, null, 2)}

Please analyze this data to identify the product name, description, price, specifications, category, and any other relevant attributes. Then generate an optimized e-commerce listing.

Platform Rules to Follow:
${docs.platformRules.map((r) => `- ${r}`).join('\n')}

Restricted Keywords to Avoid:
${docs.restrictedKeywords.join(', ')}

Please generate:
1. An optimized product title (max 200 characters)
2. Five compelling bullet points highlighting key features and benefits
3. A detailed product description with specifications
4. SEO keywords for better search visibility

Respond in JSON format:
{
  "title": "...",
  "bulletPoints": ["...", "..."],
  "description": "...",
  "keywords": ["..."]
}`
  }

  private async callDeepSeekAPI(
    prompt: string,
    product: SupplierProduct,
    platform: Platform,
    template: string,
  ): Promise<GeneratedListing> {
    const response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: 'You are a helpful e-commerce listing assistant.' },
          { role: 'user', content: prompt },
        ],
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
    }
  }

  private generateDemoListing(
    product: SupplierProduct,
    platform: Platform,
    template: string,
  ): GeneratedListing {
    const label = getProductLabel(product)
    const complianceResults = ragService.checkCompliance(label, platform)

    return {
      id: uuid(),
      productId: product.id,
      title: `Premium ${label} - High Quality | Fast Shipping | Best Value`,
      bulletPoints: [
        `【Premium Quality】Professional-grade ${label} crafted with durable materials for long-lasting performance and reliability.`,
        `【Versatile Design】Ergonomically designed for everyday use, suitable for home, office, and outdoor activities.`,
        `【Easy to Use】Simple setup with intuitive controls - no technical expertise required. Get started in minutes.`,
        `【Perfect Gift Choice】Elegant packaging makes it an ideal present for family, friends, and colleagues on any occasion.`,
        `【100% Satisfaction Guarantee】Backed by our 30-day money-back guarantee and responsive customer support team.`,
      ],
      description: `## Product Description\n\nExperience the perfect blend of quality and value with our ${label}. Designed with attention to detail, this product delivers exceptional performance for all your needs.\n\n### Key Features\n\n- **Superior Build**: Manufactured using premium-grade materials\n- **Modern Design**: Sleek aesthetics that complement any setting\n- **Reliable Performance**: Consistent quality you can count on\n- **Easy Maintenance**: Simple cleaning and care instructions\n\n### What's Included\n\n1x ${label}\n1x User Manual\n1x Accessory Kit`,
      keywords: [
        label.toLowerCase(),
        'premium quality',
        'fast shipping',
        'best value',
        'professional grade',
        'durable',
        'satisfaction guarantee',
      ],
      seoScore: 87,
      complianceResults,
      platform,
      template,
      version: 1,
      createdAt: new Date().toISOString(),
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
