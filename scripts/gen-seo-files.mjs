// Generates dist/sitemap.xml, robots.txt, agents.md, llms.txt, .nojekyll
// SITE_URL: canonical origin for sitemap/robots (default final domain).
// STAGING=1: robots.txt disallows everything (pages also carry noindex meta).
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const DIST = path.join(ROOT, 'dist');
const SITE = (process.env.SITE_URL || 'https://silverbullet.tools').replace(/\/$/, '');
const STAGING = !!process.env.STAGING;

const manifest = JSON.parse(await readFile(path.join(ROOT, 'scrape', 'pages-manifest.json'), 'utf8'));
const LOCALES = ['en', 'fr', 'de', 'it', 'es'];

const pages = manifest
  .filter((m) => m.file)
  .map((m) => ({
    locale: m.locale,
    path: m.path, // percent-encoded, locale-less
    loc: SITE + (m.locale === 'en' ? m.path : `/${m.locale}${m.path === '/' ? '' : m.path}`),
  }));

// ---- sitemap.xml with hreflang alternates ----
const byPath = {};
for (const p of pages) (byPath[p.path] ??= {})[p.locale] = p.loc;
const urls = pages
  .map((p) => {
    const alts = byPath[p.path];
    const links = LOCALES.filter((l) => alts[l])
      .map((l) => `    <xhtml:link rel="alternate" hreflang="${l}" href="${alts[l]}"/>`)
      .concat(`    <xhtml:link rel="alternate" hreflang="x-default" href="${alts.en}"/>`)
      .join('\n');
    return `  <url>\n    <loc>${p.loc}</loc>\n${links}\n  </url>`;
  })
  .join('\n');
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls}\n</urlset>\n`;
await writeFile(path.join(DIST, 'sitemap.xml'), sitemap, 'utf8');

// ---- robots.txt ----
const robots = STAGING
  ? `# Staging build - do not index\nUser-agent: *\nDisallow: /\n`
  : `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`;
await writeFile(path.join(DIST, 'robots.txt'), robots, 'utf8');

// ---- agents.md ----
const agentsMd = `# Silver Bullet Tools — Agent Guide

This document is the canonical agent-facing description of ${SITE}.

## What this site is

Silver Bullet Tools is the official product site for the **SilverBullet 2**, a
precision tool for picking and decoding disc-detainer (disc-based) locks,
made for locksmiths, security professionals, and lockpicking hobbyists.
The site is a fully static website; there is no server-side API, cart, or
checkout endpoint on this domain.

## Products

| Product | Price (EUR) | Page |
| --- | --- | --- |
| SilverBullet 2 | €600 | ${SITE}/products/silver-bullet-2 |
| SilverBullet (V1, legacy) | see page | ${SITE}/products/silver-bullet |
| Spare tips | see page | ${SITE}/products/spare-tips |
| Replacement case | see page | ${SITE}/products/replacement-case |

Purchasing: use the Buy buttons on the product pages. Product data is also
embedded in each product page as schema.org/Product JSON-LD (price, SKU,
GTIN, availability).

## Key pages

- Home: ${SITE}/
- How to use the tool: ${SITE}/pages/how-to-use-the-silver-bullet
- Full compatible-locks picking list: ${SITE}/pages/silverbullet-full-picking-list
- FAQ: ${SITE}/pages/faq
- Shipping: ${SITE}/pages/shipping-information
- Warranty and returns: ${SITE}/pages/warranty-returns-policy
- Blog: ${SITE}/blogs/news

## Languages

Content is available in English (default), French (/fr), German (/de),
Italian (/it), and Spanish (/es). Language-alternate URLs are declared via
hreflang link tags and in ${SITE}/sitemap.xml.

## Notes for agents

- All pages are static HTML; feel free to fetch them directly.
- There are no rate-limited APIs on this domain.
- A machine-readable page index is available at ${SITE}/llms.txt and
  ${SITE}/sitemap.xml.
`;
await writeFile(path.join(DIST, 'agents.md'), agentsMd, 'utf8');

// ---- llms.txt ----
const enPages = pages.filter((p) => p.locale === 'en');
const llms = `# Silver Bullet Tools

> Official site of the SilverBullet 2, a precision tool to pick and decode
> disc-detainer (disc-based) locks — for locksmiths, security professionals,
> and lockpicking sport enthusiasts. Free worldwide shipping, lifetime
> guarantee. Content available in en/fr/de/it/es.

## Products

- [SilverBullet 2](${SITE}/products/silver-bullet-2): the current tool, opens >99% of disc-based locks (€600)
- [SilverBullet V1](${SITE}/products/silver-bullet): legacy first-generation tool
- [Spare tips](${SITE}/products/spare-tips): replacement picking/tension tips
- [Replacement case](${SITE}/products/replacement-case): shock-resistant hard case

## Documentation

- [How to use the SilverBullet](${SITE}/pages/how-to-use-the-silver-bullet): usage tutorial with videos
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
`;
await writeFile(path.join(DIST, 'llms.txt'), llms, 'utf8');

await writeFile(path.join(DIST, '.nojekyll'), '', 'utf8');
console.log(`[gen-seo] sitemap (${pages.length} urls), robots${STAGING ? ' (staging: disallow all)' : ''}, agents.md, llms.txt, .nojekyll -> dist/`);
