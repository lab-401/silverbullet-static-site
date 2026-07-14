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

function serializeNode($, node, out) {
  if (node.type === 'text') {
    const t = normText(node.data || '');
    if (t) out.push(`#text:${t}`);
    return;
  }
  if (node.type === 'comment') {
    const t = normText(node.data || '');
    if (t) out.push(`#comment:${t}`);
    return;
  }
  if (node.type !== 'tag' && node.type !== 'script' && node.type !== 'style') return;
  const attrs = { ...node.attribs };
  if ('class' in attrs) {
    attrs.class = attrs.class.split(/\s+/).filter(Boolean).sort().join(' ');
    if (!attrs.class) delete attrs.class;
  }
  if (attrs.name === 'return_to') attrs.value = '/';
  const attrStr = Object.keys(attrs)
    .sort()
    .map((k) => `${k}="${normText(attrs[k] ?? '')}"`)
    .join(' ');
  out.push(`<${node.name} ${attrStr}>`);
  for (const child of node.children || []) serializeNode($, child, out);
  out.push(`</${node.name}>`);
}

function canonicalizeLd(s) {
  try {
    return JSON.stringify(JSON.parse(s));
  } catch {
    return normText(s);
  }
}

function normalizeDoc(html) {
  // return_to values are intentionally normalized in inert forms; noscript
  // content parses as text, so whitelist on the raw string for both sides
  html = html.replace(/(name="return_to"\s+value=")[^"]*(")/g, '$1/$2');
  // og/meta asset URLs are intentionally absolutized at render time
  html = html.replaceAll('content="https://silverbullet.tools/assets/', 'content="/assets/');
  const $ = load(html);
  // pull ld+json out (location-independent compare)
  const ld = $('script[type="application/ld+json"]')
    .map((_, el) => canonicalizeLd($(el).html() || ''))
    .get()
    .sort();
  $('script[type="application/ld+json"]').remove();
  $('meta[name="robots"][content*="noindex"]').remove();

  const headChildren = [];
  $('head')
    .children()
    .each((_, el) => {
      const out = [];
      serializeNode($, el, out);
      const s = out.join('');
      if (s) headChildren.push(s);
    });
  // head text nodes (title handled as child; stray text ignored)
  const bodyOut = [];
  for (const child of $('body')[0].children || []) serializeNode($, child, bodyOut);

  const htmlAttrs = { ...$('html')[0].attribs };
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

let pass = 0;
const failures = [];
for (const entry of manifest) {
  if (!entry.file) continue;
  const locale = entry.locale;
  const localizedPath = locale === 'en' ? decodeURIComponent(entry.path) : `/${locale}${entry.path === '/' ? '' : decodeURIComponent(entry.path)}`;
  const distFile = path.join(ROOT, 'dist', ...localizedPath.split('/').filter(Boolean), 'index.html');
  const cleanFile = path.join(ROOT, 'scrape', 'clean', path.relative(path.join(ROOT, 'scrape', 'raw'), path.join(ROOT, entry.file)));
  let distHtml, cleanHtml;
  try {
    [distHtml, cleanHtml] = await Promise.all([readFile(distFile, 'utf8'), readFile(cleanFile, 'utf8')]);
  } catch (e) {
    failures.push({ page: localizedPath, error: 'missing file: ' + String(e).slice(0, 120) });
    continue;
  }
  const D = normalizeDoc(distHtml);
  const C = normalizeDoc(cleanHtml);
  const probs = [];
  const ldDiff = firstDiff(D.ld, C.ld);
  if (ldDiff) probs.push({ kind: 'ldjson', ...ldDiff });
  const headDiff = firstDiff(D.head, C.head);
  if (headDiff) probs.push({ kind: 'head', ...headDiff });
  const bodyDiff = firstDiff(D.body, C.body);
  if (bodyDiff) probs.push({ kind: 'body', ...bodyDiff });
  if (JSON.stringify(D.htmlAttrs) !== JSON.stringify(C.htmlAttrs)) probs.push({ kind: 'htmlAttrs', a: D.htmlAttrs, b: C.htmlAttrs });
  if (JSON.stringify(D.bodyAttrs) !== JSON.stringify(C.bodyAttrs)) probs.push({ kind: 'bodyAttrs', a: D.bodyAttrs, b: C.bodyAttrs });
  if (probs.length) failures.push({ page: localizedPath, probs });
  else pass++;
}

console.log(`Fidelity: ${pass}/${pass + failures.length} pages DOM-equivalent.`);
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
