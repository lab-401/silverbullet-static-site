// Diagnoses / verifies the langify floating switcher widget.
import { chromium } from 'playwright';

const BASE = process.env.PROBE_BASE || 'https://silverbullet.tools';
const browser = await chromium.launch();
const vp = process.env.PROBE_VP === 'desktop' ? { width: 1440, height: 900 } : { width: 390, height: 844 };
const page = await (await browser.newContext({ viewport: vp })).newPage();
await page.goto(BASE + '/fr/products/silver-bullet-2', { waitUntil: 'networkidle' });
await page.waitForTimeout(1000);

const w = page.locator('.ly-switcher-wrapper');
console.log('widget count:', await w.count());
if (await w.count()) {
  console.log('widget visible:', await w.first().isVisible());
  const cur = page.locator('.ly-custom-dropdown-current').first();
  await cur.click({ force: true }).catch((e) => console.log('toggle err:', e.message.slice(0, 90)));
  await page.waitForTimeout(600);
  const list = page.locator('.ly-switcher-wrapper ul').first();
  console.log('list visible after toggle:', await list.isVisible().catch(() => false));
  const link = page.locator('.ly-switcher-wrapper a[data-language-code="en"]').first();
  console.log('en link count:', await link.count());
  if (await link.count()) {
    console.log('en link href:', await link.getAttribute('href'));
    await link.click({ force: true }).catch((e) => console.log('link click err:', e.message.slice(0, 90)));
    await page.waitForTimeout(1800);
    console.log('url after click:', page.url());
  }
}
await browser.close();
