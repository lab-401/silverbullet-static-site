// Lists failing/external requests + console errors with URLs on local pages.
import { chromium } from 'playwright';

const targets = ['/', '/de/', '/products/silver-bullet-2', '/pages/faq'];
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
for (const t of targets) {
  const page = await ctx.newPage();
  const events = [];
  page.on('response', (r) => {
    if (r.status() >= 400) events.push(`HTTP ${r.status()} ${r.url().slice(0, 140)}`);
  });
  page.on('requestfailed', (r) => events.push(`FAILED ${r.failure()?.errorText} ${r.url().slice(0, 140)}`));
  page.on('request', (r) => {
    const u = r.url();
    if (!u.startsWith('http://127.0.0.1') && !u.startsWith('data:')) events.push(`EXTERNAL ${u.slice(0, 140)}`);
  });
  page.on('console', (m) => m.type() === 'error' && events.push(`CONSOLE ${m.text().slice(0, 200)}`));
  page.on('pageerror', (e) => events.push(`PAGEERROR ${String(e).slice(0, 200)}`));
  await page.goto('http://127.0.0.1:4322' + t, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(1200);
  console.log(`\n=== ${t}`);
  [...new Set(events)].forEach((e) => console.log('  ' + e));
  await page.close();
}
await browser.close();
