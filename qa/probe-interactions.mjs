// Interaction QA probe: verifies header search modal, nav dropdowns, footer
// language selector, product gallery/zoom/buy-now/quantity, mobile drawer and
// homepage sliders on the static replica, and compares against the live site.
// Usage: node qa/probe-interactions.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPLICA = 'http://127.0.0.1:4322';
const LIVE = 'https://silverbullet.tools';
const SHOTS = path.join(path.dirname(fileURLToPath(import.meta.url)), 'screenshots', 'interactions');
fs.mkdirSync(SHOTS, { recursive: true });

const results = [];
function rec(id, status, detail) {
  results.push({ id, status, detail });
  console.log(`[${status}] ${id}: ${detail}`);
}

const browser = await chromium.launch();

async function newPage(ctx) {
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(String(e).slice(0, 200)));
  return page;
}

async function shot(page, name) {
  try { await page.screenshot({ path: path.join(SHOTS, name + '.png') }); } catch {}
}

// ---------------------------------------------------------------- helpers
async function openSearchModal(page) {
  const summary = page.locator('summary.header__icon--search, details-modal summary:has(.icon-search)').first();
  if ((await summary.count()) === 0) return { ok: false, why: 'search summary/icon not found' };
  await summary.click();
  await page.waitForTimeout(400);
  const open = await page.evaluate(() => {
    const dm = document.querySelector('details-modal details');
    const inp = document.getElementById('Search-In-Modal');
    const vis = inp && inp.offsetParent !== null;
    return { detailsOpen: !!(dm && dm.hasAttribute('open')), inputVisible: !!vis };
  });
  if (!open.detailsOpen || !open.inputVisible) return { ok: false, why: JSON.stringify(open) };
  // close with Escape
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  const closed = await page.evaluate(() => !document.querySelector('details-modal details[open]'));
  return { ok: true, closesOnEscape: closed };
}

async function drawerProbe(page) {
  const burger = page.locator('header-drawer summary.header__icon--menu, summary.header__icon--menu').first();
  if ((await burger.count()) === 0) return { ok: false, why: 'hamburger summary not found' };
  await burger.click();
  await page.waitForTimeout(600);
  return await page.evaluate(() => {
    const det = document.querySelector('#Details-menu-drawer-container, header-drawer details');
    const drawer = document.getElementById('menu-drawer');
    const links = drawer ? [...drawer.querySelectorAll('a')].filter((a) => a.offsetParent !== null) : [];
    return {
      ok: !!(det && det.hasAttribute('open') && drawer && links.length > 0),
      open: !!(det && det.hasAttribute('open')),
      visibleLinks: links.map((a) => `${a.textContent.trim()} -> ${a.getAttribute('href')}`),
    };
  });
}

// ================================================================ REPLICA
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await newPage(ctx);

// ---- 1a. header search modal (desktop, homepage)
await page.goto(REPLICA + '/', { waitUntil: 'load', timeout: 60000 });
await page.waitForTimeout(800);
const search = await openSearchModal(page);
rec('replica.desktop.search-modal', search.ok ? 'PASS' : 'FAIL',
  search.ok ? `opens; input visible; closes on Escape=${search.closesOnEscape}` : search.why);
await shot(page, 'replica-home-after-search');

// ---- 1b. nav dropdowns
const dd = await page.evaluate(() => {
  const dets = document.querySelectorAll('header-menu details, .header__inline-menu details');
  const items = document.querySelectorAll('.header__inline-menu a.header__menu-item, .header__inline-menu .header__menu-item');
  return { dropdowns: dets.length, topLevelLinks: items.length };
});
if (dd.dropdowns > 0) {
  const sum = page.locator('header-menu details > summary').first();
  await sum.click();
  await page.waitForTimeout(400);
  const opened = await page.evaluate(() => !!document.querySelector('header-menu details[open]'));
  rec('replica.desktop.nav-dropdown', opened ? 'PASS' : 'FAIL', `dropdowns=${dd.dropdowns} open-after-click=${opened}`);
} else {
  rec('replica.desktop.nav-dropdown', 'INFO', `no dropdown submenus in header (top-level links=${dd.topLevelLinks})`);
}

// ---- 1c. footer language selector on /pages/faq
await page.goto(REPLICA + '/pages/faq', { waitUntil: 'load', timeout: 60000 });
await page.waitForTimeout(800);
const langBtn = page.locator('#FooterLanguageForm button[aria-controls="FooterLanguageList"], button[aria-controls="FooterLanguageList"]').first();
if ((await langBtn.count()) === 0) {
  rec('replica.desktop.lang-selector-open', 'FAIL', 'footer language button not found');
} else {
  await langBtn.scrollIntoViewIfNeeded();
  await langBtn.click();
  await page.waitForTimeout(400);
  const state = await page.evaluate(() => {
    const btn = document.querySelector('button[aria-controls="FooterLanguageList"]');
    const list = document.getElementById('FooterLanguageList');
    const wrapper = list && list.closest('.disclosure__list-wrapper');
    const links = list ? [...list.querySelectorAll('a[data-value]')].map((a) => ({
      lang: a.dataset.value, href: a.getAttribute('href'), visible: a.offsetParent !== null,
    })) : [];
    return { expanded: btn && btn.getAttribute('aria-expanded'), hidden: wrapper && wrapper.hasAttribute('hidden'), links };
  });
  const listOpen = state.expanded === 'true' && state.hidden === false;
  const frLink = state.links.find((l) => l.lang === 'fr');
  rec('replica.desktop.lang-selector-open', listOpen ? 'PASS' : 'FAIL',
    `aria-expanded=${state.expanded} wrapper-hidden=${state.hidden} links=${state.links.map((l) => l.lang + ':' + l.href).join(' ')}`);
  rec('replica.desktop.lang-selector-hrefs',
    frLink && frLink.href === '/fr/pages/faq' ? 'PASS' : 'FAIL',
    `fr href=${frLink ? frLink.href : 'MISSING'} (expected /fr/pages/faq)`);
  await shot(page, 'replica-faq-lang-open');

  // click Français and observe where we end up
  if (frLink) {
    const fr = page.locator('#FooterLanguageList a[data-value="fr"]').first();
    await fr.click().catch(() => {});
    await page.waitForTimeout(2500);
    const url = new URL(page.url());
    const title = await page.title().catch(() => '');
    const bodyStart = await page.evaluate(() => (document.body ? document.body.innerText.slice(0, 120) : '')).catch(() => '');
    const landedOk = url.pathname === '/fr/pages/faq';
    rec('replica.desktop.lang-selector-click-navigates', landedOk ? 'PASS' : 'FAIL',
      `after click url=${url.pathname} title="${title}" bodyStart="${bodyStart.replace(/\s+/g, ' ').slice(0, 80)}"`);
    await shot(page, 'replica-faq-lang-clicked');
  }
}

// ---- 2. product page /products/silver-bullet-2
await page.goto(REPLICA + '/products/silver-bullet-2', { waitUntil: 'load', timeout: 60000 });
await page.waitForTimeout(1000);

// 2a. thumbnails switch main image
const before = await page.evaluate(() => {
  const active = document.querySelector('media-gallery .product__media-list .is-active, .product__media-list li.is-active');
  const img = active && active.querySelector('img');
  return { activeId: active ? active.getAttribute('data-media-id') : null, src: img ? img.currentSrc || img.src : null };
});
const thumb2 = page.locator('.thumbnail-list__item').nth(1).locator('button.thumbnail');
if ((await thumb2.count()) === 0) {
  rec('replica.product.thumbnails', 'FAIL', 'thumbnail buttons not found');
} else {
  const targetId = await page.locator('.thumbnail-list__item').nth(1).getAttribute('data-target');
  await thumb2.click();
  await page.waitForTimeout(900);
  const after = await page.evaluate(() => {
    const active = document.querySelector('media-gallery .product__media-list .is-active, .product__media-list li.is-active');
    const img = active && active.querySelector('img');
    const cur = document.querySelector('.thumbnail-list__item button[aria-current="true"]');
    return {
      activeId: active ? active.getAttribute('data-media-id') : null,
      src: img ? img.currentSrc || img.src : null,
      ariaCurrentTarget: cur ? cur.closest('.thumbnail-list__item').getAttribute('data-target') : null,
    };
  });
  const switched = after.activeId === targetId && after.activeId !== before.activeId && after.src !== before.src;
  rec('replica.product.thumbnails', switched ? 'PASS' : 'FAIL',
    `before=${before.activeId} clicked-target=${targetId} after=${after.activeId} aria-current=${after.ariaCurrentTarget} imgChanged=${after.src !== before.src}`);
  await shot(page, 'replica-product-thumb2');
}

// 2b. image zoom (hover-magnify and/or lightbox modal)
const zoomToggle = page.locator('.product__media-list .is-active .product__media-toggle, .product__media-toggle').first();
if ((await zoomToggle.count()) === 0) {
  rec('replica.product.zoom', 'FAIL', 'no product__media-toggle found');
} else {
  await zoomToggle.hover().catch(() => {});
  await page.waitForTimeout(300);
  const hoverOverlay = await page.evaluate(() => !!document.querySelector('.image-magnify-full-size'));
  await zoomToggle.click({ force: true }).catch(() => {});
  await page.waitForTimeout(600);
  const zoomState = await page.evaluate(() => ({
    magnifyOverlay: !!document.querySelector('.image-magnify-full-size'),
    modalOpen: !!document.querySelector('product-modal[open]'),
    modalExists: !!document.querySelector('product-modal'),
  }));
  const zoomWorks = hoverOverlay || zoomState.magnifyOverlay || zoomState.modalOpen;
  rec('replica.product.zoom', zoomWorks ? 'PASS' : 'FAIL',
    `hoverMagnify=${hoverOverlay || zoomState.magnifyOverlay} modalOpen=${zoomState.modalOpen} modalExists=${zoomState.modalExists}`);
  await shot(page, 'replica-product-zoom');
  // close whatever opened
  await page.keyboard.press('Escape').catch(() => {});
  await page.mouse.move(10, 10);
  await page.waitForTimeout(300);
}

// 2c. buy-now placeholder
const buy = await page.evaluate(() => {
  const b = document.querySelector('button[data-sb-migration="buy-now"]');
  return b ? { text: b.textContent.trim(), visible: b.offsetParent !== null } : null;
});
rec('replica.product.buy-now', buy && buy.visible ? 'PASS' : 'FAIL',
  buy ? `text="${buy.text}" visible=${buy.visible}` : 'button[data-sb-migration=buy-now] missing');

// 2d. quantity +/- buttons
const qty = page.locator('quantity-input input.quantity__input, input[name="quantity"]').first();
if ((await qty.count()) === 0) {
  rec('replica.product.quantity', 'FAIL', 'quantity input not found');
} else {
  const v0 = Number(await qty.inputValue());
  await page.locator('quantity-input button[name="plus"], button[name="plus"]').first().click();
  await page.waitForTimeout(300);
  const v1 = Number(await qty.inputValue());
  await page.locator('quantity-input button[name="minus"], button[name="minus"]').first().click();
  await page.waitForTimeout(300);
  const v2 = Number(await qty.inputValue());
  const ok = v1 === v0 + 1 && v2 === v0;
  rec('replica.product.quantity', ok ? 'PASS' : 'FAIL', `start=${v0} after-plus=${v1} after-minus=${v2}`);
}
rec('replica.product.pageerrors', page.errors.length === 0 ? 'PASS' : 'FAIL',
  page.errors.length ? page.errors.join(' | ') : 'no JS page errors during product interactions');

// ---- 4. homepage sliders / carousels (desktop)
await page.goto(REPLICA + '/', { waitUntil: 'load', timeout: 60000 });
await page.waitForTimeout(800);
const sliders = await page.evaluate(() => {
  return [...document.querySelectorAll('slider-component')].map((s) => {
    const ul = s.querySelector('ul[id^="Slider-"]');
    const heading = s.closest('.section, section, div[class*="section"]')?.querySelector('h2')?.textContent.trim().slice(0, 50);
    return {
      sliderId: ul ? ul.id : null,
      heading: heading || null,
      buttons: s.querySelectorAll('button[name="next"], button[name="previous"]').length,
      scrollable: ul ? ul.scrollWidth > ul.clientWidth + 5 : false,
    };
  });
});
const withButtons = sliders.filter((s) => s.buttons > 0);
if (withButtons.length === 0) {
  rec('replica.home.sliders-desktop', 'INFO',
    `slider-components=${sliders.length}, none render arrow buttons at 1440px: ${JSON.stringify(sliders)}`);
} else {
  for (const s of withButtons) {
    const ul = page.locator(`#${CSS.escape ? s.sliderId : s.sliderId}`);
    const next = page.locator(`slider-component:has(#${s.sliderId}) button[name="next"]`).first();
    const s0 = await page.evaluate((id) => document.getElementById(id).scrollLeft, s.sliderId);
    await next.click();
    await page.waitForTimeout(700);
    const s1 = await page.evaluate((id) => document.getElementById(id).scrollLeft, s.sliderId);
    rec(`replica.home.slider(${s.heading || s.sliderId})`, s1 > s0 ? 'PASS' : 'FAIL', `scrollLeft ${s0} -> ${s1}`);
  }
}
await page.close();

// ---- 3. mobile 390px: hamburger drawer + testimonial slider
const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const mpage = await newPage(mctx);
await mpage.goto(REPLICA + '/', { waitUntil: 'load', timeout: 60000 });
await mpage.waitForTimeout(800);
const drawer = await drawerProbe(mpage);
rec('replica.mobile.hamburger', drawer.ok ? 'PASS' : 'FAIL',
  drawer.ok ? `drawer open; ${drawer.visibleLinks.length} visible links: ${drawer.visibleLinks.slice(0, 8).join(' ; ')}`
            : JSON.stringify(drawer));
await shot(mpage, 'replica-mobile-drawer');
await mpage.keyboard.press('Escape').catch(() => {});

// testimonial slider on mobile (multicolumn becomes swipeable slider)
const mslider = await mpage.evaluate(() => {
  return [...document.querySelectorAll('slider-component')].map((s) => {
    const ul = s.querySelector('ul[id^="Slider-"]');
    return {
      id: ul ? ul.id : null,
      buttons: s.querySelectorAll('button[name="next"], button[name="previous"]').length,
      scrollable: ul ? ul.scrollWidth > ul.clientWidth + 5 : false,
    };
  });
});
const mWithButtons = mslider.filter((s) => s.buttons > 0);
if (mWithButtons.length > 0) {
  const t = mWithButtons[0];
  const s0 = await mpage.evaluate((id) => document.getElementById(id).scrollLeft, t.id);
  await mpage.locator(`slider-component:has(#${t.id}) button[name="next"]`).first().click();
  await mpage.waitForTimeout(700);
  const s1 = await mpage.evaluate((id) => document.getElementById(id).scrollLeft, t.id);
  rec('replica.mobile.slider-buttons', s1 > s0 ? 'PASS' : 'FAIL', `#${t.id} scrollLeft ${s0} -> ${s1}`);
} else {
  rec('replica.mobile.slider-buttons', 'INFO', `no arrow buttons at 390px either: ${JSON.stringify(mslider)}`);
}
const swipe = mslider.find((s) => s.scrollable);
rec('replica.mobile.slider-swipeable', swipe ? 'PASS' : 'INFO',
  swipe ? `#${swipe.id} is horizontally scrollable (swipe carousel)` : 'no horizontally scrollable slider found at 390px');
rec('replica.mobile.pageerrors', mpage.errors.length === 0 ? 'PASS' : 'FAIL',
  mpage.errors.length ? mpage.errors.join(' | ') : 'no JS page errors on mobile homepage');
await mpage.close();
await mctx.close();
await ctx.close();

// ================================================================ LIVE parity
console.log('\n--- live site parity checks ---');
try {
  const lctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const lpage = await newPage(lctx);
  await lpage.goto(LIVE + '/', { waitUntil: 'load', timeout: 90000 });
  await lpage.waitForTimeout(2000);
  // dismiss any popups best-effort
  await lpage.keyboard.press('Escape').catch(() => {});

  const lsearch = await openSearchModal(lpage);
  rec('live.desktop.search-modal', lsearch.ok ? 'PASS' : 'FAIL', lsearch.ok ? 'opens on live too' : lsearch.why);

  const ldd = await lpage.evaluate(() => ({
    dropdowns: document.querySelectorAll('header-menu details, .header__inline-menu details').length,
    sliders: [...document.querySelectorAll('slider-component')].map((s) => ({
      id: s.querySelector('ul[id^="Slider-"]')?.id || null,
      buttons: s.querySelectorAll('button[name="next"], button[name="previous"]').length,
    })),
  }));
  rec('live.desktop.nav-dropdowns', 'INFO', `dropdowns=${ldd.dropdowns}`);
  rec('live.home.sliders', 'INFO', JSON.stringify(ldd.sliders));

  // live language selector click parity on /pages/faq
  await lpage.goto(LIVE + '/pages/faq', { waitUntil: 'load', timeout: 90000 });
  await lpage.waitForTimeout(1500);
  const lbtn = lpage.locator('button[aria-controls="FooterLanguageList"]').first();
  if ((await lbtn.count()) > 0) {
    await lbtn.scrollIntoViewIfNeeded();
    await lbtn.click();
    await lpage.waitForTimeout(500);
    const lfr = lpage.locator('#FooterLanguageList a[data-value="fr"]').first();
    const lhref = await lfr.getAttribute('href').catch(() => null);
    await lfr.click().catch(() => {});
    await lpage.waitForTimeout(4000);
    const lurl = new URL(lpage.url());
    rec('live.desktop.lang-selector-click', lurl.pathname === '/fr/pages/faq' ? 'PASS' : 'FAIL',
      `href=${lhref} landed=${lurl.pathname}`);
  } else {
    rec('live.desktop.lang-selector-click', 'INFO', 'footer language button not found on live (markup change?)');
  }
  await lpage.close();
  await lctx.close();
} catch (e) {
  rec('live.parity', 'INFO', 'live checks inconclusive: ' + String(e).slice(0, 200));
}

await browser.close();

console.log('\n=== SUMMARY ===');
for (const r of results) console.log(`${r.status}\t${r.id}\t${r.detail}`);
fs.writeFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'interactions-report.json'), JSON.stringify(results, null, 2));
