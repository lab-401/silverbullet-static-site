// Serves the RAW scraped Shopify pages (scrape/raw) with CDN URLs rewritten to
// the local asset mirror - a deterministic visual reference of the live site,
// immune to Cloudflare bot challenges and network flake.
// Usage: node scripts/reference-server.mjs [port=4323]
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const PORT = Number(process.argv[2] || 4323);
const assetsMap = JSON.parse(await readFile(path.join(ROOT, 'scrape', 'assets-map.json'), 'utf8'));
const LOCALES = new Set(['fr', 'de', 'it', 'es']);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.json': 'application/json',
};

function sanitize(name) {
  return name.replace(/%/g, '_pct_').replace(/[<>:"|?*\\]/g, '_').slice(0, 120);
}

// rewrite CDN references so the browser fetches them from this server
function rewriteHtml(html) {
  return html
    .replace(/(?:https?:)?\/\/silverbullet\.tools\/cdn\//g, '/cdn/')
    .replace(/(?:https?:)?\/\/cdn\.shopify\.com\//g, '/xcdn/cdn.shopify.com/')
    .replace(/(?:https?:)?\/\/fonts\.shopifycdn\.com\//g, '/xcdn/fonts.shopifycdn.com/');
}

async function serveAsset(originalUrl, res) {
  const rel = assetsMap[originalUrl];
  if (!rel) {
    res.writeHead(404).end('asset not mirrored: ' + originalUrl);
    return;
  }
  try {
    const buf = await readFile(path.join(ROOT, 'scrape', 'assets', rel));
    res.writeHead(200, { 'content-type': MIME[path.extname(rel).toLowerCase()] || 'application/octet-stream' });
    res.end(buf);
  } catch {
    res.writeHead(404).end();
  }
}

createServer(async (req, res) => {
  const [rawPath, query] = req.url.split('?');

  if (rawPath.startsWith('/cdn/')) {
    return serveAsset('https://silverbullet.tools' + rawPath + (query ? '?' + query : ''), res);
  }
  if (rawPath.startsWith('/xcdn/')) {
    const rest = rawPath.slice('/xcdn/'.length);
    return serveAsset('https://' + rest + (query ? '?' + query : ''), res);
  }
  if (rawPath.endsWith('/cart.js')) {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end('{"items":[],"item_count":0,"total_price":0,"currency":"EUR","attributes":{},"note":null}');
  }

  // page routing: /<locale?>/rest -> scrape/raw/<locale>/<rest>.html
  const segs = rawPath.split('/').filter(Boolean);
  let locale = 'en';
  if (segs.length && LOCALES.has(segs[0])) locale = segs.shift();
  const fileParts = segs.length ? segs.map(sanitize) : ['index'];
  const file = path.join(ROOT, 'scrape', 'raw', locale, ...fileParts) + '.html';
  try {
    const html = await readFile(file, 'utf8');
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(rewriteHtml(html));
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('no such page: ' + rawPath);
  }
}).listen(PORT, '127.0.0.1', () => console.log(`reference server on http://127.0.0.1:${PORT}`));
