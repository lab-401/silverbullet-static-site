// Verifies: country selector removed, language dropdown navigates from every
// locale, langify floating widget state, console cleanliness.
import { chromium } from 'playwright';

const BASE = process.env.PROBE_BASE || 'http://127.0.0.1:4322';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' - ' + detail : ''}`);
  if (!ok) failures++;
};

// 1. country selector absent, language selector present (sample of locales/templates)
for (const t of ['/', '/fr/', '/de/products/silver-bullet-2', '/es/pages/faq', '/it/blogs/news']) {
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 100)));
  page.on('pageerror', (e) => errors.push('PAGEERROR ' + String(e).slice(0, 100)));
  await page.goto(BASE + t, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  const country = await page.locator('form[id*="CountryForm"], select[name="country_code"], #FooterCountryLabel').count();
  const lang = await page.locator('footer form[data-sb-migration="language-selector"]').count();
  check(`country-gone ${t}`, country === 0, `${country} country elements`);
  check(`language-present ${t}`, lang >= 1, `${lang} language forms`);
  check(`console-clean ${t}`, errors.length === 0, errors.slice(0, 2).join(' | '));
  await page.close();
}

// 2. language switching round-trip: en faq -> fr -> es -> back to en
const hops = [
  { from: '/pages/faq', pick: 'fr', expect: '/fr/pages/faq' },
  { from: '/fr/pages/faq', pick: 'es', expect: '/es/pages/faq' },
  { from: '/es/pages/faq', pick: 'en', expect: '/pages/faq' },
  { from: '/de/', pick: 'it', expect: '/it' },
  { from: '/it/blogs/news', pick: 'en', expect: '/blogs/news' },
];
for (const h of hops) {
  const page = await ctx.newPage();
  await page.goto(BASE + h.from, { waitUntil: 'load' });
  const form = page.locator('footer form[data-sb-migration="language-selector"]').first();
  await form.locator('.disclosure__button').click();
  await form.locator(`a[data-value="${h.pick}"]`).click();
  await page.waitForLoadState('load');
  const path = new URL(page.url()).pathname.replace(/\/$/, '') || '/';
  const expect = h.expect.replace(/\/$/, '') || '/';
  check(`switch ${h.from} -> ${h.pick}`, path === expect, `landed on ${path}`);
  await page.close();
}

// 3. langify floating widget: report its presence/behavior
{
  const page = await ctx.newPage();
  await page.goto(BASE + '/fr/pages/faq', { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(1500);
  const widget = page.locator('#langify-switcher, .langify, [class*="ly-switcher"], [id*="ly-switcher"]');
  const count = await widget.count();
  console.log(`INFO langify widget elements found: ${count}`);
  if (count) {
    const visible = await widget.first().isVisible().catch(() => false);
    console.log(`INFO langify widget visible: ${visible}`);
    if (visible) {
      // try to open it and inspect its links
      const links = await page.locator('[class*="ly-switcher"] a, [id*="ly-switcher"] a').evaluateAll((as) => as.map((a) => a.getAttribute('href')).slice(0, 8));
      console.log(`INFO langify widget links: ${JSON.stringify(links)}`);
    }
  }
  await page.close();
}

await browser.close();
console.log(failures ? `${failures} FAILURES` : 'ALL PASS');
process.exit(failures ? 1 : 0);
