// Fetches the Shopify Atom feeds referenced from page heads and stores them
// statically under public/, rewriting CDN asset URLs to final-domain paths.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const assetsMap = JSON.parse(await readFile(path.join(ROOT, 'scrape', 'assets-map.json'), 'utf8'));
const LOCALES = ['', 'fr', 'de', 'it', 'es'];
const FEEDS = ['/blogs/news.atom', '/collections/frontpage.atom'];

const URL_RE = /(?:https?:)?\/\/(?:cdn\.shopify\.com|fonts\.shopifycdn\.com|[a-z0-9-]+\.shopifycdn\.(?:com|net)|silverbullet\.tools\/cdn)\/[^\s"'<>\\)]+/g;
function rewrite(xml) {
  return xml.replace(URL_RE, (m) => {
    let u = m.replace(/&amp;/g, '&');
    if (u.startsWith('//')) u = 'https:' + u;
    const mapped = assetsMap[u];
    return mapped ? `https://silverbullet.tools/assets/${mapped}` : m;
  });
}

let ok = 0;
for (const locale of LOCALES) {
  for (const feed of FEEDS) {
    const url = 'https://silverbullet.tools' + (locale ? `/${locale}` : '') + feed;
    const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 site-migration-mirror' } });
    if (!res.ok) {
      console.log(`FAIL ${res.status} ${url}`);
      continue;
    }
    const xml = rewrite(await res.text());
    const out = path.join(ROOT, 'public', ...(locale ? [locale] : []), ...feed.split('/').filter(Boolean));
    await mkdir(path.dirname(out), { recursive: true });
    await writeFile(out, xml, 'utf8');
    ok++;
  }
}
console.log(`Feeds saved: ${ok}/10`);
