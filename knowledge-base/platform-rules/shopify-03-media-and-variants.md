# Shopify Image, Media and Product Variant Rules

## Overview

Shopify has explicit limits on the format, size, and quantity of product media (images, videos, 3D models), plus structural caps on variant option and combination counts. Exceeding the media limit blocks uploads, and exceeding the variant limit prevents proper storefront display. Knowing these limits is a prerequisite for a fully rendered product detail page.

---

## Image Requirements

| Rule | Description |
|------|------|
| **Maximum file size** | **20 MB** |
| **Maximum pixel dimensions** | Shopify Help Center: maximum **5000 × 5000 px or 25 megapixels**; developer docs (GraphQL Admin API) state **4472 × 4472 px (about 20 megapixels)**, so the two sources differ slightly |
| **Supported formats** | JPEG, PNG, GIF, WEBP, HEIC |
| **Recommended dimensions** | **2048 × 2048 px**, aspect ratio **1:1 (square)** |
| **Recommended file size** | Compress to **under 500 KB**; WebP is 25%–35% smaller than JPEG |
| **Aspect ratio handling** | Themes are designed for 1:1; non-square images are cropped, letterboxed, or stretched |
| **Transparent background** | Use PNG when transparency is needed; otherwise prefer JPEG/WebP |
| **Zoom** | Higher resolution supports greater magnification but must balance against page load speed |

---

## Featured Image & Gallery

| Rule | Description |
|------|------|
| **Featured image** | The **first media** in the product media list, used on collection pages, the cart, checkout, and the homepage |
| **Changing the featured image** | Drag the media order in the admin |
| **Gallery order** | Recommended: main image → lifestyle image → detail image → size/specification image → packaging image |
| **Per-variant image** | Each variant can be assigned a dedicated image (variant image); typically only one main image per variant |
| **Alt text** | Every image should have descriptive alt text for SEO and accessibility |
| **Image consistency** | Main image and gallery should share a consistent style, lighting, and background |

---

## Video Requirements

| Rule | Description |
|------|------|
| **Maximum file size** | **1 GB** |
| **Duration** | Maximum **10 minutes**, minimum **0.25 seconds** |
| **Supported formats** | MOV, MP4, WEBM |
| **Resolution** | Up to 4K (width/height each no more than 4096 px), minimum 100 px |
| **Frame rate** | Up to 120 fps |
| **Recommended practice** | Clips of 30 seconds to 2 minutes; keep file size down for load speed |

---

## 3D Model Requirements

| Rule | Description |
|------|------|
| **Upload format** | GLB |
| **Served output format** | GLB and USDZ (for iOS AR) |
| **Maximum file size** | Within **15 MB** |
| **Use cases** | Products viewed from multiple angles, such as furniture, footwear, and consumer electronics |

---

## Media Limits by Plan

| Limit | Value |
|--------|------|
| **Total media per product** | Up to **250** (images + videos + 3D models combined) |
| **Video and 3D model count** | Basic/Starter 250; Grow 1,000; Advanced 5,000; Plus/Enterprise 50,000 |
| **Video storage** | Basic 50 GB; Grow/Advanced 500 GB; Enterprise 2 TB |
| **Total store file storage** | Basic 100 GB; Grow 300 GB; Advanced 500 GB; Plus 1 TB; Enterprise 10 TB |
| **Higher variant limits do not change media limits** | After the variant limit rose to 2048, the media limit of 250 was **not raised accordingly** |

---

## Variant Structure

| Rule | Description |
|------|------|
| **Option count limit (default)** | Up to **3 options** per product (such as Size, Color, Material) |
| **Option name/value length** | Each option name or value up to **255 characters** |
| **Total variant limit (default)** | Up to **100 variants** per product (total option combinations must not exceed 100) |
| **Extended variant limit** | Extended Variants support up to **2048 variants** via the GraphQL API; this is currently aimed at development stores/developer preview, and the admin still uses 100 as the default for live stores |
| **Storefront rendering** | Liquid themes render only the first **250 variants** on the product page |
| **Variant URLs** | Link to a specific variant with `?variant=<id>` |

### Variant best practices
- When combinations exceed 100: split into multiple products by main option, or use a variant app
- Remove non-existent combinations (not every color comes in every material) to reduce the count
- Variants of the same product must be essentially the same product; unrelated products must not be bound as variants
- Price, inventory, weight, and SKU can be set independently per variant

---

## SKU & Barcode

| Field | Rule |
|------|------|
| **SKU length** | ≤ **16 characters** recommended (4–8 is more practical in most catalogs) |
| **SKU uniqueness** | Unique within a store; **enforced** when using Shopify Fulfillment Network (SFN) |
| **SKU characters** | Numbers or numbers plus letters; avoid special symbols, spaces, and easily confused characters (0/O, 1/I) |
| **Barcode count** | Up to **20 barcodes** per variant, each up to **255 characters** |
| **Barcode types** | UPC, EAN, ISBN, GTIN, ASIN; the system validates against the standard once the type is declared |
| **Barcode uniqueness** | Use different barcodes per variant, especially with independently managed inventory |
| **SFN requirements** | Up to 5 barcodes per SKU and an industry-standard barcode containing a GTIN |

---

## Consequences of Violation

| Issue | Consequence |
|------|------|
| Image exceeds size or file limits | Upload fails, or automatic compression loses quality |
| Image dimensions do not match the theme ratio | Cropped, letterboxed, or stretched on the storefront, hurting conversion |
| More than 250 media items | Further uploads impossible |
| More than 100 variants (default) | New variants cannot be created, or storefront display breaks |
| Duplicate SKU/barcode | Inventory and channel integration errors; SFN products rejected |

---

## Listing Compliance Checklist

### Images
- [ ] Single file ≤ 20 MB and pixel dimensions within platform limits
- [ ] 2048 × 2048 px recommended with a 1:1 aspect ratio
- [ ] Format is one of JPEG/PNG/WEBP/GIF/HEIC
- [ ] Compressed to under 500 KB (recommended)
- [ ] Alt text filled in for every image

### Featured image and gallery
- [ ] The first media item is a compliant featured image
- [ ] Gallery order is main → lifestyle → detail → specification → packaging
- [ ] A dedicated image assigned to each variant (where applicable)

### Video and 3D
- [ ] Video ≤ 1 GB, ≤ 10 minutes, MOV/MP4/WEBM
- [ ] 3D model is GLB and ≤ 15 MB
- [ ] Total media per product ≤ 250

### Variants
- [ ] Options ≤ 3 and variants ≤ 100 (or Extended Variants in use)
- [ ] Option names and values ≤ 255 characters
- [ ] Non-existent combinations removed
- [ ] All variants belong to the same essential product

### SKU and barcode
- [ ] SKU is short (≤ 16 characters recommended) and unique within the store
- [ ] Barcodes ≤ 20 per variant, each ≤ 255 characters
- [ ] SFN products have a unique SKU and GTIN configured
