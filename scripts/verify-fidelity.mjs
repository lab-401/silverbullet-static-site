// Fidelity gate: proves dist pages are DOM-equivalent to the cleaned scrape.
// Compares <head> as multiset of normalized children, <body> as ordered tree.
// Whitelisted intentional deltas: ld+json moved to head, staging robots meta,
// return_to normalization, empty class attrs, whitespace.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { load } from 'cheerio';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const manifest = JSON.parse(await readFile(path.join(ROOT, 'scrape', 'pages-manifest.json'), 'utf8'));

function normText(t) {
  return t.replace(/\s+/g, ' ').trim();
}

// structOnly: translated pages - compare markup shape, not language.
// Drops text nodes, translatable attrs, and language-dependent state
// (active language marker) so FR chrome compares equal to EN chrome.
const TRANSLATABLE_ATTRS = new Set(['alt', 'title', 'aria-label', 'placeholder']);

function serializeNode($, node, out, structOnly = false) {
  if (node.type === 'text') {
    if (structOnly) return;
    const t = normText(node.data || '');
    if (t) out.push(`#text:${t}`);
    return;
  }
  if (node.type === 'comment') {
    if (structOnly) return;
    const t = normText(node.data || '');
    if (t) out.push(`#comment:${t}`);
    return;
  }
  if (node.type !== 'tag' && node.type !== 'script' && node.type !== 'style') return;
  const attrs = { ...node.attribs };
  if (structOnly) {
    for (const a of Object.keys(attrs)) {
      if (TRANSLATABLE_ATTRS.has(a)) delete attrs[a];
      // theme passes UI strings to JS via data attributes
      if (/^data-.*(text|message|label|error)/.test(a)) delete attrs[a];
    }
    delete attrs['aria-current'];
    if ('lang' in attrs) delete attrs.lang;
    if ('hreflang' in attrs) delete attrs.hreflang;
    // locale chrome links are locale-prefixed; EN-baseline links are not
    if (attrs.href)
      attrs.href =
        attrs.href
          .replace(/^\/(?:fr|de|it|es)(\/|$)/, '$1')
          .replace(/^(https:\/\/silverbullet\.tools)\/(?:fr|de|it|es)(\/|$)/, '$1$2')
          .replace(/([?&])locale=[a-z]{2}/, '$1locale=xx')
          .replace(/\/$/, '') || '/';
  }
  if ('class' in attrs) {
    attrs.class = attrs.class
      .split(/\s+/)
      .filter(Boolean)
      .filter((c) => !(structOnly && (c === 'disclosure__link--active' || c === 'current' || c === 'current_lang')))
      .map((c) => (structOnly && /^ly-flag-icon-[a-z]{2}$/.test(c) ? 'ly-flag-icon-xx' : c))
      .sort()
      .join(' ');
    if (!attrs.class) delete attrs.class;
  }
  if (attrs.name === 'return_to') attrs.value = '/';
  if (structOnly && attrs.name === 'locale_code') attrs.value = 'xx';
  const attrStr = Object.keys(attrs)
    .sort()
    .map((k) => `${k}="${normText(attrs[k] ?? '')}"`)
    .join(' ');
  out.push(`<${node.name} ${attrStr}>`);
  for (const child of node.children || []) serializeNode($, child, out, structOnly);
  out.push(`</${node.name}>`);
}

let ldParseFailures = [];
function canonicalizeLd(s, source) {
  try {
    return JSON.stringify(JSON.parse(s));
  } catch {
    if (source) ldParseFailures.push({ source, snippet: normText(s).slice(0, 120) });
    return normText(s);
  }
}

function normalizeDoc(html, source, structOnly = false) {
  // return_to values are intentionally normalized in inert forms; noscript
  // content parses as text, so whitelist on the raw string for both sides
  html = html.replace(/(name="return_to"\s+value=")[^"]*(")/g, '$1/$2');
  // og/meta asset URLs are intentionally absolutized at render time
  html = html.replaceAll('content="https://silverbullet.tools/assets/', 'content="/assets/');
  const $ = load(html);
  // pull ld+json out (location-independent, deduped compare - the render layer
  // intentionally dedupes Shopify's doubled homepage product schema)
  const ld = [
    ...new Set(
      $('script[type="application/ld+json"]')
        .map((_, el) => canonicalizeLd($(el).html() || '', source))
        .get()
    ),
  ].sort();
  $('script[type="application/ld+json"]').remove();
  $('meta[name="robots"][content*="noindex"]').remove();
  // meta descriptions and og:locale are intentionally ADDED by the renderer
  $('meta[name="description"]').remove();
  $('meta[property="og:locale"], meta[property="og:locale:alternate"]').remove();

  const headChildren = [];
  $('head')
    .children()
    .each((_, el) => {
      const out = [];
      serializeNode($, el, out, structOnly);
      const s = out.join('');
      if (s) headChildren.push(s);
    });
  // head text nodes (title handled as child; stray text ignored)
  const bodyOut = [];
  for (const child of $('body')[0].children || []) serializeNode($, child, bodyOut, structOnly);

  const htmlAttrs = { ...$('html')[0].attribs };
  if (structOnly) delete htmlAttrs.lang;
  const bodyAttrs = { ...$('body')[0].attribs };
  return { ld, head: headChildren.sort(), body: bodyOut, htmlAttrs, bodyAttrs };
}

function firstDiff(a, b) {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (a[i] !== b[i]) return { index: i, a: a[i], b: b[i], prev: a[i - 1] };
  }
  if (a.length !== b.length) return { index: n, a: a[n] ?? '(end)', b: b[n] ?? '(end)', prev: a[n - 1] };
  return null;
}

// translated pages: dist intentionally differs in TEXT from the (EN-content)
// scrape baseline; compare structure only and skip head/ld (translated)
let translatedPages = new Set();
try {
  translatedPages = new Set(JSON.parse(await readFile(path.join(ROOT, 'scrape', 'translations-manifest.json'), 'utf8')).pages);
} catch {}

let pass = 0;
const failures = [];
for (const entry of manifest) {
  if (!entry.file) continue;
  const locale = entry.locale;
  const localizedPath = locale === 'en' ? decodeURIComponent(entry.path) : `/${locale}${entry.path === '/' ? '' : decodeURIComponent(entry.path)}`;
  const isTranslated = translatedPages.has(localizedPath.slice(1));
  const distFile = path.join(ROOT, 'dist', ...localizedPath.split('/').filter(Boolean), 'index.html');
  const cleanFile = path.join(ROOT, 'scrape', 'clean', path.relative(path.join(ROOT, 'scrape', 'raw'), path.join(ROOT, entry.file)));
  let distHtml, cleanHtml;
  try {
    [distHtml, cleanHtml] = await Promise.all([readFile(distFile, 'utf8'), readFile(cleanFile, 'utf8')]);
  } catch (e) {
    failures.push({ page: localizedPath, error: 'missing file: ' + String(e).slice(0, 120) });
    continue;
  }
  // strict JSON-LD gate applies to dist (what we ship); clean baseline may
  // carry upstream Shopify quirks that clean.mjs corrects
  const D = normalizeDoc(distHtml, 'dist:' + localizedPath, isTranslated);
  const C = normalizeDoc(cleanHtml, null, isTranslated);
  const probs = [];
  if (!isTranslated) {
    const ldDiff = firstDiff(D.ld, C.ld);
    if (ldDiff) probs.push({ kind: 'ldjson', ...ldDiff });
    const headDiff = firstDiff(D.head, C.head);
    if (headDiff) probs.push({ kind: 'head', ...headDiff });
  }
  const bodyDiff = firstDiff(D.body, C.body);
  if (bodyDiff) probs.push({ kind: 'body', ...bodyDiff });
  if (JSON.stringify(D.htmlAttrs) !== JSON.stringify(C.htmlAttrs)) probs.push({ kind: 'htmlAttrs', a: D.htmlAttrs, b: C.htmlAttrs });
  if (JSON.stringify(D.bodyAttrs) !== JSON.stringify(C.bodyAttrs)) probs.push({ kind: 'bodyAttrs', a: D.bodyAttrs, b: C.bodyAttrs });
  if (probs.length) failures.push({ page: localizedPath, probs });
  else pass++;
}

console.log(`Fidelity: ${pass}/${pass + failures.length} pages DOM-equivalent.`);
if (ldParseFailures.length) {
  console.log(`JSON-LD STRICT GATE: ${ldParseFailures.length} unparseable blocks in dist:`);
  for (const f of ldParseFailures.slice(0, 5)) console.log(`  ${f.source}: ${f.snippet}`);
  process.exitCode = 1;
} else {
  console.log('JSON-LD strict gate: all dist blocks parse.');
}
for (const f of failures.slice(0, 10)) {
  console.log(`\nFAIL ${f.page}`);
  if (f.error) console.log('  ' + f.error);
  for (const p of (f.probs || []).slice(0, 3)) {
    console.log(`  [${p.kind}] @${p.index ?? ''}`);
    if (p.prev) console.log(`    prev: ${String(p.prev).slice(0, 160)}`);
    console.log(`    dist:  ${JSON.stringify(p.a).slice(0, 400)}`);
    console.log(`    clean: ${JSON.stringify(p.b).slice(0, 400)}`);
  }
}
if (failures.length > 10) console.log(`...and ${failures.length - 10} more failures`);
process.exit(failures.length ? 1 : 0);
