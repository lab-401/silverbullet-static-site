# silverbullet-static-site

Static [Astro](https://astro.build) replica of **silverbullet.tools** (formerly a
Shopify store), built for hosting on **GitHub Pages behind Cloudflare**.

All 110 pages (22 pages × 5 locales: `en`, `/fr`, `/de`, `/it`, `/es`) are
reproduced visually identically to the original site, with all Shopify
platform code (analytics, checkout, wallets, pixels, cart APIs) stripped.

## Layout

| Path | Purpose |
| --- | --- |
| `scripts/scrape.mjs` | Mirrors pages + CDN assets from the live site into `scrape/` |
| `scripts/clean.mjs` | Strips Shopify code, localizes asset URLs, neutralizes forms |
| `scripts/split.mjs` | Splits cleaned pages into shared parts + per-page content (`src/scraped/`) |
| `src/pages/[...slug].astro` | Renders every route from the scraped records |
| `scripts/apply-base.mjs` | Post-build: prefixes root-absolute URLs when `BASE_PATH` ≠ `/` |
| `scripts/gen-seo-files.mjs` | Generates `sitemap.xml`, `robots.txt`, `agents.md`, `llms.txt` |
| `scripts/verify-fidelity.mjs` | DOM-equivalence gate: `dist/` vs cleaned scrape (110/110) |
| `scripts/shoot.mjs` + `scripts/visual-diff.mjs` | Live-vs-replica screenshot pixel comparison |
| `public/assets/` | All localized images/CSS/JS/fonts (originally on Shopify CDN) |

## Builds

Two build targets, controlled by env vars:

```bash
# Final build (custom domain at root)
npm run build            # BASE_PATH=/ SITE_URL=https://silverbullet.tools

# GitHub Pages staging (project subpath, noindex)
npm run build:pages      # BASE_PATH=/silverbullet-static-site/ STAGING=1
```

`STAGING=1` adds `<meta name="robots" content="noindex">` to every page and a
`Disallow: /` robots.txt. **When the real domain is pointed at this site,
remove `STAGING` and set `BASE_PATH=/` + `SITE_URL=https://silverbullet.tools`
in `.github/workflows/deploy.yml`** — that is the only switch needed.

Canonical/hreflang/JSON-LD URLs always point at `https://silverbullet.tools`
(the canonical domain), regardless of where the build is served from.

## Commerce placeholders

Shopify purchase/account functionality was stripped; the visual elements
remain and are tagged for re-linking (`grep -r "data-sb-migration" src/scraped`):

| Tag | Element | Action needed |
| --- | --- | --- |
| `buy-now` | "Buy it now" button on product pages | Point at new store's checkout link |
| `add-to-cart-form` | Add-to-cart form (inert) | Point button at new store |
| `cart-link` / `account-link` | Header icons (inert `href="#"`) | Re-link or leave |
| `newsletter-form` | Footer newsletter signup (inert) | Wire to mail provider |
| `search-form` | Header search (inert) | Optional: client-side search |
| `country-selector` | Footer country/currency selector (inert) | Cosmetic only |
| `language-selector` | Language switcher | Already works (static links) |

## QA

```bash
node scripts/verify-fidelity.mjs   # DOM equivalence vs scrape baseline
node scripts/shoot.mjs local both  # screenshots (needs astro preview --port 4322)
node scripts/shoot.mjs live both
node scripts/visual-diff.mjs       # qa/visual-report.json + diff masks
```
