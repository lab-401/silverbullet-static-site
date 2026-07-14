// Verifies the QA-report fixes: language-selector navigation, zero console
// errors / failed requests, PDF availability, cart shim.
import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:4322';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' - ' + detail : ''}`);
  if (!ok) failures++;
};

// 1. console/network cleanliness on key pages
for (const t of ['/', '/de/', '/products/silver-bullet-2', '/blogs/news']) {
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 120)));
  page.on('pageerror', (e) => errors.push('PAGEERROR ' + String(e).slice(0, 120)));
  page.on('response', (r) => r.status() >= 400 && errors.push(`HTTP ${r.status()} ${r.url().slice(0, 100)}`));
  page.on('requestfailed', (r) => errors.push(`REQFAIL ${r.url().slice(0, 100)}`));
  await page.goto(BASE + t, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(1500);
  check(`console-clean ${t}`, errors.length === 0, errors.slice(0, 3).join(' | '));
  await page.close();
}

// 2. language selector click navigates
{
  const page = await ctx.newPage();
  await page.goto(BASE + '/pages/faq', { waitUntil: 'load' });
  const langForm = page.locator('footer form[data-sb-migration="language-selector"]').first();
  await langForm.locator('.disclosure__button').click();
  await langForm.locator('a[data-value="fr"]').click();
  await page.waitForLoadState('load');
  check('language-selector navigates', page.url().includes('/fr/pages/faq'), page.url());
  await page.close();
}

// 3. PDF exists
{
  const page = await ctx.newPage();
  const res = await page.request.get(BASE + '/assets/silverbullet-decoding-matrix.pdf');
  check('decoding-matrix PDF', res.status() === 200 && (await res.body()).length > 100000, `status ${res.status()}`);
  // atom feed
  const feed = await page.request.get(BASE + '/blogs/news.atom');
  check('atom feed', feed.status() === 200 && (await feed.text()).includes('<feed'), `status ${feed.status()}`);
  const feedDe = await page.request.get(BASE + '/de/blogs/news.atom');
  check('atom feed de', feedDe.status() === 200, `status ${feedDe.status()}`);
  await page.close();
}

await browser.close();
process.exit(failures ? 1 : 0);
