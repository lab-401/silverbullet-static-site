// Scrapes silverbullet.tools: all pages (5 locales) + all CDN assets.
// Output: scrape/raw/<locale>/<path>.html, scrape/assets/*, scrape/assets-map.json, scrape/pages-manifest.json
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const OUT_RAW = path.join(ROOT, 'scrape', 'raw');
const OUT_ASSETS = path.join(ROOT, 'scrape', 'assets');
const ORIGIN = 'https://silverbullet.tools';
const LOCALES = ['', 'fr', 'de', 'it', 'es'];
const PAGES = [
  '/',
  '/products/silver-bullet',
  '/products/spare-tips',
  '/products/replacement-case',
  '/products/silver-bullet-2',
  '/pages/how-to-use-the-silver-bullet',
  '/pages/privacy-policy',
  '/pages/terms-conditions',
  '/pages/shipping-information',
  '/pages/warranty-returns-policy',
  '/pages/faq',
  '/pages/silverbullet-full-picking-list',
  '/collections/frontpage',
  '/blogs/news',
  '/blogs/news/silverbullet-official-launch',
  '/blogs/news/getting-started-with-the-silver-bullet',
  '/blogs/news/silverbullet-introduction-by-frenchkey_fr-silverbullet-lockpicking-academy',
  '/blogs/news/silver-bullet-disk-lock-decoding-chart-silverbullet-lockpicking-academy',
  '/blogs/news/silverbullet-end-of-the-year-sale-welcome-2020-with-the-best-lockpicking-tool',
  '/blogs/news/bastille-day-10-sale',
  '/blogs/news/spare-tips-now-available',
  '/blogs/news/%F0%9F%8C%9F-unlock-exceptional-savings-silverbullet-2s-black-friday-cyber-monday-extravaganza-%F0%9F%8E%89',
];
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 site-migration-mirror';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchWithRetry(url, asText = true, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': UA, accept: '*/*' }, redirect: 'follow' });
      if (res.status === 429 || res.status >= 500) {
        await sleep(1500 * (i + 1));
        continue;
      }
      if (!res.ok) return { status: res.status, body: null, finalUrl: res.url };
      const body = asText ? await res.text() : Buffer.from(await res.arrayBuffer());
      return { status: res.status, body, finalUrl: res.url, contentType: res.headers.get('content-type') || '' };
    } catch (e) {
      if (i === tries - 1) return { status: 0, body: null, error: String(e) };
      await sleep(1500 * (i + 1));
    }
  }
  return { status: 0, body: null };
}

function sanitize(name) {
  return name.replace(/%/g, '_pct_').replace(/[<>:"|?*\\]/g, '_').slice(0, 120);
}

function pageFilePath(locale, pagePath) {
  const loc = locale || 'en';
  let p = pagePath === '/' ? 'index' : pagePath.replace(/^\//, '').replace(/\/$/, '');
  const parts = p.split('/').map(sanitize);
  return path.join(OUT_RAW, loc, ...parts) + '.html';
}

async function pLimitAll(items, limit, fn) {
  const results = new Array(items.length);
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// ---------- 1. Pages ----------
const manifest = [];
const pageJobs = [];
for (const locale of LOCALES) {
  for (const p of PAGES) {
    const url = ORIGIN + (locale ? `/${locale}` : '') + p;
    pageJobs.push({ locale: locale || 'en', path: p, url });
  }
}

console.log(`Fetching ${pageJobs.length} pages...`);
await pLimitAll(pageJobs, 6, async (job) => {
  const r = await fetchWithRetry(job.url);
  const file = pageFilePath(job.locale === 'en' ? '' : job.locale, job.path);
  if (r.body) {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, r.body, 'utf8');
  }
  manifest.push({ ...job, status: r.status, finalUrl: r.finalUrl, file: r.body ? path.relative(ROOT, file) : null, error: r.error });
  console.log(`  [${r.status}] ${job.url}`);
});

// robots.txt for reference
const robots = await fetchWithRetry(ORIGIN + '/robots.txt');
if (robots.body) await writeFile(path.join(ROOT, 'scrape', 'robots-original.txt'), robots.body, 'utf8');

// ---------- 2. Collect asset URLs from all HTML ----------
const ASSET_HOST_RE = /(?:https?:)?\/\/(?:cdn\.shopify\.com|fonts\.shopifycdn\.com|[a-z0-9-]+\.shopifycdn\.(?:com|net)|silverbullet\.tools\/cdn)\/[^\s"'<>\\)]+/g;
const REL_CDN_RE = /(?<=["'(=,\s])\/cdn\/[^\s"'<>\\)]+/g;

const assetUrls = new Set();
function normalizeUrl(raw) {
  let u = raw.replace(/&amp;/g, '&').replace(/&#38;/g, '&').replace(/[",']+$/, '');
  if (u.startsWith('//')) u = 'https:' + u;
  if (u.startsWith('/cdn/')) u = ORIGIN + u;
  return u;
}
for (const entry of manifest) {
  if (!entry.file) continue;
  const html = await readFile(path.join(ROOT, entry.file), 'utf8');
  for (const m of html.matchAll(ASSET_HOST_RE)) assetUrls.add(normalizeUrl(m[0]));
  for (const m of html.matchAll(REL_CDN_RE)) assetUrls.add(normalizeUrl(m[0]));
}
console.log(`Found ${assetUrls.size} unique asset URLs in HTML.`);

// ---------- 3. Download assets (+ CSS second pass) ----------
const assetMap = {}; // normalized original URL -> local rel path under scrape/assets
function localAssetPath(url) {
  const u = new URL(url);
  const base = sanitize(path.posix.basename(u.pathname)) || 'asset';
  const hash = createHash('sha1').update(url).digest('hex').slice(0, 10);
  const ext = path.posix.extname(base);
  const stem = ext ? base.slice(0, -ext.length) : base;
  return `${stem}.${hash}${ext}`;
}

const failed = [];
async function downloadAsset(url) {
  if (assetMap[url]) return assetMap[url];
  const rel = localAssetPath(url);
  const r = await fetchWithRetry(url, false);
  if (!r.body) {
    failed.push({ url, status: r.status, error: r.error });
    return null;
  }
  await writeFile(path.join(OUT_ASSETS, rel), r.body);
  assetMap[url] = rel;
  return rel;
}

await mkdir(OUT_ASSETS, { recursive: true });
const firstWave = [...assetUrls];
await pLimitAll(firstWave, 8, async (url) => {
  await downloadAsset(url);
});

// CSS second pass: download url() refs inside CSS files, rewrite CSS to local refs
const cssUrls = firstWave.filter((u) => /\.css(\?|$)/.test(u) && assetMap[u]);
for (const cssUrl of cssUrls) {
  const cssFile = path.join(OUT_ASSETS, assetMap[cssUrl]);
  let css = await readFile(cssFile, 'utf8');
  const refs = [...css.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g)]
    .map((m) => m[2])
    .filter((u) => !u.startsWith('data:') && !u.startsWith('#'));
  for (const ref of new Set(refs)) {
    let abs;
    try {
      abs = normalizeUrl(new URL(ref, cssUrl).href);
    } catch {
      continue;
    }
    const rel = await downloadAsset(abs);
    if (rel) css = css.split(ref).join(rel); // same-dir relative ref after localization
  }
  await writeFile(cssFile, css, 'utf8');
}

await writeFile(path.join(ROOT, 'scrape', 'assets-map.json'), JSON.stringify(assetMap, null, 2), 'utf8');
await writeFile(path.join(ROOT, 'scrape', 'pages-manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
await writeFile(path.join(ROOT, 'scrape', 'assets-failed.json'), JSON.stringify(failed, null, 2), 'utf8');

// External (non-CDN) domains present in HTML — for the report
const extDomains = new Set();
for (const entry of manifest) {
  if (!entry.file) continue;
  const html = await readFile(path.join(ROOT, entry.file), 'utf8');
  for (const m of html.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)) extDomains.add(m[1].toLowerCase());
}
await writeFile(path.join(ROOT, 'scrape', 'external-domains.json'), JSON.stringify([...extDomains].sort(), null, 2), 'utf8');

console.log(`Done. Pages: ${manifest.filter((m) => m.status === 200).length}/${manifest.length} OK. Assets: ${Object.keys(assetMap).length} downloaded, ${failed.length} failed.`);
