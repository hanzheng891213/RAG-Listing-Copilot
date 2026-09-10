# Shopify SEO 与内容规范 (SEO & Content Rules)

## 概述

Shopify 为商品、集合、页面提供"搜索引擎上架预览"（Search engine listing preview）编辑入口，可自定义 SEO title 与 meta description。这些字段没有严格的技术强制，但长度超限会被搜索引擎截断，内容不当（如虚假健康声明、关键词堆砌）会触发 Shopify 服务条款或支付渠道的合规审查。

---

## SEO 标题与描述 (SEO Title & Meta Description)

| 字段 | 长度要求 | 说明 |
|------|---------|------|
| **SEO title（页面标题）** | Shopify 字段允许约 **70 个字符**；建议控制在 **60 字符以内** | 超出部分会在搜索结果中被截断；页面标题是公认的排名因素 |
| **Meta description** | 无硬性上限；Shopify 建议 **≤ 160 字符**，部分实践建议 150–155 字符 | 不是直接排名因素，但显著影响点击率（CTR）|
| **留空行为** | 留空时 Shopify 会自动截取商品描述片段 | 建议手动填写，避免自动生成内容不理想 |
| **唯一性** | 每个页面应使用独一无二的 title 与 description | 重复的标题会互相竞争排名 |

> 说明：搜索引擎（如 Google）不设正式硬性上限，而是按设备宽度动态截断，因此上述数值为实践建议而非平台强制规则。编辑入口：商品/集合/页面 → Search engine listing preview → Edit website SEO。

---

## 关键词使用 (Keyword Usage)

| 规则 | 说明 |
|------|------|
| **核心词位置** | 关键关键词放在标题前部、SEO title 与描述首段 |
| **自然使用** | 禁止关键词堆砌（keyword stuffing）与隐藏文字，可能被判定为作弊 |
| **避免重复** | 不要在 meta description 中重复标题中已有的全部词语 |
| **长尾词** | 结合长尾词覆盖具体使用场景，提升转化 |
| **国际化** | 不要直接翻译英文关键词，须按目标市场做独立关键词调研 |
| **图片 Alt 文本** | 为图片填写描述性 alt 文本，并翻译为各市场语言 |

---

## 结构化数据 (Structured Data)

Shopify 主题（如 Dawn）通常已输出基础的 Product 与 Organization JSON-LD，但覆盖往往不完整。

| 规则 | 说明 |
|------|------|
| **格式** | 使用 JSON-LD，置于 `<script type="application/ld+json">` 中，放在主题 `theme.liquid` 的 `<head>` |
| **Product 必需字段** | `name`、`image`、`offers`（含 `price`、`priceCurrency`）|
| **Product 推荐字段** | `availability`（`https://schema.org/InStock`/`OutOfStock`）、`brand`、`sku`、`gtin`、`mpn` |
| **价格格式** | 价格必须为纯数字，不能含货币符号或千分位逗号 |
| **变体处理** | 多变体用 `AggregateOffer`（`lowPrice`/`highPrice`/`offerCount`）或逐变体 Offer 数组 |
| **AggregateRating** | 仅在存在真实评价时添加，禁止伪造评分 |
| **常见问题** | 主题与评价应用同时输出造成重复 Product 块；availability 恒为 InStock；缺少 BreadcrumbList |
| **验证工具** | Google Rich Results Test、Schema.org Validator、Search Console 增强报告 |

---

## 内容质量要求 (Content Quality)

| 规则 | 说明 |
|------|------|
| **拒绝薄内容** | 空描述、纯图片无文字、仅几句套话的页面会被搜索引擎判定为低质量 |
| **拒绝重复内容** | 不同商品不得使用完全相同的描述；同一商品多渠道需做规范化处理 |
| **机器翻译警示** | 低质量机器翻译被视为薄内容；高价值市场建议人工翻译或深度校对 |
| **准确一致** | 描述、规格、图片、价格必须互相一致，不得前后矛盾 |

---

## 禁用内容与夸大宣传 (Prohibited & Misleading Content)

| 违规类型 | 说明 |
|---------|------|
| **虚假健康/医疗声明** | Shopify AUP 明确禁止销售作出虚假声明的健康或医疗产品，及不合规的补充剂 |
| **疾病声明** | 禁止"治愈/治疗/预防"某疾病的表述（cure / treat / prevent + 疾病名）|
| **未授权健康声明** | 仅可使用目标市场法规明确授权的健康声明与措辞（如欧盟 EC 1924/2006 授权清单）|
| **夸大宣传** | 禁止"100% 有效""永久根治"等无法证实的绝对化表述 |
| **违禁内容** | 禁止仇恨、暴力、自残、违法活动相关内容 |
| **合规措辞** | 使用"supports/may help"等结构功能声明，并附必要免责声明（如 FDA 声明）|

> 注意：该规则不仅是平台要求，也受 Shopify Payments 与第三方支付渠道（Stripe 等）更严格的"伪药品"（pseudo-pharmaceuticals）政策约束，可能单独导致支付被冻结。

---

## 多语言与市场适配 (Multilingual & Markets)

| 规则 | 说明 |
|------|------|
| **URL 结构** | Markets 支持子目录（`/fr/`）、子域名、国家顶级域名；子目录对多数店铺 SEO 最友好 |
| **Hreflang** | Shopify Markets 依据市场与语言配置**自动生成** hreflang 标签，需包含 `x-default` |
| **Canonical** | 各语言版本应使用自指向（self-canonical），而非指向默认语言版本 |
| **翻译工具与范围** | 用官方 Translate & Adapt，自动翻译最多支持 2 种语言（政策页除外）；商品页、集合页、博客、菜单、meta 字段、alt 文本、Handle 均可翻译 |
| **本地化 URL** | 建议翻译 Handle 以提升本地 SEO（如 `/products/robe-ete-bleue`）|
| **Sitemap 与重定向** | 建议各语言独立 sitemap；避免基于地理位置的强制跳转（可能屏蔽爬虫），改用软提示 + 语言切换器 |

> 违规后果：元数据超长/重复会被搜索结果截断、CTR 下降；关键词堆砌与隐藏文字会被搜索引擎降权；虚假健康声明会导致商品下架、支付冻结与账户审查；违反 AUP 内容可能致店铺暂停或终止。

---

## Listing 合规检查清单

### SEO 元数据与关键词
- [ ] SEO title ≤ 60 字符（字段上限约 70）
- [ ] Meta description ≤ 160 字符，且各页面唯一、未留空
- [ ] 核心关键词位于标题前部与描述首段，无堆砌、无隐藏文字
- [ ] 已为所有图片填写并翻译 alt 文本

### 结构化数据
- [ ] Product schema 含 name / image / offers(price, priceCurrency)
- [ ] 价格不含货币符号与千分位逗号，availability 按真实库存输出
- [ ] 页面无重复 Product 块，已通过 Rich Results Test 验证

### 内容质量与合规
- [ ] 描述非薄内容、非重复内容
- [ ] 无虚假/夸大功效声明，无疾病治疗/预防类表述
- [ ] 补充剂类目已核对当地法规与授权声明清单

### 多语言与市场
- [ ] hreflang 自动生成且含 x-default，各语言版本使用 self-canonical
- [ ] Handle、alt 文本、meta 字段已翻译
