// Generates dist/sitemap.xml, robots.txt, agents.md, llms.txt, .nojekyll
// SITE_URL: origin used for sitemap/robots links (default final domain).
// STAGING=1: robots.txt disallows everything (pages also carry noindex meta).
import { readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const DIST = path.join(ROOT, 'dist');
const SITE = (process.env.SITE_URL || 'https://silverbullet.tools').replace(/\/$/, '');
const FINAL = 'https://silverbullet.tools'; // canonical domain, independent of deploy host
const STAGING = !!process.env.STAGING;
const TODAY = new Date().toISOString().slice(0, 10);

// read page records from the live meta.json files (split-report.json predates
// the product-translation step, which rewrites canonicals in place)
async function* walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (e.name === 'meta.json') yield p;
  }
}
const records = [];
for await (const f of walk(path.join(ROOT, 'src', 'scraped'))) {
  records.push(JSON.parse(await readFile(f, 'utf8')));
}
const split = { pages: records };
const LOCALES = ['en', 'fr', 'de', 'it', 'es'];

// A page earns a sitemap/hreflang slot only if its canonical is itself.
// The live site serves untranslated EN product pages at locale URLs with
// EN canonicals - those stay browsable but are excluded here to avoid
// contradictory signals.
const pages = split.pages.map((p) => {
  const encodedPath = p.localizedPath === '/' ? '/' : p.localizedPath.split('/').map(encodeURIComponent).join('/');
  let canonicalDecoded = p.canonical;
  try {
    canonicalDecoded = decodeURIComponent(p.canonical);
  } catch {}
  const selfCanonical = canonicalDecoded.replace(/\/$/, '') === (FINAL + p.localizedPath).replace(/\/$/, '');
  return { ...p, loc: SITE + encodedPath, selfCanonical };
});
const excluded = pages.filter((p) => !p.selfCanonical);
console.log(`[gen-seo] ${excluded.length} pages excluded from sitemap (canonical points elsewhere): ${excluded.slice(0, 4).map((p) => p.localizedPath).join(', ')}...`);

// ---- sitemap.xml with hreflang alternates ----
const byPath = {};
for (const p of pages) if (p.selfCanonical) (byPath[p.path] ??= {})[p.locale] = p.loc;
const urls = pages
  .filter((p) => p.selfCanonical)
  .map((p) => {
    const alts = byPath[p.path];
    const links = LOCALES.filter((l) => alts[l])
      .map((l) => `    <xhtml:link rel="alternate" hreflang="${l}" href="${alts[l]}"/>`)
      .concat(alts.en ? [`    <xhtml:link rel="alternate" hreflang="x-default" href="${alts.en}"/>`] : [])
      .join('\n');
    return `  <url>\n    <loc>${p.loc}</loc>\n${links}\n  </url>`;
  })
  .join('\n');
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls}\n</urlset>\n`;
await writeFile(path.join(DIST, 'sitemap.xml'), sitemap, 'utf8');

// ---- robots.txt ----
const robots = STAGING
  ? `# Staging build - do not index\nUser-agent: *\nDisallow: /\n`
  : `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n\n# Agent guide: ${SITE}/agents.md\n# LLM index:  ${SITE}/llms.txt\n`;
await writeFile(path.join(DIST, 'robots.txt'), robots, 'utf8');

// ---- agents.md ----
const agentsMd = `# Silver Bullet Tools — Agent Guide

Last updated: ${TODAY}. This document is the canonical agent-facing
description of ${SITE}.

## What this site is

Silver Bullet Tools is the official product site for the **SilverBullet 2**, a
precision tool for picking and decoding disc-detainer (disc-based) locks,
made for locksmiths, security professionals, and lockpicking hobbyists.

The site is fully static: there is no server-side API, no cart, and no
checkout endpoint on this domain. Ignore any residual references to Shopify
routes (e.g. \`/cart/add\`, \`window.routes\`) inside theme JavaScript — they
are inert.

## Products

Names, prices, and availability below mirror each page's schema.org/Product
JSON-LD (the authoritative machine-readable source).

| Product (JSON-LD name) | Price | Availability | Page |
| --- | --- | --- | --- |
| SilverBullet 2 | €600.00 | InStock | ${SITE}/products/silver-bullet-2 |
| Silver Bullet (V1, legacy) | €600.00 | OutOfStock | ${SITE}/products/silver-bullet |
| Spare Tips | €150.00 | OutOfStock | ${SITE}/products/spare-tips |
| SilverBullet Spare Case | €19.95 | InStock | ${SITE}/products/replacement-case |

GTIN is available for SilverBullet 2; SKUs are present where the source
catalog provided them.

## Purchasing status

**Checkout is temporarily offline while the store migrates to a new
commerce backend.** The visible "Buy it now" / "Add to cart" buttons are
inert placeholders tagged with \`data-sb-migration\` attributes and will be
re-linked to the new store shortly. Do not attempt programmatic checkout
against this domain.

### Placeholder marker reference (data-sb-migration)

| Value | Element |
| --- | --- |
| \`buy-now\` | Buy-it-now button on product pages (will point to new checkout) |
| \`add-to-cart-form\` | Neutralized add-to-cart form |
| \`cart-form\` / \`cart-link\` / \`account-link\` | Inert cart/account UI |
| \`newsletter-form\` | Inert newsletter signup |
| \`search-form\` | Inert search UI |
| \`language-selector\` | Language switcher (fully functional — static links) |
| \`static-shims\` | Runtime shims (cart stub, no auto-redirect) |

The country/currency selector was removed entirely (all prices are EUR).

## Key pages

- Home: ${SITE}/
- How to use the tool: ${SITE}/pages/how-to-use-the-silver-bullet
- Full compatible-locks picking list: ${SITE}/pages/silverbullet-full-picking-list
- Decoding matrix (PDF): ${SITE}/assets/silverbullet-decoding-matrix.pdf
- FAQ: ${SITE}/pages/faq
- Shipping: ${SITE}/pages/shipping-information
- Warranty and returns: ${SITE}/pages/warranty-returns-policy
- Blog: ${SITE}/blogs/news

## Languages

All content, including product pages, is available in English (default),
French (/fr), German (/de), Italian (/it), and Spanish (/es). Product pages
are translated from the English source (DeepL, using the store's original
terminology); all other pages carry the store's original translations.
Language alternates are declared via hreflang link tags and in
${SITE}/sitemap.xml.

## Notes for agents

- All pages are static HTML; fetch them directly. No rate limits on this domain.
- Machine-readable indexes: ${SITE}/sitemap.xml and ${SITE}/llms.txt
- Product data: schema.org/Product JSON-LD on each product page.
- Blog feed: ${SITE}/blogs/news.atom
`;
await writeFile(path.join(DIST, 'agents.md'), agentsMd, 'utf8');

// ---- llms.txt ----
const enPages = pages.filter((p) => p.locale === 'en');
const llms = `# Silver Bullet Tools

> Official site of the SilverBullet 2, a precision tool to pick and decode
> disc-detainer (disc-based) locks — for locksmiths, security professionals,
> and lockpicking sport enthusiasts. Free worldwide shipping, lifetime
> guarantee. All content available in en/fr/de/it/es.
> Checkout is temporarily offline during a store migration; buy buttons are
> placeholders (see /agents.md).

## Products

- [SilverBullet 2](${SITE}/products/silver-bullet-2): current tool, opens >99% of disc-based locks (€600.00, InStock)
- [Silver Bullet](${SITE}/products/silver-bullet): legacy first-generation tool (€600.00, OutOfStock)
- [Spare Tips](${SITE}/products/spare-tips): replacement picking/tension tips (€150.00, OutOfStock)
- [SilverBullet Spare Case](${SITE}/products/replacement-case): shock-resistant hard case (€19.95, InStock)

## Documentation

- [How to use the SilverBullet](${SITE}/pages/how-to-use-the-silver-bullet): usage tutorial with videos
- [Decoding matrix PDF](${SITE}/assets/silverbullet-decoding-matrix.pdf): printable lock decoding chart
- [Full picking list](${SITE}/pages/silverbullet-full-picking-list): all compatible lock brands/models
- [FAQ](${SITE}/pages/faq): product and shipping questions
- [Shipping information](${SITE}/pages/shipping-information)
- [Warranty & returns](${SITE}/pages/warranty-returns-policy)

## Blog

${enPages
  .filter((p) => p.path.startsWith('/blogs/news/'))
  .map((p) => `- [${decodeURIComponent(p.path.split('/').pop()).replace(/-/g, ' ')}](${p.loc})`)
  .join('\n')}

## Metadata

- [Sitemap](${SITE}/sitemap.xml)
- [Agent guide](${SITE}/agents.md)
- [Blog Atom feed](${SITE}/blogs/news.atom)
`;
await writeFile(path.join(DIST, 'llms.txt'), llms, 'utf8');

// windows: writeFile cannot overwrite a hidden file - only create if absent
try {
  await writeFile(path.join(DIST, '.nojekyll'), '', { flag: 'wx' });
} catch (e) {
  if (e.code !== 'EEXIST' && e.code !== 'EPERM') throw e;
}
console.log(`[gen-seo] sitemap (${pages.filter((p) => p.selfCanonical).length} urls), robots${STAGING ? ' (staging: disallow all)' : ''}, agents.md, llms.txt, .nojekyll -> dist/`);
