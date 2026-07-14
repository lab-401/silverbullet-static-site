// Translates the 4 EN product pages into fr/de/it/es (the live site never
// translated them). Runs AFTER split.mjs, overwriting the EN copies that sit
// in the locale slots of src/scraped/.
//
// Translation sources, in priority order:
//   1. Source translations harvested from the locale's own translated pages
//      (homepage + collection feature the products; langify preserves DOM
//      structure, so EN/locale text nodes pair positionally 1:1).
//   2. DeepL API (key read at runtime from DEEPL_KEY env or the stock-bot
//      config; NEVER stored in this repo - the repo is public).
//   3. scrape/translations-cache.json memoizes DeepL results so re-runs of
//      the pipeline cost zero API characters.
//
// Also per page: swaps the EN chrome for the locale's translated
// prelude/postlude, sets lang + self-canonical + og:url (re-admitting the
// pages to the sitemap/hreflang cluster), translates the Product JSON-LD
// description and localizes its URLs.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { load } from 'cheerio';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const SCRAPED = path.join(ROOT, 'src', 'scraped');
const FINAL = 'https://silverbullet.tools';
const LOCALES = ['fr', 'de', 'it', 'es'];
const DEEPL_TARGET = { fr: 'FR', de: 'DE', it: 'IT', es: 'ES' };
const PRODUCTS = ['silver-bullet', 'silver-bullet-2', 'spare-tips', 'replacement-case'];
const ATTRS = ['alt', 'title', 'aria-label', 'placeholder'];
const SKIP_TAGS = new Set(['script', 'style', 'svg', 'noscript']);

const sha = (s) => createHash('sha1').update(s).digest('hex').slice(0, 12);
const norm = (s) => s.replace(/\s+/g, ' ').trim();
const translatable = (s) => /\p{L}/u.test(s) && norm(s).length >= 2;

// ---- DeepL ----
async function getDeeplKey() {
  if (process.env.DEEPL_KEY) return process.env.DEEPL_KEY;
  const cfg = await readFile('P:\\Perso\\Repo\\Shopify-Stock-Order-Bot\\config\\config.yaml', 'utf8');
  const m = cfg.match(/deepl:\s*\n\s*api_key:\s*"([^"]+)"/);
  if (!m) throw new Error('DeepL key not found (set DEEPL_KEY or fix config path)');
  return m[1];
}
const KEY = await getDeeplKey();
let apiChars = 0;

// brand/product names must survive translation verbatim (DeepL glossary)
const BRAND_TERMS = ['Silver Bullet Tools', 'SilverBullet 2', 'SilverBullet', 'Silver Bullet', 'Abloy', 'ABUS'];
// short spec-table labels lack sentence context; DeepL turns "Tips" into
// advice ("Tipps zum Fühlen", "Consejos para principiantes") - pin them
const DOMAIN_TERMS = {
  fr: { 'Feeler Tips': 'Embouts palpeurs', 'Tension Tips': 'Embouts de tension', Front: 'Avant', Rear: 'Arrière' },
  de: { 'Feeler Tips': 'Tastspitzen', 'Tension Tips': 'Spannspitzen', Front: 'Vorne', Rear: 'Hinten' },
  it: { 'Feeler Tips': 'Punte tastatrici', 'Tension Tips': 'Punte di tensione', Front: 'Anteriore', Rear: 'Posteriore' },
  es: { 'Feeler Tips': 'Puntas palpadoras', 'Tension Tips': 'Puntas de tensión', Front: 'Delantera', Rear: 'Trasera' },
};

async function ensureGlossary(locale, target) {
  const ck = `_glossary_v3:${locale}`;
  if (cache[ck]) return cache[ck];
  const entries = BRAND_TERMS.map((t) => `${t}\t${t}`)
    .concat(Object.entries(DOMAIN_TERMS[locale] || {}).map(([k, v]) => `${k}\t${v}`))
    .join('\n');
  const res = await fetch('https://api.deepl.com/v2/glossaries', {
    method: 'POST',
    headers: { Authorization: `DeepL-Auth-Key ${KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ name: `sb-static-brand-${locale}`, source_lang: 'EN', target_lang: target, entries, entries_format: 'tsv' }),
  });
  if (!res.ok) throw new Error(`DeepL glossary ${res.status}: ${(await res.text()).slice(0, 300)}`);
  cache[ck] = (await res.json()).glossary_id;
  return cache[ck];
}

// domain disambiguation for DeepL (not translated, guides word choice):
// without it "picking tips" becomes harvesting advice in French
const CONTEXT =
  'E-commerce product page for the SilverBullet, a professional lock-picking tool for disc-detainer (disc-based) locks. ' +
  '"Tips" always means the physical interchangeable tool tips/bits mounted on the tool (French: embouts; German: Aufsätze/Spitzen; Italian: punte; Spanish: puntas), never advice. ' +
  '"Picking" always refers to lock picking (French: crochetage), never gathering or harvesting. ' +
  '"Disc" locks are disc-detainer locks (French: serrures à disques). Lock brand names (Abloy, ABUS, Kryptonite, Master Lock, IFAM, Anchor Las) stay unchanged.';

async function deeplBatch(texts, target, glossaryId) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch('https://api.deepl.com/v2/translate', {
      method: 'POST',
      headers: { Authorization: `DeepL-Auth-Key ${KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ text: texts, source_lang: 'EN', target_lang: target, preserve_formatting: true, glossary_id: glossaryId, context: CONTEXT }),
    });
    if (res.status === 429 || res.status >= 500) {
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      continue;
    }
    if (!res.ok) throw new Error(`DeepL ${res.status}: ${(await res.text()).slice(0, 300)}`);
    apiChars += texts.reduce((a, t) => a + t.length, 0);
    return (await res.json()).translations.map((t) => t.text);
  }
  throw new Error('DeepL: retries exhausted');
}

// ---- cache ----
const cacheFile = path.join(ROOT, 'scrape', 'translations-cache.json');
let cache = {};
try {
  cache = JSON.parse(await readFile(cacheFile, 'utf8'));
} catch {}

// ---- glossary: positional text pairing from already-translated pages ----
function collectStrings(html) {
  const $ = load(html, null, false);
  const out = [];
  function rec(node) {
    if (node.type === 'tag' || node.type === 'script' || node.type === 'style') {
      if (SKIP_TAGS.has(node.name)) return;
      for (const a of ATTRS) {
        const v = node.attribs?.[a];
        if (v && translatable(v)) out.push({ kind: 'attr:' + a, text: v });
      }
      (node.children || []).forEach(rec);
    } else if (node.type === 'text' && translatable(node.data || '')) {
      out.push({ kind: 'text', text: node.data });
    }
  }
  load(html, null, false)
    .root()[0]
    .children.forEach(rec);
  return out;
}

async function buildGlossary(locale) {
  const g = new Map();
  for (const slug of ['index', 'collections/frontpage']) {
    let en, loc;
    try {
      en = await readFile(path.join(SCRAPED, 'en', ...slug.split('/'), 'main.html'), 'utf8');
      loc = await readFile(path.join(SCRAPED, locale, ...slug.split('/'), 'main.html'), 'utf8');
    } catch {
      continue;
    }
    const a = collectStrings(en);
    const b = collectStrings(loc);
    if (a.length !== b.length || !a.every((x, i) => x.kind === b[i].kind)) {
      console.log(`  [${locale}] glossary skip ${slug}: structure drift (${a.length} vs ${b.length})`);
      continue;
    }
    for (let i = 0; i < a.length; i++) {
      const k = norm(a[i].text);
      const v = norm(b[i].text);
      if (k && v && !g.has(k)) g.set(k, v);
    }
  }
  return g;
}

// ---- per-page translation ----
// cache keys are versioned; v4 = brand+domain glossary + domain context
const CACHE_VER = 'v4';
async function resolveAll(strings, locale, glossary) {
  const resolved = new Map();
  const pending = [];
  for (const s of strings) {
    if (resolved.has(s)) continue;
    if (glossary.has(s)) resolved.set(s, glossary.get(s));
    else if (cache[`${CACHE_VER}:${locale}:${sha(s)}`]) resolved.set(s, cache[`${CACHE_VER}:${locale}:${sha(s)}`]);
    else pending.push(s);
  }
  const glossaryId = pending.length ? await ensureGlossary(locale, DEEPL_TARGET[locale]) : null;
  for (let i = 0; i < pending.length; i += 40) {
    const batch = pending.slice(i, i + 40);
    const out = await deeplBatch(batch, DEEPL_TARGET[locale], glossaryId);
    batch.forEach((s, j) => {
      resolved.set(s, out[j]);
      cache[`${CACHE_VER}:${locale}:${sha(s)}`] = out[j];
    });
  }
  return resolved;
}

function localizeUrl(u, locale) {
  return typeof u === 'string' ? u.replace(`${FINAL}/products/`, `${FINAL}/${locale}/products/`).replace(/^\/products\//, `/${locale}/products/`) : u;
}

let grandTotal = { glossary: 0, cached: 0, deepl: 0 };

for (const locale of LOCALES) {
  const glossary = await buildGlossary(locale);
  console.log(`[${locale}] glossary: ${glossary.size} source-translation pairs`);
  const faqMeta = JSON.parse(await readFile(path.join(SCRAPED, locale, 'pages', 'faq', 'meta.json'), 'utf8'));

  for (const product of PRODUCTS) {
    const enDir = path.join(SCRAPED, 'en', 'products', product);
    const locDir = path.join(SCRAPED, locale, 'products', product);
    const enMain = await readFile(path.join(enDir, 'main.html'), 'utf8');
    const enMeta = JSON.parse(await readFile(path.join(enDir, 'meta.json'), 'utf8'));
    const locMetaOld = JSON.parse(await readFile(path.join(locDir, 'meta.json'), 'utf8'));

    // gather all strings needing translation
    const $ = load(enMain, null, false);
    const jobs = []; // {apply(t)}
    const wanted = new Set();
    function rec(node) {
      if (node.type === 'tag' || node.type === 'script' || node.type === 'style') {
        if (SKIP_TAGS.has(node.name)) return;
        for (const a of ATTRS) {
          const v = node.attribs?.[a];
          if (v && translatable(v)) {
            const key = norm(v);
            wanted.add(key);
            jobs.push({ apply: (r) => (node.attribs[a] = r.get(key) ?? v) });
          }
        }
        (node.children || []).forEach(rec);
      } else if (node.type === 'text' && translatable(node.data || '')) {
        const raw = node.data;
        const key = norm(raw);
        wanted.add(key);
        const lead = raw.match(/^\s*/)[0];
        const trail = raw.match(/\s*$/)[0];
        jobs.push({ apply: (r) => (node.data = lead + (r.get(key) ?? key) + trail) });
      }
    }
    $.root()[0].children.forEach(rec);

    // JSON-LD product description
    const ldJobs = [];
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const data = JSON.parse($(el).html());
        if (data['@type'] === 'Product') {
          if (typeof data.description === 'string' && data.description.trim()) {
            const key = norm(data.description);
            wanted.add(key);
            ldJobs.push({ data, el, key });
          } else {
            ldJobs.push({ data, el, key: null });
          }
        }
      } catch {}
    });

    // meta fields; the "– Silver Bullet Tools" title suffix is brand, kept verbatim
    const TITLE_SUFFIX = /\s*[–-]\s*Silver Bullet Tools\s*$/;
    const metaKeys = {};
    for (const [field, val] of [
      ['title', enMeta.title.replace(TITLE_SUFFIX, '')],
      ['description', enMeta.description],
    ]) {
      if (val && translatable(val)) {
        metaKeys[field] = norm(val);
        wanted.add(metaKeys[field]);
      }
    }
    const ogJobs = [];
    for (const tag of enMeta.og) {
      const isTextTag = /property="og:(?:title|description)"|name="twitter:(?:title|description)"/.test(tag);
      const val = (tag.match(/content="([^"]*)"/) || [])[1];
      if (isTextTag && val && translatable(val)) {
        const key = norm(val.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'"));
        wanted.add(key);
        ogJobs.push({ tag, val, key });
      } else {
        ogJobs.push({ tag });
      }
    }

    // resolve
    const before = { deepl: apiChars };
    const gHits = [...wanted].filter((k) => glossary.has(k)).length;
    const cHits = [...wanted].filter((k) => !glossary.has(k) && cache[`${CACHE_VER}:${locale}:${sha(k)}`]).length;
    const resolved = await resolveAll([...wanted], locale, glossary);
    grandTotal.glossary += gHits;
    grandTotal.cached += cHits;
    grandTotal.deepl += wanted.size - gHits - cHits;

    // apply to DOM
    jobs.forEach((j) => j.apply(resolved));
    for (const { data, el, key } of ldJobs) {
      if (key) data.description = resolved.get(key) ?? data.description;
      data.url = localizeUrl(data.url, locale);
      if (Array.isArray(data.offers)) for (const o of data.offers) o.url = localizeUrl(o.url, locale);
      $(el).text('\n' + JSON.stringify(data, null, 2) + '\n');
    }
    const outMain = $.html();

    // build meta.json
    const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
    const og = ogJobs.map(({ tag, val, key }) => {
      let t = tag;
      if (key) t = t.replace(`content="${val}"`, `content="${esc(resolved.get(key) ?? val)}"`);
      // og:url / twitter url style tags don't carry product path in og[] except og:url
      t = t.replace(`content="${FINAL}/products/${product}"`, `content="${FINAL}/${locale}/products/${product}"`);
      return t;
    });
    const meta = {
      ...enMeta,
      locale,
      localizedPath: `/${locale}/products/${product}`,
      url: `${FINAL}/${locale}/products/${product}`,
      slug: `products/${product}`,
      htmlAttrs: enMeta.htmlAttrs.replace(/lang="[a-z]{2}"/, `lang="${locale}"`),
      canonical: `${FINAL}/${locale}/products/${product}`,
      title: metaKeys.title ? `${resolved.get(metaKeys.title)} – Silver Bullet Tools` : enMeta.title,
      description: metaKeys.description ? resolved.get(metaKeys.description) : enMeta.description,
      og,
      activeNav: (enMeta.activeNav || []).map((h) => (h.startsWith('/products/') ? `/${locale}${h}` : h)),
      headFile: locMetaOld.headFile, // locale dir's own product head variant (per-product preloads)
      preludeFile: faqMeta.preludeFile, // translated chrome
      postludeFile: faqMeta.postludeFile,
      translated: true,
    };

    await writeFile(path.join(locDir, 'main.html'), outMain, 'utf8');
    await writeFile(path.join(locDir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf8');
    console.log(`  [${locale}] ${product}: ${wanted.size} strings (glossary ${gHits}, cache ${cHits}, deepl ${wanted.size - gHits - cHits}; ${apiChars - before.deepl} chars)`);
  }
}

await writeFile(cacheFile, JSON.stringify(cache, null, 1), 'utf8');
await writeFile(
  path.join(ROOT, 'scrape', 'translations-manifest.json'),
  JSON.stringify({ pages: LOCALES.flatMap((l) => PRODUCTS.map((p) => `${l}/products/${p}`)) }, null, 2),
  'utf8'
);
console.log(`Done. Strings: glossary ${grandTotal.glossary}, cache ${grandTotal.cached}, DeepL ${grandTotal.deepl} (${apiChars} chars billed this run).`);
