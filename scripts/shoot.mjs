// Batch screenshotter: captures full-page shots of every page, live or local.
// Usage: node scripts/shoot.mjs live|local [desktop|mobile|both] [onlyFile]
//   onlyFile: text file with one <slug>@<vp>.png per line - reshoot just those
// Output: qa/screenshots/<which>/<slug>@<vp>.png
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const which = process.argv[2];
const vpArg = process.argv[3] || 'both';
if (!['live', 'local'].includes(which)) throw new Error('arg: live|local');
// SHOOT_BASE overrides the origin (e.g. the local reference server for 'live')
const BASE = process.env.SHOOT_BASE || (which === 'live' ? 'https://silverbullet.tools' : 'http://127.0.0.1:4322');

const VIEWPORTS = {
  desktop: { width: 1440, height: 1000 },
  mobile: { width: 390, height: 844 },
};
const vps = vpArg === 'both' ? ['desktop', 'mobile'] : [vpArg];

const manifest = JSON.parse(await readFile(path.join(ROOT, 'scrape', 'pages-manifest.json'), 'utf8'));
let pages = manifest
  .filter((m) => m.file)
  .map((m) => {
    const p = m.locale === 'en' ? m.path : `/${m.locale}${m.path === '/' ? '' : m.path}`;
    return { urlPath: p, slug: (m.locale + (m.path === '/' ? '/index' : decodeURIComponent(m.path))).replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 90) };
  });

// optional pair filter: only reshoot listed <slug>@<vp>.png entries
let onlyPairs = null;
if (process.argv[4]) {
  const lines = (await readFile(process.argv[4], 'utf8')).split(/\r?\n/).filter(Boolean);
  onlyPairs = new Set(lines);
}

const OUT = path.join(ROOT, 'qa', 'screenshots', which);
await mkdir(OUT, { recursive: true });

const FREEZE_CSS = `
*, *::before, *::after {
  animation-duration: 0s !important;
  animation-delay: 0s !important;
  transition-duration: 0s !important;
  transition-delay: 0s !important;
  caret-color: transparent !important;
  scroll-behavior: auto !important;
}
html { scroll-behavior: auto !important; }
/* consent/cookie banners (live only, defensive) */
#shopify-pc__banner, .shopify-pc__banner__dialog, #onetrust-consent-sdk { display: none !important; }
`;

const browser = await chromium.launch();
let failures = 0;

async function shoot(context, job, vp) {
  const page = await context.newPage();
  try {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(BASE + job.urlPath, { waitUntil: 'load', timeout: 60000 });
    await page.addStyleTag({ content: FREEZE_CSS });
    // prime lazy loading: walk down the page, then back to top
    await page.evaluate(async () => {
      const h = document.body.scrollHeight;
      for (let y = 0; y < h; y += 700) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 60));
      }
      window.scrollTo(0, 0);
      document.querySelectorAll('video').forEach((v) => {
        try {
          v.pause();
          v.currentTime = 0;
        } catch {}
      });
      // force-load all lazy images
      document.querySelectorAll('img[loading="lazy"]').forEach((i) => (i.loading = 'eager'));
    });
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    // settle: fonts loaded, all images complete, scrollHeight stable
    await page
      .evaluate(async () => {
        await (document.fonts?.ready || Promise.resolve());
        await Promise.all(
          [...document.images].map((i) => (i.complete ? 0 : new Promise((r) => ((i.onload = r), (i.onerror = r)))))
        );
      })
      .catch(() => {});
    let prevH = -1;
    for (let i = 0; i < 25; i++) {
      const h = await page.evaluate(() => document.body.scrollHeight);
      if (h === prevH) break;
      prevH = h;
      await page.waitForTimeout(400);
    }
    await page.screenshot({ path: path.join(OUT, `${job.slug}@${vp}.png`), fullPage: true });
    console.log(`ok ${job.slug}@${vp}`);
  } catch (e) {
    failures++;
    console.log(`FAIL ${job.slug}@${vp}: ${String(e).slice(0, 140)}`);
  } finally {
    await page.close();
  }
}

for (const vp of vps) {
  const jobs = pages.filter((j) => !onlyPairs || onlyPairs.has(`${j.slug}@${vp}.png`));
  if (!jobs.length) continue;
  const context = await browser.newContext({ viewport: VIEWPORTS[vp], deviceScaleFactor: 1 });
  // suppress langify's browser-language auto-redirect on live AND local pages
  await context.addInitScript(() => {
    window.lyBlockedRoutesList = ['/'];
  });
  // 4-way parallel
  let idx = 0;
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      while (idx < jobs.length) {
        const job = jobs[idx++];
        await shoot(context, job, vp);
      }
    })
  );
  await context.close();
}
await browser.close();
console.log(`done, failures: ${failures}`);
process.exit(failures > 5 ? 1 : 0);
