// Focused diagnostics for: (a) product image zoom, (b) footer language click
// navigation, (c) mobile slider scrollability — replica vs live.
import { chromium } from 'playwright';

const REPLICA = 'http://127.0.0.1:4322';
const LIVE = 'https://silverbullet.tools';
const browser = await chromium.launch();

async function zoomProbe(base) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 150)));
  await page.goto(base + '/products/silver-bullet-2', { waitUntil: 'load', timeout: 90000 });
  await page.waitForTimeout(1500);
  await page.keyboard.press('Escape').catch(() => {});
  // find the visible media toggle in the active/first visible slide
  const info = await page.evaluate(() => {
    const toggles = [...document.querySelectorAll('.product__media-toggle')];
    const vis = toggles.filter((t) => t.offsetParent !== null);
    const first = vis[0];
    const img = first && first.querySelector('img');
    const r = first && first.getBoundingClientRect();
    return {
      total: toggles.length, visible: vis.length,
      rect: r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null,
      imgClasses: img ? img.className : null,
      openerTag: first ? first.closest('modal-opener') ? 'modal-opener' : first.parentElement.tagName : null,
      dataModal: first ? first.closest('modal-opener')?.getAttribute('data-modal') : null,
    };
  });
  let result = { base, info, errs };
  if (info.rect) {
    const cx = info.rect.x + info.rect.w / 2;
    const cy = info.rect.y + info.rect.h / 2;
    // hover over the visible image
    await page.mouse.move(cx, cy);
    await page.mouse.move(cx + 20, cy + 10);
    await page.waitForTimeout(600);
    result.hoverOverlay = await page.evaluate(() => {
      const o = document.querySelector('.image-magnify-full-size');
      return o ? { exists: true, visible: o.offsetParent !== null } : { exists: false };
    });
    // click to zoom / open modal
    await page.mouse.click(cx, cy);
    await page.waitForTimeout(800);
    result.afterClick = await page.evaluate(() => ({
      magnify: !!document.querySelector('.image-magnify-full-size'),
      modalOpen: !!document.querySelector('product-modal[open]'),
      modalImgVisible: (() => {
        const m = document.querySelector('product-modal[open] img');
        return m ? m.offsetParent !== null : false;
      })(),
    }));
  }
  await page.close(); await ctx.close();
  return result;
}

async function langClickProbe(base, waitMs) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();
  const nav = [];
  page.on('request', (r) => { if (r.isNavigationRequest()) nav.push(`${r.method()} ${r.url()}`); });
  const resp = [];
  page.on('response', (r) => { if (r.request().isNavigationRequest()) resp.push(`${r.status()} ${r.url()}`); });
  await page.goto(base + '/pages/faq', { waitUntil: 'load', timeout: 90000 });
  await page.waitForTimeout(1500);
  await page.keyboard.press('Escape').catch(() => {});
  const btn = page.locator('button[aria-controls="FooterLanguageList"]').first();
  await btn.scrollIntoViewIfNeeded();
  await btn.click();
  await page.waitForTimeout(500);
  const frHref = await page.locator('#FooterLanguageList a[data-value="fr"]').first().getAttribute('href').catch(() => null);
  const formInfo = await page.evaluate(() => {
    const list = document.getElementById('FooterLanguageList');
    const lf = list && list.closest('localization-form');
    const form = lf && lf.querySelector('form');
    const outerForm = list && list.closest('form');
    return {
      formInsideLF: form ? { id: form.id, action: form.getAttribute('action'), onsubmit: form.getAttribute('onsubmit') } : null,
      outerForm: outerForm ? { id: outerForm.id, action: outerForm.getAttribute('action'), onsubmit: outerForm.getAttribute('onsubmit') } : null,
      localeInput: lf ? !!lf.querySelector('input[name="locale_code"]') : null,
    };
  });
  await page.locator('#FooterLanguageList a[data-value="fr"]').first().click().catch(() => {});
  await page.waitForTimeout(waitMs);
  const out = {
    base, frHref, formInfo,
    finalUrl: page.url(),
    htmlLang: await page.evaluate(() => document.documentElement.lang).catch(() => null),
    navRequests: nav.slice(0, 6),
    navResponses: resp.slice(0, 6),
  };
  await page.close(); await ctx.close();
  return out;
}

async function mobileSliderProbe(base) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(base + '/', { waitUntil: 'load', timeout: 90000 });
  await page.waitForTimeout(1500);
  const out = await page.evaluate(() => {
    return [...document.querySelectorAll('slider-component')].map((s) => {
      const ul = s.querySelector('ul[id^="Slider-"]');
      const items = ul ? ul.children.length : 0;
      return {
        id: ul ? ul.id.slice(-12) : null, items,
        buttons: s.querySelectorAll('button[name="next"], button[name="previous"]').length,
        scrollW: ul ? ul.scrollWidth : 0, clientW: ul ? ul.clientWidth : 0,
        display: ul ? getComputedStyle(ul).display : null,
      };
    });
  });
  await page.close(); await ctx.close();
  return { base, sliders: out };
}

console.log('== ZOOM replica =='); console.log(JSON.stringify(await zoomProbe(REPLICA), null, 1));
console.log('== ZOOM live =='); console.log(JSON.stringify(await zoomProbe(LIVE), null, 1));
console.log('== LANG replica =='); console.log(JSON.stringify(await langClickProbe(REPLICA, 3000), null, 1));
console.log('== LANG live =='); console.log(JSON.stringify(await langClickProbe(LIVE, 8000), null, 1));
console.log('== MOBILE SLIDERS replica =='); console.log(JSON.stringify(await mobileSliderProbe(REPLICA), null, 1));
console.log('== MOBILE SLIDERS live =='); console.log(JSON.stringify(await mobileSliderProbe(LIVE), null, 1));

await browser.close();
