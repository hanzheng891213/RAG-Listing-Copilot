# eBay Title, Subtitle and Item Specifics

## Overview

The title is central to ranking in eBay's search algorithm Cassini and to buyer clicks; Item Specifics determine whether a listing is matched by category filters and can use the Catalog. This document (based on the eBay US site) covers the 80-character title limit and prohibited content, the 55-character subtitle limit, required Item Specifics, and Brand/MPN/GTIN rules. Non-compliant titles or specifics can hide or remove a listing, and falsified specifics can also trigger "item not as described" disputes and account penalties.

---

## Title Requirements

| Rule | Description |
|------|------|
| **Maximum length** | **80 characters** (including spaces and all punctuation); exceeding it returns a form error |
| **Recommended length** | 75–80 characters for maximum visibility; under 60 characters usually wastes space |
| **Display truncation** | Mobile search shows roughly the first 50–55 characters, desktop roughly 65–70, so **core keywords must come first** |
| **Plain text** | HTML tags prohibited |
| **Capitalization** | ALL CAPS prohibited |
| **Special characters** | Subscripts/superscripts and symbols such as ♥, ™, ½, ° prohibited; replace with searchable words |
| **Promotional words prohibited** | "WOW", "L@@K", "GREAT DEAL", "MUST SEE", "Free Shipping" and similar |
| **Stuffing prohibited** | No repeating the same word or stacking multiple brands |
| **Prohibited information** | No store name, username, URL, or contact information |
| **Accuracy** | No spelling errors, no false or misleading information |

### Title examples
- ✅ Correct: `Apple iPhone 15 Pro Max 256GB Natural Titanium Unlocked New`
- ❌ Incorrect: `***HOT*** iPhone 15 Pro Max!!! L@@K FREE SHIPPING BEST DEAL!!!`

### Recommended structure
Brand + product name + model/size + key feature + condition (for example, `Vintage Pyrex Butterprint Mixing Bowl 443 Blue White 1 1/2 Qt`)

---

## Subtitle

| Rule | Description |
|------|------|
| **Maximum length** | **55 characters** (including spaces and punctuation); cannot be saved if exceeded |
| **Fee** | A **paid optional upgrade**; rates vary by listing format, item price, and category, and the price shown on the listing form is authoritative |
| **Indexing** | Subtitle text is **not indexed by Cassini search**; it serves only as display copy to improve click-through rate |
| **Content** | May add selling points, accessories, condition, or specifications; must be 100% accurate to the item |
| **Prohibited content** | Same as the title: no promotional words, contact information, external links, or special symbols |
| **Character note** | `&` counts as 5 characters in some tools |

> Tip: Put all keywords in the main title; the subtitle is for supplementary display only.

---

## Item Specifics

| Rule | Description |
|------|------|
| **Field tiers** | Each category has roughly 5–30+ fields, divided into **Required**, **Recommended**, and **Optional** |
| **Required enforced** | If a required specific is missing, eBay **rejects the listing or revision** |
| **Accuracy** | Required specifics must be accurate and complete; do not use the wrong field (for example, a brand in the size field) |
| **Placeholders prohibited** | If the manufacturer provides the information, no placeholders such as "Does not apply", "N/A", "Unbranded", or generic |
| **Condition consistency** | The selected condition must match the title, description, and item specifics |
| **Category changes** | Required fields per category change over time, so long-running listings may become non-compliant |
| **Purpose** | Specifics power buyer filters and catalog matching; incomplete specifics reduce visibility |

---

## Brand / MPN / GTIN Requirements (Product Identifiers)

Under the **Product Identifier Mandate**, if a category requires Brand/MPN/GTIN and they are missing, the item **cannot be listed or updated**. Use `GetCategoryFeatures` to determine whether a category enforces this.

| Identifier | Rule |
|------|------|
| **Brand** | Must be a real brand name (such as Apple or Nike). Placeholder terms ("Brand new", "Made in China", "See description"), pure special characters, and single letters are prohibited; if truly unbranded, use **Unbranded** |
| **MPN (Manufacturer Part Number)** | Letters and numbers that uniquely identify the part; must not be a GTIN, title, or brand name, and not pure symbols or invalid values such as "see desc" or "compatible" |
| **GTIN (EAN/UPC/ISBN/JAN)** | UPC is **12 digits**, EAN usually **13** (occasionally 8 or 14), ISBN must conform to ISBN-10/13, JAN is **13 digits**; must go in the designated field and must not be invented |
| **When no identifier exists** | If there is no MPN/GTIN, **"Does not apply"** may be used (acceptable text varies by site) |
| **Brand-model matching** | Brand and model must correspond (a ZTE phone must not be listed as an iPhone 6) |
| **Variation requirements** | In a variation listing, different variations **must not reuse the same GTIN**; GTIN is specified at the variation level and Brand at the product level |

---

## Category & Catalog

| Rule | Description |
|------|------|
| **Correct categorization** | Items must be placed in the correct browse tree category |
| **Catalog-enforced categories** | Some categories **require eBay Catalog** when a matching product exists (such as cell phones 9355, digital cameras 31388, televisions 3320, GPS 156955) |
| **ePID** | The eBay product identifier, similar to an ASIN, takes precedence over GTIN for catalog matching |
| **Catalog benefits** | Matching a catalog entry can auto-populate title, description, item specifics, and stock images |
| **Consequences of no match** | Limited visibility, and potentially listing removal |
| **Description not replaced** | Catalog information does not replace the seller's own description; the seller remains responsible for the content |

---

## Keywords and Search Optimization

| Rule | Description |
|------|------|
| **Cassini weighting** | The first **5–7 words** carry the most weight; exact phrase matches are prioritized |
| **Relevance** | Every word must be directly relevant to the item sold |
| **Comparison terms prohibited** | "shirt not pants", "like Chanel", "not Supreme" (a disclaimer is equivalent to a claim) |
| **Compatibility phrasing** | Accessories must place "fits", "for", or "compatible with" **before** the brand/model; in jewelry, clothing, and accessories it must not precede the brand name |
| **Prohibited practices** | No question-mark keywords (such as "antique?"), hidden text, or drop-down manipulation of search |
| **Synonyms** | Synonyms may be added naturally (such as "laptop / notebook") to widen matches |

---

## Listing Compliance Checklist

### Title
- [ ] Length ≤ 80 characters
- [ ] Key information within the first 50 characters
- [ ] No ALL CAPS
- [ ] No special symbols (♥ ™ ½ °)
- [ ] No promotional words (WOW / L@@K / Free Shipping)
- [ ] No repeated words or brand stacking
- [ ] No store name, username, or URL

### Subtitle
- [ ] Length ≤ 55 characters
- [ ] Content matches the item
- [ ] No promotional words or contact information

### Item Specifics
- [ ] All Required fields filled in
- [ ] Values accurate, not placeholder terms
- [ ] Condition matches the title/description
- [ ] Specifics entered in the correct fields

### Brand / MPN / GTIN
- [ ] Brand is a real brand or Unbranded
- [ ] MPN is alphanumeric and unique
- [ ] GTIN has the correct digit count (UPC 12 / EAN 13)
- [ ] GTIN not reused across variations

### Category and keywords
- [ ] Listed in the correct category
- [ ] Catalog used in catalog-enforced categories
- [ ] No comparison terms or disclaimers
- [ ] Compatibility phrasing uses leading for/fits
