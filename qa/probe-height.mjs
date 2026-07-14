// Diagnose height explosions: console errors + tallest DOM elements, live vs local.
import { chromium } from 'playwright';

const targets = [
  ['local', 'http://127.0.0.1:4322/de/'],
  ['live', 'https://silverbullet.tools/de/'],
  ['local-terms', 'http://127.0.0.1:4322/pages/terms-conditions'],
  ['live-terms', 'https://silverbullet.tools/pages/terms-conditions'],
];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
for (const [label, url] of targets) {
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 160)));
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + String(e).slice(0, 160)));
  await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(1500);
  const info = await page.evaluate(() => {
    const h = document.body.scrollHeight;
    const tall = [...document.querySelectorAll('body *')]
      .map((el) => ({ el, hh: el.offsetHeight }))
      .filter((x) => x.hh > 2000)
      .sort((a, b) => b.hh - a.hh)
      .slice(0, 8)
      .map((x) => `${x.el.tagName}.${(x.el.className || '').toString().slice(0, 60)}#${x.el.id || ''} h=${x.hh}`);
    return { bodyHeight: h, tall };
  });
  console.log(`\n=== ${label} (${url}) bodyHeight=${info.bodyHeight}`);
  info.tall.forEach((t) => console.log('  ' + t));
  errors.slice(0, 6).forEach((e) => console.log('  ERR: ' + e));
  await page.close();
}
await browser.close();
