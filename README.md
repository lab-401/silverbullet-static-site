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
| `scripts/patch-assets.mjs` | Patches theme JS for static hosting (locale switcher navigates instead of POSTing to Shopify) |
| `scripts/fetch-feeds.mjs` | Mirrors the blog/collection Atom feeds into `public/` |
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

## Commerce

Purchasing goes through **Lab401.com, the exclusive SilverBullet
distributor**. `public/assets/sb-buy.js` routes every Buy-it-now /
Add-to-cart click to the Lab401 cart permalink
(`https://lab401.com/cart/53597858595163:<qty>`, SilverBullet 2), honoring
the nearest quantity selector. Header cart/login links are removed.

Element markers (`grep -r "data-sb-migration" src/scraped`):

| Tag | Element | State |
| --- | --- | --- |
| `buy-now` | "Buy it now" button | Navigates to Lab401 checkout |
| `add-to-cart-form` | Add-to-cart form | Submits to Lab401 checkout |
| `buy-legend` | Distributor caption under buy buttons | Localized, injected by clean.mjs |
| `faq-distributor` | FAQ entry about Lab401 | Localized, injected by clean.mjs |
| `newsletter-form` | Footer newsletter signup | POSTs to Lab401.com's newsletter (Shopify customer form) |
| `newsletter-legend` | Caption under the newsletter form | Localized, injected by clean.mjs |
| `search-form` | Header search (inert) | Optional: client-side search |
| `cart-form` | Hidden cart-notification checkout form (inert) | None |
| `language-selector` | Language switcher | Works (static links + patched theme JS) |
| `static-shims` | Injected head script: blocks langify auto-redirect, stubs cart XHR | None |

Intentional design deviations from the original site: the footer
country/currency selector is removed entirely (static site, EUR only);
langify's browser-language auto-redirect is disabled (bad for SEO/UX);
translations are the original server-rendered locale pages (source
translations), served as static per-locale HTML with hreflang clusters.

The 16 locale product pages (never translated on the live site) are
translated by `scripts/translate-products.mjs`: source-translation glossary
harvested from the locale pages, DeepL Pro (key read at runtime from
`DEEPL_KEY` env or the stock-bot config — never committed) with a brand +
domain-term glossary and lock-picking context, cached in
`scrape/translations-cache.json` (re-runs cost zero API characters). Run
order: clean → split → translate-products → patch-assets (`npm run
pipeline`). The fidelity verifier checks these pages structurally
(markup must match the EN template; text may differ).

## QA

```bash
node scripts/verify-fidelity.mjs   # DOM equivalence vs scrape baseline
node scripts/shoot.mjs local both  # screenshots (needs astro preview --port 4322)
node scripts/shoot.mjs live both
node scripts/visual-diff.mjs       # qa/visual-report.json + diff masks
```
