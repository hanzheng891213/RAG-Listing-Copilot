# Shopify Product Listing and Detail Page Rules

## Overview

Shopify imposes structural requirements on a product's title, description, Handle (URL), category, tags, price, and inventory fields. Unlike Amazon, Shopify is an independent storefront, so the platform enforces fewer hard field limits; more rules come from search engine display, sales channel (Google, Facebook) integrations, and the Shopify Terms of Service. Violating listing standards can lead to products being taken down, sales channels rejecting the store, store warnings, and in serious cases account suspension.

---

## Product Title

| Rule | Description |
|------|------|
| **Field limit** | Shopify help docs state no explicit hard limit; the Shopify ecosystem (CSV import, third-party connectors, API fields) generally uses **255 characters** |
| **Recommended length** | ≤ 60 characters so the title displays fully in Google search results; ≤ 120 characters is suggested for mobile display |
| **Required and uniqueness** | Title is required; the platform does not enforce uniqueness, but fully duplicated names within a store should be avoided |
| **Formatting prohibited** | ALL CAPS, repeated keyword stuffing, excessive emoji, and too many special symbols (!!!, ★★★) |
| **Content prohibited** | Promotional words ("Free Shipping", "Best Seller"), prices, contact information, URLs, competitor brand names |
| **Language** | Use the target market's language; proper nouns may remain in English |

Example: ✅ `Ceramic Coffee Mug 350ml - Matte Black, Dishwasher Safe`; ❌ `***BEST MUG!!!*** FREE SHIPPING!!!`

---

## Product Description

| Rule | Description |
|------|------|
| **Format** | Use the Shopify Rich Text Editor, switchable to HTML source via the `<>` button |
| **Character limit** | Shopify help docs specify no hard limit; some third-party connectors cap it at about **10,000 characters** |
| **Recommended length** | 150–400 English words, based on SEO and conversion experience |
| **Supported HTML tags** | `<p>` `<br>` `<strong>`/`<b>` `<em>`/`<i>` `<u>` `<a>` `<ul>` `<ol>` `<li>`; top-level elements must be paragraphs or lists, otherwise they are sanitized |
| **Prohibited tags** | Script and embed tags such as `<script>` and `<iframe>` are stripped by the system |
| **Content requirements** | The description must match the actual product; no exaggerated benefits, false promises, or misleading claims |
| **Images** | Images may be embedded in the description but also count toward the product's media limit |

Best practice: the first paragraph should explain "what this is and what problem it solves", use lists for specifications and what's in the box, and avoid copying supplier copy verbatim (duplicate content weakens SEO).

---

## Handle & URL Rules

| Rule | Description |
|------|------|
| **Character set** | Only lowercase letters, numbers, and hyphens `-`; no spaces |
| **Auto-generation** | Generated from the title; spaces and special characters become hyphens, and consecutive characters merge into a single `-` |
| **Uniqueness** | Must be unique; on collision the system appends a number (such as `potion`, `potion-1`) |
| **Title changes do not cascade** | After creation, changing the title **does not** update the Handle automatically; edit it manually |
| **Length** | No official limit; ≤ 50 characters recommended for concision |
| **Multilingual** | With Markets, translate the Handle per language (such as `/products/robe-ete-bleue`) |

---

## Product Type & Category

| Field | Description |
|------|------|
| **Product Category** | Chosen from a drop-down in the Shopify Standard Product Taxonomy (about 10,000 categories, 1,000+ attributes, three levels), answering "what product is this" |
| **Risk of no category** | Products without a category are marked **Uncategorized**, reducing discoverability on sales channels (Google, Facebook, Shop) |
| **Category Metafields** | Selecting a category unlocks its attributes (color, material, size, and so on), improving channel integration and filtering |
| **Product Type** | A free-text merchant-defined field for internal grouping; prefer the standard category |

---

## Tags & Collections

| Rule | Description |
|------|------|
| **Tags per product** | Up to **250 tags** |
| **Length of a single tag** | Up to **255 characters** |
| **Recommended tag length** | ≤ 16 characters for easier management |
| **Recommended character set** | Only plain letters, numbers, and hyphens `-`; avoid accented characters and symbols; guidance on capitalization varies, so consistent lowercase is recommended |
| **Collection types** | Manual collections and automated collections (Smart/Automated, matched by tags or conditions) |
| **Tag scope** | Tags apply at the product level only, not the variant level |

---

## Price & Inventory Fields

| Rule | Description |
|------|------|
| **Price** | Plain numbers only, without currency symbols or thousands separators |
| **Compare-at price** | The struck-through price must be **higher** than Price, otherwise it is an invalid comparison price |
| **Cost per item / Tax** | Cost per item is optional and not shown on the storefront; Charge tax must match target market tax rules |
| **SKU** | ≤ 16 characters recommended, unique within the same store |
| **Barcode** | Up to 20 barcodes per variant, each ≤ 255 characters; supports UPC/EAN/ISBN/GTIN/ASIN |
| **Inventory / Weight** | Quantity tracking and overselling policy can be set; weight affects shipping rates and should be filled in for accurate checkout |
| **Product status** | Active / Draft / Archived; must be published to the Online Store and relevant sales channels |

---

## General Listing Rules and Consequences of Violation

| Rule | Description |
|------|------|
| **No duplicate listings** | Do not create multiple duplicate pages for the same product (dilutes SEO) |
| **Category accuracy** | Products must go in the closest matching standard category |
| **Sales channels** | When integrating Google/Facebook, titles, descriptions, prices, and inventory must meet each channel's additional standards |
| **Prohibited content** | No prohibited items, counterfeits, or false health claims (see the prohibited products policy document) |
| **Consequences** | Irregular fields hurt SEO and channel review; false or exaggerated descriptions bring product removal and account warnings; counterfeit or prohibited goods bring product removal, frozen payments, and in serious cases store suspension or termination |

---

## Listing Compliance Checklist

### Title and description
- [ ] Title ≤ 255 characters (≤ 60 recommended), no ALL CAPS/stuffing/promotional words
- [ ] Description uses rich text, no `<script>`/`<iframe>`, not copied verbatim from the supplier
- [ ] Content matches the actual product with no false or exaggerated claims

### Handle / URL
- [ ] Only lowercase letters, numbers, and hyphens; unique and short (≤ 50 characters recommended)
- [ ] Handles translated for multilingual markets

### Category
- [ ] A standard Product Category is selected (not Uncategorized) with key Category Metafields filled in

### Tags and collections
- [ ] Tag count ≤ 250, individual tags ≤ 255 characters, added to the appropriate collections

### Price and inventory
- [ ] Price is plain numbers and Compare-at price is higher than Price
- [ ] SKU, weight, inventory, and overselling policy configured
- [ ] Status is Active and published to the target sales channels
