// Verifies the Lab401 buy wiring: CTA clicks navigate to the cart permalink
// (with quantity), header cart/login removed, legend + FAQ entry present.
import { chromium } from 'playwright';

const BASE = process.env.PROBE_BASE || 'http://127.0.0.1:4322';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
// never actually hit Lab401 during tests
await ctx.route('**lab401.com/**', (r) => r.abort());
let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' - ' + detail : ''}`);
  if (!ok) failures++;
};

async function clickAndCaptureNav(page, selector) {
  let navUrl = null;
  page.on('request', (r) => {
    if (r.isNavigationRequest() && r.url().includes('lab401.com')) navUrl = r.url();
  });
  await page.locator(selector).first().click();
  await page.waitForTimeout(800);
  return navUrl;
}

// 1. buy-now on EN product page, qty 1
{
  const page = await ctx.newPage();
  await page.goto(BASE + '/products/silver-bullet-2', { waitUntil: 'load' });
  const url = await clickAndCaptureNav(page, '[data-sb-migration="buy-now"]');
  check('buy-now qty1', url === 'https://lab401.com/cart/53597858595163:1', url || 'no nav');
  await page.close();
}
// 2. add-to-cart with qty 3
{
  const page = await ctx.newPage();
  await page.goto(BASE + '/products/silver-bullet-2', { waitUntil: 'load' });
  await page.locator('input[name="quantity"]').first().fill('3');
  const url = await clickAndCaptureNav(page, 'form[data-sb-migration="add-to-cart-form"] button[type="submit"]');
  check('add-to-cart qty3', url === 'https://lab401.com/cart/53597858595163:3', url || 'no nav');
  await page.close();
}
// 3. buy-now on FR translated product page + homepage featured section
for (const t of ['/fr/products/silver-bullet-2', '/', '/de/']) {
  const page = await ctx.newPage();
  await page.goto(BASE + t, { waitUntil: 'load' });
  const url = await clickAndCaptureNav(page, '[data-sb-migration="buy-now"]');
  check(`buy-now ${t}`, !!url && url.startsWith('https://lab401.com/cart/53597858595163:'), url || 'no nav');
  await page.close();
}
// 4. header cart/login gone; search stays; legend + FAQ entries
{
  const page = await ctx.newPage();
  await page.goto(BASE + '/', { waitUntil: 'load' });
  check('cart icon gone', (await page.locator('a[href="/cart"], a[href*="customer_authentication"], a[href^="/account"]').count()) === 0);
  check('search icon stays', (await page.locator('.header__icons details, .header__icon--search, .header__search').count()) >= 1);
  check('legend on homepage', (await page.locator('[data-sb-migration="buy-legend"]').count()) >= 1);
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 100)));
  await page.waitForTimeout(800);
  check('console clean', errors.length === 0, errors.join(' | '));
  await page.close();
}
for (const [loc, expectQ] of [
  ['', 'How do I purchase the SilverBullet?'],
  ['/fr', 'Comment acheter le SilverBullet ?'],
  ['/de', 'Wie kaufe ich den SilverBullet?'],
  ['/it', 'Come si acquista il SilverBullet?'],
  ['/es', '¿Cómo compro el SilverBullet?'],
]) {
  const page = await ctx.newPage();
  await page.goto(BASE + loc + '/pages/faq', { waitUntil: 'load' });
  const q = await page.locator('[data-sb-migration="faq-distributor"]').textContent().catch(() => null);
  check(`faq entry ${loc || '/en'}`, q?.trim() === expectQ, q?.trim() || 'missing');
  await page.close();
}
// 5. legend present + translated on FR product page
{
  const page = await ctx.newPage();
  await page.goto(BASE + '/fr/products/silver-bullet-2', { waitUntil: 'load' });
  const legend = await page.locator('[data-sb-migration="buy-legend"]').first().textContent();
  check('legend FR translated', legend.includes('distributeur de confiance') && legend.includes('Lab401.com'), legend.trim());
  await page.close();
}

await browser.close();
console.log(failures ? `${failures} FAILURES` : 'ALL PASS');
process.exit(failures ? 1 : 0);
