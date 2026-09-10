# Shopify SEO and Content Rules

## Overview

Shopify provides a "Search engine listing preview" editor for products, collections, and pages, where the SEO title and meta description can be customized. These fields are not strictly enforced, but over-length content is truncated by search engines, and inappropriate content (such as false health claims or keyword stuffing) triggers compliance review under the Shopify Terms of Service or by payment providers.

---

## SEO Title & Meta Description

| Field | Length requirement | Description |
|------|---------|------|
| **SEO title (page title)** | The Shopify field allows about **70 characters**; within **60 characters** is recommended | Anything longer is truncated in search results; the page title is a well-established ranking factor |
| **Meta description** | No hard limit; Shopify recommends **≤ 160 characters**, and some practitioners recommend 150–155 | Not a direct ranking factor, but it significantly affects click-through rate (CTR) |
| **Blank behavior** | If left blank, Shopify automatically pulls a product description excerpt | Fill it in manually to avoid undesirable auto-generated content |
| **Uniqueness** | Every page should use a unique title and description | Duplicate titles compete against each other for ranking |

> Note: Search engines such as Google set no formal hard limit and truncate dynamically by device width, so these numbers are practical recommendations, not platform-enforced rules. Editor location: Product/Collection/Page → Search engine listing preview → Edit website SEO.

---

## Keyword Usage

| Rule | Description |
|------|------|
| **Core keyword placement** | Put key keywords at the front of the title, in the SEO title, and in the first paragraph |
| **Natural usage** | Keyword stuffing and hidden text are prohibited and may be treated as cheating |
| **Avoid repetition** | Do not repeat in the meta description all the words already in the title |
| **Long-tail keywords** | Combine long-tail keywords to cover specific use cases and improve conversion |
| **Internationalization** | Do not simply translate English keywords; research keywords independently per target market |
| **Image alt text** | Write descriptive alt text for images and translate it into each market's language |

---

## Structured Data

Shopify themes (such as Dawn) typically already output basic Product and Organization JSON-LD, but coverage is often incomplete.

| Rule | Description |
|------|------|
| **Format** | Use JSON-LD inside `<script type="application/ld+json">` in the `<head>` of the theme's `theme.liquid` |
| **Required Product fields** | `name`, `image`, `offers` (including `price`, `priceCurrency`) |
| **Recommended Product fields** | `availability` (`https://schema.org/InStock`/`OutOfStock`), `brand`, `sku`, `gtin`, `mpn` |
| **Price format** | Plain numbers only, with no currency symbol or thousands comma |
| **Variant handling** | For multiple variants, use `AggregateOffer` (`lowPrice`/`highPrice`/`offerCount`) or an array of per-variant Offer objects |
| **AggregateRating** | Add only when real reviews exist; fabricating ratings is prohibited |
| **Common issues** | The theme and a reviews app both output a duplicate Product block; availability always InStock; missing BreadcrumbList |
| **Validation tools** | Google Rich Results Test, Schema.org Validator, Search Console enhancement reports |

---

## Content Quality

| Rule | Description |
|------|------|
| **No thin content** | Empty descriptions, image-only pages with no text, and pages with just generic sentences are judged low quality |
| **No duplicate content** | Different products must not share an identical description; the same product across channels should be canonicalized |
| **Machine translation warning** | Low-quality machine translation counts as thin content; for high-value markets, human translation or thorough proofreading is recommended |
| **Accuracy and consistency** | Description, specifications, images, and price must be consistent and must not contradict one another |

---

## Prohibited & Misleading Content

| Violation type | Description |
|---------|------|
| **False health/medical claims** | The Shopify AUP prohibits selling health or medical products with false claims, and non-compliant supplements |
| **Disease claims** | Statements that a product "cures/treats/prevents" a disease are prohibited (cure / treat / prevent + disease name) |
| **Unauthorized health claims** | Only health claims and wording explicitly authorized by target market regulations (such as the EU EC 1924/2006 authorized list) |
| **Exaggerated claims** | Unverifiable absolutes such as "100% effective" or "permanent cure" |
| **Prohibited content** | Hate, violence, self-harm, and illegal-activity-related content |
| **Compliant wording** | Use structure/function claims such as "supports/may help" with necessary disclaimers (such as an FDA statement) |

> Note: This rule is not only a platform requirement but is also governed by the stricter "pseudo-pharmaceuticals" policies of Shopify Payments and third-party payment providers (such as Stripe), which can independently freeze payments.

---

## Multilingual & Markets

| Rule | Description |
|------|------|
| **URL structure** | Markets supports subfolders (`/fr/`), subdomains, and country top-level domains; subfolders are most SEO-friendly for most stores |
| **Hreflang** | Shopify Markets **automatically generates** hreflang tags from market and language configuration, and must include `x-default` |
| **Canonical** | Each language version should use a self-canonical rather than pointing to the default language version |
| **Translation tools and scope** | Use the official Translate & Adapt; automatic translation supports up to 2 languages (except policy pages); product pages, collection pages, blogs, menus, meta fields, alt text, and Handles can all be translated |
| **Localized URLs** | Translating the Handle improves local SEO (such as `/products/robe-ete-bleue`) |
| **Sitemap and redirects** | A separate sitemap per language is recommended; avoid geo-based forced redirects (which can block crawlers) and use a soft prompt plus a language switcher |

> Consequences of violation: over-length or duplicate metadata is truncated in search results and CTR drops; keyword stuffing and hidden text are demoted by search engines; false health claims lead to product takedown, frozen payments, and account review; AUP violations can suspend or terminate the store.

---

## Listing Compliance Checklist

### SEO metadata and keywords
- [ ] SEO title ≤ 60 characters (field limit about 70)
- [ ] Meta description ≤ 160 characters, unique per page, not left blank
- [ ] Core keywords at the front of the title and in the first paragraph, no stuffing, no hidden text
- [ ] Alt text written and translated for all images

### Structured data
- [ ] Product schema includes name / image / offers(price, priceCurrency)
- [ ] Price contains no currency symbol or thousands comma; availability reflects real inventory
- [ ] No duplicate Product blocks; validated with the Rich Results Test

### Content quality and compliance
- [ ] Description is not thin or duplicate content
- [ ] No false or exaggerated benefit claims and no disease treatment/prevention statements
- [ ] For supplements, local regulations and the authorized claims list have been checked

### Multilingual and markets
- [ ] hreflang auto-generated and includes x-default; each language version uses a self-canonical
- [ ] Handles, alt text, and meta fields translated
