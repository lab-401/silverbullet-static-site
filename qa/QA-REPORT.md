# QA Report — silverbullet.tools static replica

Date: 2026-07-14
Scope: visual diff (8 pairs), runtime probes (console, links, interactions, staging deploy), SEO (heads/schema, seo-files, AI discoverability).
Probe artifacts: `qa/probe-console.mjs`, `qa/check-internal-links.mjs`, `qa/probe-interactions.mjs`, `qa/probe-interactions-focus.mjs`, `qa/probe-zoom.mjs`, `qa/interactions-report.json`, `qa/visual-report.json`.

---

## 1. Verdict summary

| Severity (deduplicated) | Count |
|---|---|
| High | 4 |
| Medium | 7 |
| Low | 9 |
| Expected/accepted deltas | 8 visual pairs + known external links |
| Info confirmations | 25+ checks pass |

**Overall assessment: SHIP-BLOCKED on 4 high-severity defects; otherwise the replica is in very good shape.**
Visual fidelity is effectively pixel-perfect (worst mismatch 0.027%, all attributable to the intentional localized buy-button). All 110 pages build, all 763 internal URL references resolve except the PDF/Atom items below, staging deploy is fully functional with zero asset 404s, and sitemap/hreflang/robots/agents.md/llms.txt are structurally correct. The blockers are: a broken user-facing PDF download, a broken language-switcher click, syntactically invalid Product JSON-LD on the flagship product, and 16 localized product pages publishing contradictory canonical/hreflang signals. A cluster of medium issues stems from one root cause: residual Shopify runtime code (cart sync, MCP/ShopPay bootstrap, cart routes) that survived the scrape and should be stripped in `scripts/clean.mjs`.

---

## 2. Defects to fix (deduplicated, prioritized)

### HIGH

**H1. Broken download link: `/assets/silverbullet-decoding-matrix.pdf` missing (all 5 locales)**
- Symptom: "How to use the Silver Bullet" pages link to the decoding-matrix PDF; the file was never scraped. 5 unique missing URLs (`/assets/...` plus `/de|/es|/fr|/it/assets/...`), 1 referencing page each. Only user-facing broken link on the site.
- Root cause: `scripts/scrape.mjs` / `scripts/fetch-missing.mjs` only captured referenced images, not this PDF; locale pages also carry locale-prefixed hrefs to a non-locale-scoped asset.
- Fix: download `https://silverbullet.tools/assets/silverbullet-decoding-matrix.pdf` into `public/assets/` (lands in `dist/assets/`); add it to `scripts/fetch-missing.mjs` so re-scrapes keep it. In `scripts/clean.mjs`, normalize the locale-prefixed hrefs (`/de/assets/...` etc.) to the single root path `/assets/silverbullet-decoding-matrix.pdf`.

**H2. Footer language selector click does not navigate (diverges from live)**
- Symptom: clicking "Français" on `/pages/faq` does nothing. Verified: replica performs `POST /pages/faq` (no-op) while live does `POST /localization -> 302 -> /fr/pages/faq`.
- Root cause: the scraped theme asset `localization-form.*.js` intercepts anchor clicks with `preventDefault()` then calls `form.submit()` programmatically, which bypasses the migration shim's `onsubmit="return false"` on the neutered form (`action="#"`, `data-sb-migration="language-selector"`). The anchors themselves already carry correct locale hrefs.
- Fix (either): (a) patch the copied `localization-form.*.js` during asset processing in `scripts/clean.mjs` so `onItemClick` does `if (form && form.dataset.sbMigration) { window.location.href = event.currentTarget.getAttribute('href'); return; }` before the `form.submit()` path; or (b) inject a site-wide shim script (via `src/pages/[...slug].astro` or the shared postlude in `scripts/split.mjs` output) that listens on `localization-form a[data-value]` and calls `location.assign(anchor.getAttribute('href'))`. Same pattern applies to the country selector. Re-run `qa/probe-interactions.mjs` until `replica.desktop.lang-selector-click-navigates` passes.

**H3. SilverBullet 2 Product JSON-LD is invalid JSON — leading-zero `gtin13` (15 blocks, 10 pages)**
- Symptom: `"gtin13": 0798118881917` is an illegal JSON number literal; `JSON.parse` rejects the entire block. The flagship product page has NO parseable Product structured data in any locale (`products/silver-bullet-2` + `{fr,de,it,es}` variants, plus 2 blocks each on all 5 locale homepages). Lenient parsers corrupt the GTIN to 12 digits.
- Root cause: GTIN emitted unquoted by whichever stage writes/passes through the Product JSON-LD (scraped source carried through `scripts/clean.mjs` / `scripts/split.mjs` untouched).
- Fix: quote it as a string — `"gtin13": "0798118881917"` (schema.org expects Text). Apply as a transform in `scripts/clean.mjs` (regex on `"gtin13":\s*0\d+`) so re-scrapes stay fixed. Add a build gate that strict-parses every `application/ld+json` block in `dist` (10-line Node script; can live in `scripts/verify-fidelity.mjs` or `qa/workflow-qa.mjs`).

**H4. 16 localized product pages are untranslated EN copies with `lang="en"` and EN canonicals contradicting hreflang**
- Symptom: `{fr,de,it,es}/products/{silver-bullet,silver-bullet-2,spare-tips,replacement-case}` all have `html lang="en"`, canonical pointing at the EN URL, and untranslated English content — while their hreflang set declares them the localized variants. Search engines will drop the localized product URLs; the signals are self-contradictory.
- Root cause: `scripts/scrape.mjs` / `scripts/split.mjs` fell back to copying the EN product pages into locale slots without localizing head metadata; `scripts/gen-seo-files.mjs` then lists them in the sitemap/hreflang cluster as real localized pages.
- Fix (pick one, consistently):
  - (a) Scrape/serve the actual translated product pages, with self-referencing canonical `https://silverbullet.tools/<locale>/products/<handle>` and `lang="<locale>"` (fix in `scripts/scrape.mjs`/`scripts/split.mjs` where the locale variant is materialized); or
  - (b) if intentionally untranslated, remove these 16 URLs from hreflang alternates and the sitemap in `scripts/gen-seo-files.mjs` (and ideally don't publish them at all).

### MEDIUM

**M1. Shopify cart AJAX 404s + follow-on JSON-parse console error on every page (all 10 probed)**
- Symptom: each page load fires `GET /cart/update.js` (default/`de`) or `GET /<locale>/cart.js`, gets the HTML 404 page, then logs `SyntaxError: Unexpected token '<' ... is not valid JSON`.
- Root cause: scraped langify runtime `shopifyAPI` helper (`getCart`/`updateCartAttributes`) in `src/scraped/<locale>/_shared/postlude.*.html` (~lines 2993-3029, e.g. `src/scraped/en/_shared/postlude.0.html`) builds `root_url + '/cart.js'` / `'/cart/update.js'`. The existing `dist/cart.js` stub only covers the un-prefixed GET `/cart.js` case.
- Fix: neutralize the langify cart sync in the postlude files via `scripts/clean.mjs` (strip/no-op the `shopifyAPI` cart calls, or guard `LyHelper.ajax` to skip URLs matching `/cart(\.js|\/update\.js)$`). Alternative: ship static JSON stubs in `public/` at `/cart.js`, `/{locale}/cart.js`, `/cart/update.js` with `Content-Type: application/json` and an empty-cart payload. Fixing this removes both console errors.

**M2. Head links to nonexistent Atom feeds (50 pages)**
- Symptom: `<link rel="alternate" type="application/atom+xml">` points to `{,/de,/es,/fr,/it}/blogs/news.atom` and `.../collections/frontpage.atom` — 10 unique 404 URLs for feed readers/crawlers.
- Root cause: leftover Shopify head tags carried through the scrape; no static feed is generated.
- Fix: strip the atom `<link>` tags in `scripts/clean.mjs`, or generate one static Atom feed for the news blog (e.g. `@astrojs/rss` wired into the Astro build / `scripts/gen-seo-files.mjs`) and point all locale variants at the single feed.

**M3. Dead Shopify machine endpoints still advertised in page source (all pages)**
- Symptom: inline `<head>` scripts ship `window.Shopify.MCP.enabled = true` with `mcpEndpoint = "https://silverbullet.tools/api/mcp"` (does not exist; also leaks `sbtools.myshopify.com`), `window.ShopifyPay.apiHost = "shop.app/pay"`, `window.routes` with `cart_add_url:'/cart/add'` etc., a literal `<form action="/cart" method="post">` checkout form in the cart-notification partial, and dormant langify rewrite code referencing `cdn.shopify.com`/`cdn.shopifycdn.net`. `product-form.*.js` still intercepts add-to-cart submits and POSTs `/cart/add` (404). Agents/crawlers honoring these conventions hit dead endpoints; it also contradicts agents.md's correct "no server-side API" statement.
- Root cause: Shopify runtime bootstrap blocks survived the scrape-to-static transform.
- Fix in `scripts/clean.mjs`: strip the `Shopify.MCP` and `ShopifyPay` script blocks (match on those strings), remove/neuter the `window.routes` block, delete or neutralize the `action="/cart"` form in the cart-notification partial, drop `product-form.*.js` and `predictive-search.js` from the copied assets (or stop referencing them), and remove the leftover langify translation-rewrite script.

**M4. Agent docs misdescribe the buying path; `data-sb-migration` placeholders undocumented**
- Symptom: `agents.md` says "Purchasing: use the Buy buttons on the product pages" but the buy-now button (`data-sb-migration="buy-now"`) is an inert placeholder and add-to-cart is neutralized; no doc anywhere (agents.md, llms.txt, HTML comments) explains the `data-sb-migration` marker system (values: buy-now, add-to-cart-form, cart-link, search-form, country-selector, language-selector, langify-no-redirect).
- Root cause: `scripts/gen-seo-files.mjs` writes aspirational copy that predates the placeholder strategy.
- Fix in `scripts/gen-seo-files.mjs`: rewrite the Purchasing line to state the real path (placeholders pending checkout migration; how to actually buy today), and add a short "Site status / placeholders" section documenting `data-sb-migration`.

**M5. Missing `<meta name="description">` on blog index and collection pages (10 pages)**
- Symptom: `blogs/news/` and `collections/frontpage/` in all 5 locales lack a plain meta description (og:description/twitter:description exist). Other 100 pages are fine.
- Fix: inject a meta description for these two templates — reuse the already-generated `og:description` content — in `scripts/clean.mjs` (head transform) or the head assembly in `src/pages/[...slug].astro`.

**M6. Two `<h1>` elements on the FAQ page (all 5 locales)**
- Symptom: page-title "FAQ" h1 plus an in-body "SilverBullet Tools FAQ" h1 in the rich-text content.
- Fix: demote the in-content heading to `<h2>` — a targeted transform on the FAQ body in `scripts/clean.mjs` (or fix the scraped content in `src/scraped/*/pages/faq`).

**M7. Spare Tips Product JSON-LD has no SKU (product level and all 6 offers; offers carry `"sku":""`)**
- Symptom: strict shopping consumers get no SKU for spare-tips; other products have SKUs (SILVERBULLET, SB-SPARE-CASE). agents.md's "price, SKU, GTIN" claim is thereby overstated (GTIN in fact only exists on silver-bullet-2).
- Fix: backfill variant SKUs into the spare-tips JSON-LD (transform in `scripts/clean.mjs` or source data), and soften/correct the agents.md claim in `scripts/gen-seo-files.mjs` ("price, availability, and where available SKU/GTIN").

### LOW

**L1. Homepage embeds the identical SilverBullet 2 Product JSON-LD block twice** (all 5 locale homepages; blocks 3 and 4 byte-identical). Dedupe the injecting section in `scripts/clean.mjs`/`scripts/split.mjs`.

**L2. Staging og:image points at the deploy host** (`lab-401.github.io/...`) while canonical/hreflang/og:url point at silverbullet.tools; also `og:image` vs `og:image:secure_url` reference two different content hashes of the same source image (double-ingested asset). Fix: build og:image from the canonical site URL in `scripts/apply-base.mjs` (exclude og:image from base-path rewriting), and dedupe the asset ingestion (`scripts/scrape.mjs` hashing step).

**L3. Organization JSON-LD `sameAs` is nine empty strings; Product brand is `"sbtools"`** (old shop handle). Fix in `scripts/clean.mjs`: drop empty `sameAs` entries (or populate real profiles) and set brand name to "Silver Bullet Tools".

**L4. WebSite JSON-LD advertises a `/search` SearchAction that does not exist**; search modal is a stub and `predictive_search_url:'/search/suggest'` fires failing fetches when typing. Fix: remove the `potentialAction` from the WebSite block and drop predictive-search wiring (`scripts/clean.mjs`), until/unless a static search (Pagefind/Lunr) is added.

**L5. `json+oembed` head links point at unscraped `.oembed` resources** (404 for unfurl crawlers). Strip the `<link type="application/json+oembed">` tags in `scripts/clean.mjs` or generate static `.oembed` JSON files.

**L6. agents.md/llms.txt omit price/availability for 3 of 4 products** (silver-bullet 600 EUR OutOfStock; spare-tips 150 EUR OutOfStock; replacement-case 19.95 EUR InStock — all already in on-site JSON-LD) and use product names that do not match JSON-LD names ("SilverBullet V1" vs "Silver Bullet"; "Replacement case" vs "SilverBullet Spare Case"). Fix in `scripts/gen-seo-files.mjs`: add Price/Availability columns using JSON-LD names verbatim; add a last-updated date.

**L7. agents.md/llms.txt are only discoverable by convention** — no HTML page or robots.txt line references them. Fix: add `# Agent guide: https://silverbullet.tools/agents.md` comment to robots.txt and a `<link rel="alternate" type="text/markdown" href="/llms.txt">` to the shared head (`scripts/gen-seo-files.mjs` + `scripts/clean.mjs`).

**L8. Homepage h1 is the logo image only** (alt text provides the accessible name; passes checks). Optional: move h1 to the hero heading or add visually-hidden text.

**L9. QA-process: stale diff masks mislead triage.** Multiple `qa/screenshots/diff/*.png` masks are left over from earlier runs with different page heights and depict obsolete full-page mismatches. Fix in `scripts/visual-diff.mjs` / `qa/workflow-qa.mjs`: delete/regenerate the diff directory at the start of each run.

---

## 3. Expected / accepted deltas (no action required)

- **Localized static buy button (all 8 visual diff pairs; worst mismatch 0.027%).** The replica intentionally replaces Shopify's dynamic wallet/ShopPay checkout button with a static localized Buy-it-now button. The reference (raw scraped Shopify HTML served locally) renders the English fallback "Buy it now" (or "Jetzt zum Checkout" on de_index) because Shopify's wallet JS cannot complete API calls against the local reference server; the replica correctly renders "Acheter maintenant" / "Comprar ahora" / "Jetzt kaufen". Position, size, and styling are identical; only text glyphs differ. Pairs: fr_products_replacement-case, fr_products_spare-tips, fr_products_silver-bullet-2, fr_products_silver-bullet, de_index, de_products_replacement-case, es_products_replacement-case, es_products_spare-tips (all @mobile, all classified expected-delta, severity none).
- **Log in link points at the live Shopify auth endpoint** (`https://silverbullet.tools/customer_authentication/redirect?...`) — customer auth cannot be static; intentional external hand-off.
- **External embeds:** the YouTube iframe (`youtube.com/embed/_GiRG1FhY4c`) is the only external resource on staging — expected.
- **`href="#"` anchors in the country-selector list** (~249 per page) are the Shopify theme's disclosure pattern, not broken links.
- **Live-site dynamics:** live pages render Shopify-injected dynamics (wallet buttons, localization POST flow) that the static replica deliberately replaces; diffs arising purely from those are accepted. No cookie-banner discrepancies were flagged in this run.

---

## 4. Info confirmations (verified working)

**Visual**
- All 8 compared page pairs are pixel-identical outside the intentional buy-button label (mismatch 0.004%-0.027%).

**Runtime / console**
- All 10 probed pages return HTTP 200; zero console warnings, zero uncaught page exceptions, zero failed requests other than the cart-endpoint 404s (M1). Probe: `qa/probe-console.mjs`.

**Links**
- 748 of 763 unique root-relative URLs across all 110 HTML files resolve in `dist`; the only 15 misses are the PDF (H1) and Atom feeds (M2). No `cdn.shopify.com`/`monorail`/`shop.app` URLs remain in any href/src/srcset/poster/content attribute. Script: `qa/check-internal-links.mjs`.

**Interactions (replica, verified against live where applicable)**
- Desktop search modal opens/closes (parity with live).
- Header nav: no dropdowns exist on either site (parity; nothing to test).
- Footer language selector opens correctly and its anchors carry correct locale hrefs (better than live's `href="#"`); only click-through navigation is broken (H2).
- Product gallery thumbnails switch the main image; click-to-magnify zoom overlay works identically to live (hidden lightbox buttons are parity, not a defect).
- Buy-it-now placeholder button present and visible; quantity +/- works.
- Mobile hamburger drawer opens with all 5 nav links.
- Homepage "carousels" (Compatible Brands, testimonials) are static grids with no arrows on both replica and live — full parity.
- Zero uncaught JS errors during any probed interaction. Reports: `qa/interactions-report.json`.

**Staging deploy (lab-401.github.io/silverbullet-static-site)**
- All 3 spot-checked pages HTTP 200 and fully styled; 224/224 referenced assets return 200; all internal links carry the base-path prefix and resolve; canonical/hreflang/og:url follow the silverbullet.tools canonical policy; `noindex, nofollow` present on all staging pages.

**SEO files and metadata**
- `sitemap.xml` well-formed, 110 entries mapping 1:1 to dist pages (including the emoji blog slug), all absolute silverbullet.tools URLs; 6 valid self-referencing hreflang alternates per entry (660 total).
- `robots.txt` is the correct allow variant and references the sitemap.
- All 24 URLs in agents.md/llms.txt resolve to real dist pages; the 600 EUR SilverBullet 2 price claim matches page content and JSON-LD; supporting llms.txt claims verified.
- Exactly one document `<title>` and one canonical per page (extra `<title>` matches are inline-SVG accessibility titles); canonical host/path correct everywhere except the 16 flagged product pages (H4).
- hreflang sets complete and consistent on all 110 pages.
- og:title/og:description/og:image/twitter:card present on all 110 pages; every og:image is absolute and resolves under `dist/assets`.
- silver-bullet and replacement-case Product schemas complete and valid; sampled blog post (Article JSON-LD) fully clean; `html lang` matches locale on all pages outside the 16 flagged product pages.
- `dist/cart.js` empty-cart stub exists (partial mitigation for M1).
