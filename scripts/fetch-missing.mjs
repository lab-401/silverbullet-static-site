// Downloads asset URLs that surfaced as unmapped after cleaning (e.g. image
// size variants referenced only inside JSON-LD), merging them into assets-map.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const mapFile = path.join(ROOT, 'scrape', 'assets-map.json');
const assetsMap = JSON.parse(await readFile(mapFile, 'utf8'));
const report = JSON.parse(await readFile(path.join(ROOT, 'scrape', 'clean-report.json'), 'utf8'));

const candidates = report.unmappedUrls.filter((u) => /\.(png|jpe?g|gif|webp|svg|css|woff2?|mp4|webm|ico)(\?|$)/i.test(u));
let ok = 0;
for (const url of candidates) {
  if (assetsMap[url]) continue;
  const u = new URL(url);
  const base = path.posix.basename(u.pathname).replace(/%/g, '_pct_').replace(/[<>:"|?*\\]/g, '_').slice(0, 120);
  const hash = createHash('sha1').update(url).digest('hex').slice(0, 10);
  const ext = path.posix.extname(base);
  const rel = `${ext ? base.slice(0, -ext.length) : base}.${hash}${ext}`;
  const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 site-migration-mirror' } });
  if (!res.ok) {
    console.log(`FAIL ${res.status} ${url}`);
    continue;
  }
  await writeFile(path.join(ROOT, 'scrape', 'assets', rel), Buffer.from(await res.arrayBuffer()));
  assetsMap[url] = rel;
  ok++;
}
await writeFile(mapFile, JSON.stringify(assetsMap, null, 2), 'utf8');
console.log(`Downloaded ${ok}/${candidates.length} missing assets; map now ${Object.keys(assetsMap).length} entries.`);
