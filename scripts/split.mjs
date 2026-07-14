// Splits cleaned pages into Astro-ready parts.
// In:  scrape/clean/<locale>/**.html
// Out: src/scraped/<locale>/<slug>/main.html + meta.json (references shared parts)
//      src/scraped/<locale>/_shared/{head,prelude,postlude}.<n>.html
//      scrape/split-report.json (similarity groups + anomalies)
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { load } from 'cheerio';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const manifest = JSON.parse(await readFile(path.join(ROOT, 'scrape', 'pages-manifest.json'), 'utf8'));
const OUT = path.join(ROOT, 'src', 'scraped');

const sha = (s) => createHash('sha1').update(s).digest('hex').slice(0, 12);

function slice(html) {
  const headStart = html.indexOf('<head>') + 6;
  const headEnd = html.indexOf('</head>');
  const bodyOpen = html.match(/<body[^>]*>/);
  const bodyStart = html.indexOf(bodyOpen[0]) + bodyOpen[0].length;
  const bodyEnd = html.lastIndexOf('</body>');
  const mainStart = html.indexOf('<main');
  const mainEnd = html.indexOf('</main>') + 7;
  const htmlOpen = html.match(/<html[^>]*>/)[0];
  if (mainStart < 0 || mainEnd < 7) throw new Error('no <main>');
  return {
    htmlAttrs: htmlOpen,
    head: html.slice(headStart, headEnd),
    bodyAttrs: bodyOpen[0],
    prelude: html.slice(bodyStart, mainStart),
    main: html.slice(mainStart, mainEnd),
    postlude: html.slice(mainEnd, bodyEnd),
  };
}

// Extract per-page fields from head; return {meta, rest}
function splitHead(headHtml) {
  const $ = load(headHtml, null, false);
  const meta = {};
  meta.title = $('title').text().trim();
  meta.description = $('meta[name="description"]').attr('content') || '';
  meta.canonical = $('link[rel="canonical"]').attr('href') || '';
  meta.hreflang = $('link[rel="alternate"][hreflang]')
    .map((_, el) => ({ lang: $(el).attr('hreflang'), href: $(el).attr('href') }))
    .get();
  meta.og = $('meta[property^="og:"], meta[name^="twitter:"]')
    .map((_, el) => $.html(el))
    .get();
  meta.ldjson = $('script[type="application/ld+json"]')
    .map((_, el) => $(el).html())
    .get();
  meta.headExtras = $('link[type="application/atom+xml"]')
    .map((_, el) => $.html(el))
    .get();
  $('title, meta[name="description"], link[rel="canonical"], link[rel="alternate"][hreflang], meta[property^="og:"], meta[name^="twitter:"], script[type="application/ld+json"], link[type="application/atom+xml"]').remove();
  const rest = $.html();
  return { meta, rest };
}

// pull ld+json out of a body fragment (schema is rebuilt by the SEO layer)
function extractLdJson(fragmentHtml) {
  const $ = load(fragmentHtml, null, false);
  const found = $('script[type="application/ld+json"]')
    .map((_, el) => $(el).html())
    .get();
  if (!found.length) return { html: fragmentHtml, ldjson: [] };
  $('script[type="application/ld+json"]').remove();
  return { html: $.html(), ldjson: found };
}

const ACTIVE_CLASS = /\s*header__active-menu-item/g;
const DRAWER_ACTIVE_CLASS = /\s*menu-drawer__menu-item--active/g;
const ARIA_CURRENT = /\s*aria-current="page"/g;
const EMPTY_CLASS = /\s*class=""/g;
const RETURN_TO = /(name="return_to"\s+value=")[^"]*(")/g;
// language-switcher anchors: replace per-page href with a token the layout resolves
const LANG_HREF = /(<a\b[^>]*?href=")([^"]*)("[^>]*?hreflang="([a-z]{2})"[^>]*?data-value=")/g;

function normalizeShared(html) {
  return html
    .replace(ACTIVE_CLASS, '')
    .replace(DRAWER_ACTIVE_CLASS, '')
    .replace(ARIA_CURRENT, '')
    .replace(EMPTY_CLASS, '')
    .replace(RETURN_TO, '$1/$2')
    .replace(LANG_HREF, (m, a, _href, c, lang) => `${a}%%LANG_HREF_${lang}%%${c}`);
}

const report = { locales: {}, pages: [], errors: [] };
const records = [];
const sharedStore = {}; // locale -> kind -> Map(hash -> {html, pages[]})

for (const entry of manifest) {
  if (!entry.file) continue;
  const cleanFile = path.join(ROOT, 'scrape', 'clean', path.relative(path.join(ROOT, 'scrape', 'raw'), path.join(ROOT, entry.file)));
  const locale = entry.locale;
  const slugRel = path.relative(path.join(ROOT, 'scrape', 'raw', locale), path.join(ROOT, entry.file)).replace(/\.html$/, '').replace(/\\/g, '/');
  let html;
  try {
    html = await readFile(cleanFile, 'utf8');
  } catch {
    report.errors.push({ page: entry.file, error: 'missing clean file' });
    continue;
  }
  let parts;
  try {
    parts = slice(html);
  } catch (e) {
    report.errors.push({ page: entry.file, error: String(e) });
    continue;
  }
  const { meta, rest } = splitHead(parts.head);

  // active-nav markers (header menu + mobile drawer), then normalize
  const $p = load(parts.prelude, null, false);
  const activeNav = [
    ...new Set(
      $p('a.header__active-menu-item, a[aria-current="page"], a.menu-drawer__menu-item--active')
        .map((_, el) => $p(el).attr('href'))
        .get()
    ),
  ];
  const preludeX = extractLdJson(parts.prelude);
  const postludeX = extractLdJson(parts.postlude);
  const preludeNorm = normalizeShared(preludeX.html);
  const postludeNorm = normalizeShared(postludeX.html);

  const record = {
    locale,
    path: decodeURIComponent(entry.path),
    localizedPath: locale === 'en' ? decodeURIComponent(entry.path) : `/${locale}${entry.path === '/' ? '' : decodeURIComponent(entry.path)}`,
    url: entry.url,
    slug: slugRel,
    htmlAttrs: parts.htmlAttrs,
    bodyAttrs: parts.bodyAttrs,
    activeNav,
    ...meta,
    ldjsonBody: [...preludeX.ldjson, ...postludeX.ldjson],
  };

  sharedStore[locale] ??= { head: new Map(), prelude: new Map(), postlude: new Map() };
  const hashes = {};
  for (const [kind, content] of [
    ['head', rest],
    ['prelude', preludeNorm],
    ['postlude', postludeNorm],
  ]) {
    const h = sha(content);
    hashes[kind] = h;
    const m = sharedStore[locale][kind];
    if (!m.has(h)) m.set(h, { html: content, pages: [] });
    m.get(h).pages.push(slugRel);
  }
  records.push({ record, hashes, main: parts.main, slugRel, locale });
}

// group shared variants, then write pages with references
const variantFile = {}; // locale -> kind -> hash -> filename
for (const [locale, kinds] of Object.entries(sharedStore)) {
  const dir = path.join(OUT, locale, '_shared');
  await mkdir(dir, { recursive: true });
  report.locales[locale] = {};
  variantFile[locale] = {};
  for (const [kind, m] of Object.entries(kinds)) {
    const variants = [...m.entries()].sort((a, b) => b[1].pages.length - a[1].pages.length);
    variantFile[locale][kind] = {};
    report.locales[locale][kind] = variants.map(([h, v], i) => {
      variantFile[locale][kind][h] = `${kind}.${i}.html`;
      return { hash: h, file: `${kind}.${i}.html`, count: v.pages.length, pages: v.pages.slice(0, 30) };
    });
    for (let i = 0; i < variants.length; i++) {
      await writeFile(path.join(dir, `${kind}.${i}.html`), variants[i][1].html, 'utf8');
    }
  }
}

for (const { record, hashes, main, slugRel, locale } of records) {
  record.headFile = variantFile[locale].head[hashes.head];
  record.preludeFile = variantFile[locale].prelude[hashes.prelude];
  record.postludeFile = variantFile[locale].postlude[hashes.postlude];
  const dir = path.join(OUT, locale, ...slugRel.split('/'));
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'main.html'), main, 'utf8');
  await writeFile(path.join(dir, 'meta.json'), JSON.stringify(record, null, 2), 'utf8');
  report.pages.push(record);
}

await writeFile(path.join(ROOT, 'scrape', 'split-report.json'), JSON.stringify(report, null, 2), 'utf8');
for (const [locale, kinds] of Object.entries(report.locales)) {
  console.log(`${locale}: head variants=${kinds.head.length}, prelude variants=${kinds.prelude.length}, postlude variants=${kinds.postlude.length}`);
}
console.log(`Pages: ${report.pages.length}, errors: ${report.errors.length}`);
