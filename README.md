# Instant Estimate Tool — `app.js`

A self-contained, embeddable multi-step pricing wizard. Drop a `<script>` tag and a pricing database onto any page and the tool builds its own UI, maps, and PDF output automatically.

---

## Embedding via jsDelivr

jsDelivr serves files from public GitHub repos with the correct `Content-Type` (JavaScript MIME type), making it safe to use as a `<script src>` in any page.

### URL format

```
https://cdn.jsdelivr.net/gh/issroofing/instant-estimate-tool@{version}/iq-instant-estimate.js
```

Replace {version} with a git tag **or** a full commit SHA. Using a tag is recommended for production sites, while a commit SHA can be used for maximum stability (e.g. if you want to ensure the exact same code runs even if you later amend the tag).

### Recommended — pin to a version tag

```html
<script src="https://cdn.jsdelivr.net/gh/issroofing/instant-estimate-tool@v1.2.0/iq-instant-estimate.js"></script>
```

### Lock to an exact commit (maximum stability)

```html
<script src="https://cdn.jsdelivr.net/gh/issroofing/instant-estimate-tool@a1b2c3d4e5f6/iq-instant-estimate.js"></script>
```

### Always-latest (not recommended for production)

```html
<script src="https://cdn.jsdelivr.net/gh/issroofing/instant-estimate-tool@main/iq-instant-estimate.js"></script>
```

> **Placement:** Add `<div id="iqMain"></div>` wherever you want the wizard UI to appear. The script injects its UI into this element. If no `#iqMain` element is found, the wizard falls back to appending to `<body>`.

---

## Configuration

Three constants are defined at the top of `initApp()` inside `app.js` and must be set before publishing:

| Constant | Default | Purpose |
|---|---|---|
| `debug` | `false` | Set to `true` to enable `console.log` output. All logging is silenced in production mode. |
| `MAPTILER_API_KEY` | *(set in file)* | MapTiler API key used for the map and geocoder. Get one free at [maptiler.com](https://www.maptiler.com/). |
| `contactURL` | `'/contact'` | Base URL of the contact/quote-request page. Query parameters are appended automatically. |

---

## Required HTML on the host page

The script injects its own wizard UI, styles, and map. **You do not need to add any wizard HTML yourself.** However, two data blocks must already be present in the page HTML before the script tag so the tool can read them.

---

### 1. Pricing database (required)

A hidden container that defines every product the tool can price. The script reads this on load; it can be `display:none` or `visibility:hidden`.

```html
<div class="iq-pricing-database" style="display:none;">

  <!-- One .iq-option per product/variant -->
  <div class="iq-option">
    <span class="iq-category-name">Roofing</span>
    <span class="iq-service-name">Asphalt Shingle Replacement</span>
    <span class="iq-product-name">Architectural Shingles — 30yr</span>
    <span class="iq-product-description">Standard architectural shingle, 30-year warranty.</span>
    <span class="iq-price-formula-low">{{roofArea}} * 3.50</span>
    <span class="iq-price-formula-high">{{roofArea}} * 4.25</span>
    <img class="iq-brand-logo" src="/images/brand-logo.png" alt="">
    <img class="iq-product-thumbnail" src="/images/product-thumb.png" alt="">
  </div>

  <!-- Add as many .iq-option blocks as you need -->

</div>
```

#### Required child elements within each `.iq-option`

| Element class | Type | Purpose |
|---|---|---|
| `.iq-category-name` | `<span>` | Top-level grouping shown on Step 1 (e.g. *Roofing*, *Siding*) |
| `.iq-service-name` | `<span>` | Sub-service shown on Step 2 (e.g. *Full Replacement*, *Repair*) |
| `.iq-product-name` | `<span>` | Product/material name shown on the final pricing breakdown |
| `.iq-product-description` | `<span>` | Short description shown under the product name |
| `.iq-price-formula-low` | `<span>` | Math expression for the low-end price (see [Formula syntax](#formula-syntax)) |
| `.iq-price-formula-high` | `<span>` | Math expression for the high-end price |
| `.iq-brand-logo` | `<img>` | Brand/manufacturer logo (optional but recommended) |
| `.iq-product-thumbnail` | `<img>` | Product photo thumbnail (optional but recommended) |

#### Formula syntax

Formulas are plain arithmetic expressions. Use `{{variable}}` placeholders that are replaced with the values measured from the map.

| Variable | Value |
|---|---|
| `{{roofArea}}` | Roof surface area in ft², adjusted for pitch (flat → steep multiplier applied automatically) |
| `{{wallArea}}` | Estimated wall area in ft², calculated from footprint perimeter × stories × ~9 ft ceiling height |
| `{{gutterLength}}` | Linear feet of gutters, derived from perimeter × the gutter-coverage percentage the user selects |

**Examples**

```
{{roofArea}} * 4.50
({{roofArea}} * 3.20) + ({{gutterLength}} * 8.00)
{{wallArea}} * 2.75 + 500
```

Only numbers, the four arithmetic operators (`+ - * /`), and parentheses are allowed. Any expression that contains other characters will evaluate to `0`.

---

### 2. Company info (recommended)

Used to populate the PDF estimate header. Can be `display:none`. All fields are optional — omit any child element you don't need.

```html
<div class="iq-company-info" style="display:none;">
  <img  class="iq-company-logo"         src="/images/company-logo.png" alt="">
  <span class="iq-company-name">        Acme Roofing Co.</span>
  <span class="iq-company-street-address">123 Main St</span>
  <span class="iq-company-city-state-zip">Springfield, IL 62701</span>
  <span class="iq-company-phone">       (555) 555-1234</span>
  <span class="iq-company-email">       info@acmeroofing.com</span>
  <span class="iq-company-website">     www.acmeroofing.com</span>
  <span class="iq-company-license">     License #RC-00001</span>
</div>
```

---

## Minimal complete page example

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Get an Instant Estimate</title>
</head>
<body>

  <!-- Company Info (read by app.js for PDF header) -->
  <div class="iq-company-info" style="display:none;">
    <img  class="iq-company-logo"          src="/images/logo.png" alt="">
    <span class="iq-company-name">         Acme Roofing Co.</span>
    <span class="iq-company-street-address">123 Main St</span>
    <span class="iq-company-city-state-zip">Springfield, IL 62701</span>
    <span class="iq-company-phone">        (555) 555-1234</span>
    <span class="iq-company-email">        info@acmeroofing.com</span>
    <span class="iq-company-website">      www.acmeroofing.com</span>
    <span class="iq-company-license">      License #RC-00001</span>
  </div>

  <!-- Pricing Database (read by app.js) -->
  <div class="iq-pricing-database" style="display:none;">
    <div class="iq-option">
      <span class="iq-category-name">Roofing</span>
      <span class="iq-service-name">Asphalt Shingle Replacement</span>
      <span class="iq-product-name">Architectural Shingles — 30yr</span>
      <span class="iq-product-description">Standard architectural shingle with 30-year warranty.</span>
      <span class="iq-price-formula-low">{{roofArea}} * 3.50</span>
      <span class="iq-price-formula-high">{{roofArea}} * 4.75</span>
      <img class="iq-brand-logo"       src="/images/brand.png" alt="">
      <img class="iq-product-thumbnail" src="/images/shingles.png" alt="">
    </div>
  </div>

  <!-- The wizard UI is injected into this element -->
  <div id="iqMain"></div>

  <script src="https://cdn.jsdelivr.net/gh/my-org/instant-estimate-tool@v1.2.0/app.js"></script>

</body>
</html>
```

---

## URL query parameters

### `service-category`

Pre-selects a category by name and skips Step 1 (category selection), dropping the user directly into Step 2 (service selection). The match is **case-insensitive**.

```
https://example.com/estimate?service-category=Roofing
```

If the value does not match any category in the pricing database, the wizard starts normally at Step 1.

---

## Contact form integration (`contact.html`)

When the user reaches Step 5, the **Request a Formal Quote** button opens `contactURL` with the following query parameters pre-filled:

| Parameter | Value |
|---|---|
| `street` | Street address selected on the map |
| `city` | City |
| `state` | State |
| `zip` | ZIP code |

The companion `contact.html` page reads these via `URLSearchParams` and fills the form fields automatically.

Additionally, `contact.html` reads saved estimates from `localStorage` (key: `iq-estimates`) and appends a formatted history block to the hidden `meta` field — filtered to estimates saved within the last **30 days**.

---

## localStorage

The tool stores saved estimates under the key `iq-estimates` as a JSON array. Each entry contains:

```json
{
  "savedAt": "2/25/2026, 10:32:00 AM",
  "service": "Asphalt Shingle Replacement",
  "street": "123 Main St",
  "city": "Springfield",
  "state": "IL",
  "zip": "62701",
  "buildings": [
    {
      "name": "Main House",
      "area": 1800,
      "products": [
        { "name": "Architectural Shingles — 30yr", "priceLow": 6300, "priceHigh": 8550 }
      ]
    }
  ]
}
```

---

## External dependencies loaded automatically

`app.js` loads all of its own dependencies at runtime — no additional `<link>` or `<script>` tags are required in the host page.

| Library | Version | Purpose |
|---|---|---|
| MapLibre GL JS | 4.3.2 | Interactive map |
| MapTiler Geocoding Control | latest | Address search |
| Turf.js | 6.5.0 | Geospatial area calculation |
| jsPDF | 2.5.1 | PDF estimate generation |
