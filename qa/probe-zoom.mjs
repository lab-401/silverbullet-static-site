// Zoom probe: click the visible product image (img.image-magnify-hover) on the
// product page and check the magnify overlay appears. Replica vs live.
import { chromium } from 'playwright';

const browser = await chromium.launch();

async function zoomClick(base, viewport) {
  const ctx = await browser.newContext({ viewport, ...(viewport.width < 500 ? { isMobile: true, hasTouch: true } : {}) });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 150)));
  await page.goto(base + '/products/silver-bullet-2', { waitUntil: 'load', timeout: 90000 });
  await page.waitForTimeout(1500);
  await page.keyboard.press('Escape').catch(() => {});
  const target = await page.evaluate(() => {
    const imgs = [...document.querySelectorAll('img.image-magnify-hover')].filter((i) => i.offsetParent !== null);
    const i = imgs[0];
    if (!i) return null;
    const r = i.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, total: imgs.length, hasOnclick: typeof i.onclick === 'function' };
  });
  let out = { base, width: viewport.width, target, errs };
  if (target) {
    await page.mouse.click(target.x, target.y);
    await page.waitForTimeout(1200);
    out.afterClick = await page.evaluate(() => {
      const o = document.querySelector('.image-magnify-full-size');
      return {
        overlay: !!o,
        overlayHasBg: o ? (o.style.backgroundImage || '').length > 5 : false,
        modalOpen: !!document.querySelector('product-modal[open]'),
      };
    });
    // overlay should close on click
    if (out.afterClick.overlay) {
      await page.mouse.click(target.x, target.y);
      await page.waitForTimeout(400);
      out.overlayClosesOnClick = await page.evaluate(() => !document.querySelector('.image-magnify-full-size'));
    }
  }
  await page.close(); await ctx.close();
  return out;
}

for (const base of ['http://127.0.0.1:4322', 'https://silverbullet.tools']) {
  console.log(`== ${base} desktop ==`);
  console.log(JSON.stringify(await zoomClick(base, { width: 1440, height: 1000 }), null, 1));
}
await browser.close();
