// Mechanical Shopify strip + asset localization.
// In:  scrape/raw/<locale>/**.html + scrape/assets-map.json
// Out: scrape/clean/<locale>/**.html + scrape/clean-report.json
//
// What it does:
//  1. Rewrites every Shopify CDN asset URL to the local /assets/<file> copy.
//  2. Strips Shopify platform scripts (analytics, checkout, wallets, pixels...).
//  3. Keeps Dawn theme scripts that drive visuals (sliders, menus, modals, zoom).
//  4. Neutralizes Shopify forms (cart, search, newsletter) as inert placeholders
//     tagged data-sb-migration for later re-linking.
//  5. Replaces the JS-hydrated accelerated-checkout skeleton with a static,
//     Dawn-styled localized "Buy it now" button (data-sb-migration="buy-now").
//  6. Turns the JS language switcher into plain locale links for the same page.
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { load } from 'cheerio';
import { STRINGS } from './i18n-strings.mjs';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const assetsMap = JSON.parse(await readFile(path.join(ROOT, 'scrape', 'assets-map.json'), 'utf8'));
const manifest = JSON.parse(await readFile(path.join(ROOT, 'scrape', 'pages-manifest.json'), 'utf8'));

const LOCALES = ['fr', 'de', 'it', 'es']; // en is unprefixed
const BUY_LABEL = {
  en: 'Buy it now',
  fr: 'Acheter maintenant',
  de: 'Jetzt kaufen',
  it: 'Acquista ora',
  es: 'Comprar ahora',
};

// script src substrings that mark Shopify platform code (strip)
const STRIP_SRC = [
  '/checkouts/internal/preloads',
  'shop.app/',
  'shopifycloud/',
  'web-pixels',
  '/wpm/',
  'monorail',
  'standard-actions.js',
  'boomerang',
  'shopify-perf-kit',
  'webmcp',
  // shopifycloud platform files that were localized into /assets before stripping
  'loader.init-shop-cart-sync',
  'shop-follow-button',
  'load_feature-',
  'storefront-',
  'origin_trials-',
  'portable-wallets',
  // theme scripts whose only job is Shopify backend I/O. NOTE: matched by
  // name prefix (not ".js") because URL localization renames them to
  // <name>.<hash>.js before this check runs.
  // localization-form. is KEPT: it drives the locale dropdown open/close;
  // scripts/patch-assets.mjs replaces its form.submit() with href navigation.
  'product-form.',
  'predictive-search.',
  'cart-notification.',
  'cart-drawer.',
  '/assets/cart.',
];

// inline-script content markers (strip). Checked only if no KEEP marker matches.
const STRIP_INLINE = [
  'Shopify.shop',
  'ShopifyAnalytics',
  'trekkie',
  'monorail',
  'BOOMR',
  'boomerang',
  'webPixelsManager',
  'WebPixelsManager',
  'web-pixels-manager',
  'shopify.content_for_header',
  'dynamic_checkout',
  'buyer_consent',
  'portableWallets',
  'PaymentButton',
  'SignInWithShop',
  'OriginTrials',
  'originTrialsDone',
  'captcha',
  'shop_events_listener',
  'CustomerPrivacy',
  'privacyBanner',
  'cart-performance',
  'shop-follow-button',
  'shop-cart-sync',
  'signifyd', // fraud-protection app loader, dies with Shopify
  'Shopify.MCP', // advertises a dead /api/mcp endpoint to agents
  'ShopifyPay',
];
const KEEP_INLINE = [
  "className.replace('no-js'", // theme no-js swap
  'no-js-inline',
];

const STRIP_SCRIPT_IDS = new Set([
  'apple-pay-shop-capabilities',
  'shopify-features',
  'shop-js-analytics',
  '__st',
  'captcha-bootstrap',
  'shopify-cfh-end',
  'shopify-origin-trials',
]);

const PRECONNECT_STRIP = ['cdn.shopify.com', 'fonts.shopifycdn.com', 'shop.app', 'monorail', 'extensions.shopifycdn.com'];

// ---- URL rewriting ----
const URL_RE = /(?:https?:)?\/\/(?:cdn\.shopify\.com|fonts\.shopifycdn\.com|[a-z0-9-]+\.shopifycdn\.(?:com|net)|silverbullet\.tools\/cdn)\/[^\s"'<>\\)]+|(?<=["'(=,\s])\/cdn\/[^\s"'<>\\)]+/g;

function normalizeUrl(raw) {
  let u = raw.replace(/&amp;/g, '&').replace(/&#38;/g, '&');
  if (u.startsWith('//')) u = 'https:' + u;
  if (u.startsWith('/cdn/')) u = 'https://silverbullet.tools' + u;
  return u;
}

const unmapped = new Set();
function rewriteUrls(html) {
  return html.replace(URL_RE, (m) => {
    const norm = normalizeUrl(m);
    const mapped = assetsMap[norm];
    if (mapped) return '/assets/' + mapped;
    // URLs of scripts we strip anyway don't matter; log the rest
    unmapped.add(norm);
    return m;
  });
}

// JSON-escaped CDN URLs inside ld+json blocks (https:\/\/silverbullet.tools\/cdn\/...)
// are rewritten to absolute final-domain asset URLs, keeping JSON escaping.
const ESCAPED_URL_RE = /https?:\\\/\\\/(?:silverbullet\.tools\\\/cdn|cdn\.shopify\.com|fonts\.shopifycdn\.com)\\\/[^"\s\\]+(?:\\\/[^"\s\\]+|\\u0026[^"\s\\]+)*/g;
function rewriteEscapedUrls(html) {
  return html.replace(ESCAPED_URL_RE, (m) => {
    const unescaped = m.replace(/\\\//g, '/').replace(/\\u0026/gi, '&');
    const norm = normalizeUrl(unescaped);
    const mapped = assetsMap[norm];
    if (!mapped) {
      unmapped.add(norm);
      return m;
    }
    return `https:\\/\\/silverbullet.tools\\/assets\\/${mapped}`;
  });
}

// locale-equivalent path for the language switcher
function localeHref(targetLocale, enPath) {
  const p = enPath === '/' ? '/' : enPath;
  return targetLocale === 'en' ? p : `/${targetLocale}${p === '/' ? '' : p}`.replace(/\/$/, '') || `/${targetLocale}`;
}

const report = [];

for (const entry of manifest) {
  if (!entry.file) continue;
  const locale = entry.locale;
  const enPath = decodeURIComponent(entry.path); // path without locale prefix
  let html = await readFile(path.join(ROOT, entry.file), 'utf8');
  html = rewriteEscapedUrls(rewriteUrls(html));
  // locale-prefixed links to the root-scoped PDF download
  html = html.replace(/\/(?:fr|de|it|es)(\/assets\/silverbullet-decoding-matrix\.pdf)/g, '$1');
  // Shopify emits gtin13 as a leading-zero number literal - invalid JSON
  html = html.replace(/"gtin13"\s*:\s*0(\d+)/g, '"gtin13": "0$1"');

  const $ = load(html);
  const stats = { page: `${locale}${enPath}`, scriptsStripped: 0, scriptsKept: 0, formsNeutralized: 0, buyButtons: 0 };

  // 1. strip scripts
  $('script').each((_, el) => {
    const $el = $(el);
    const src = $el.attr('src') || '';
    const id = $el.attr('id') || '';
    const text = $el.html() || '';
    const type = ($el.attr('type') || '').toLowerCase();
    if (type === 'application/ld+json') {
      // normalize schema: drop dead SearchAction, empty sameAs, stale brand
      try {
        const data = JSON.parse($el.html());
        if (data['@type'] === 'WebSite') delete data.potentialAction;
        if (data['@type'] === 'Organization' && Array.isArray(data.sameAs)) data.sameAs = data.sameAs.filter(Boolean);
        if (data['@type'] === 'Product' && data.brand?.name === 'sbtools') data.brand.name = 'Silver Bullet Tools';
        $el.text('\n' + JSON.stringify(data, null, 2) + '\n');
      } catch {
        /* leave unparseable blocks untouched */
      }
      return;
    }
    let strip = false;
    if (src && STRIP_SRC.some((s) => src.includes(s))) strip = true;
    else if (STRIP_SCRIPT_IDS.has(id)) strip = true;
    else if (!src && type !== 'application/json') {
      if (!KEEP_INLINE.some((k) => text.includes(k)) && STRIP_INLINE.some((k) => text.includes(k))) strip = true;
    } else if (!src && type === 'application/json' && STRIP_SCRIPT_IDS.has(id)) strip = true;
    if (strip) {
      $el.remove();
      stats.scriptsStripped++;
    } else {
      stats.scriptsKept++;
    }
  });

  // 2. head hygiene
  $('link[rel="preconnect"], link[rel="dns-prefetch"]').each((_, el) => {
    const href = $(el).attr('href') || '';
    if (PRECONNECT_STRIP.some((h) => href.includes(h))) $(el).remove();
  });
  $('link[rel="preload"], link[rel="modulepreload"]').each((_, el) => {
    const href = $(el).attr('href') || '';
    if (href.includes('shopifycloud') || href.includes('web-pixels') || href.includes('shop.app')) $(el).remove();
  });
  $('#shopify-digital-wallet, meta[name="shopify-checkout-api-token"], #in-context-paypal-metadata').remove();
  $('link[type="application/json+oembed"]').remove();
  // Shopify "Follow on Shop" widget: service dies with the migration, strip element
  $('shop-follow-button').remove();
  // Static-site shims: (1) langify auto-redirects by browser language - it skips
  // paths in lyBlockedRoutesList, so blocking "/" disables redirects while
  // keeping the app's visuals; (2) langify cart-sync XHR/fetch to /cart.js and
  // /cart/update.js gets an empty-cart JSON stub instead of a 404.
  $('head').append(
    `<script data-sb-migration="static-shims">window.lyBlockedRoutesList=["/"];(function(){var RE=/(^|\\/)cart(\\.js|\\/update\\.js)($|\\?)/;var EMPTY='{"items":[],"item_count":0,"total_price":0,"currency":"EUR","attributes":{},"note":null}';var o=XMLHttpRequest.prototype.open,s=XMLHttpRequest.prototype.send;XMLHttpRequest.prototype.open=function(m,u){this._sbCart=RE.test(String(u));return o.apply(this,arguments)};XMLHttpRequest.prototype.send=function(){var x=this;if(x._sbCart){setTimeout(function(){try{Object.defineProperty(x,'status',{value:200});Object.defineProperty(x,'readyState',{value:4});Object.defineProperty(x,'responseText',{value:EMPTY});Object.defineProperty(x,'response',{value:EMPTY});}catch(e){}x.onreadystatechange&&x.onreadystatechange();x.onload&&x.onload()},0);return}return s.apply(this,arguments)};var f=window.fetch;window.fetch=function(u,opt){var url=typeof u==='string'?u:(u&&u.url)||'';if(RE.test(url)){return Promise.resolve(new Response(EMPTY,{status:200,headers:{'Content-Type':'application/json'}}))}return f.apply(this,arguments)};})();</script>\n`
  );

  // 3. replace accelerated checkout skeleton with a Buy-it-now button (wired
  // to the Lab401 checkout by /assets/sb-buy.js) + distributor legend
  $('div[data-shopify="payment-button"]').each((_, el) => {
    const label = BUY_LABEL[locale] || BUY_LABEL.en;
    const legend = STRINGS.buyLegend[locale] || STRINGS.buyLegend.en;
    $(el).html(
      `<button type="button" class="shopify-payment-button__button shopify-payment-button__button--unbranded" data-sb-migration="buy-now">${label}</button>`
    );
    $(el).after(
      `<p class="caption" data-sb-migration="buy-legend" style="margin: 0.9rem 0 0; text-align: center; opacity: 0.75;">${legend}</p>`
    );
    stats.buyButtons++;
  });

  // 4a. remove the country/region selector entirely (currency selection is
  // meaningless on a static site; per user decision 2026-07-14). Kills the
  // ~250-entry country list too (~100KB/page). The language selector stays.
  $('localization-form').each((_, el) => {
    const $el = $(el);
    if ($el.find('form[id*="CountryForm"], select[name="country_code"]').length) {
      $el.remove();
      stats.countrySelectorsRemoved = (stats.countrySelectorsRemoved || 0) + 1;
    }
  });
  $('noscript').each((_, el) => {
    const inner = $(el).html() || '';
    if (inner.includes('CountryFormNoScript') || inner.includes('country_code')) $(el).remove();
  });

  // 4b. neutralize forms
  $('form').each((_, el) => {
    const $el = $(el);
    const action = $el.attr('action') || '';
    const bare = action.replace(/^\/(fr|de|it|es)(?=\/)/, '');
    if (bare.startsWith('/cart/add')) {
      $el.attr('action', '#').attr('onsubmit', 'return false').attr('data-sb-migration', 'add-to-cart-form');
      stats.formsNeutralized++;
    } else if (bare === '/cart' || bare.startsWith('/cart?')) {
      $el.attr('action', '#').attr('onsubmit', 'return false').attr('data-sb-migration', 'cart-form');
      stats.formsNeutralized++;
    } else if (bare.startsWith('/search')) {
      $el.attr('action', '#').attr('onsubmit', 'return false').attr('data-sb-migration', 'search-form');
      stats.formsNeutralized++;
    } else if (bare.startsWith('/contact')) {
      // newsletter subscribes through Lab401.com's list (exclusive distributor);
      // same Shopify customer-form contract, tags matched to Lab401's segments
      $el
        .attr('action', 'https://lab401.com/contact#footer_newsletter_newsletter')
        .removeAttr('onsubmit')
        .attr('data-sb-migration', 'newsletter-form');
      $el.find('input[name="contact[tags]"]').attr('value', 'prospect, newsletter');
      const nl = STRINGS.newsletterLegend[locale] || STRINGS.newsletterLegend.en;
      $el.after(`<p class="caption" data-sb-migration="newsletter-legend" style="margin: 0.9rem 0 0; opacity: 0.75;">${nl}</p>`);
      stats.formsNeutralized++;
    } else if (bare.startsWith('/localization')) {
      const isLanguage = $el.find('a[data-value][hreflang]').length > 0;
      $el.attr('action', '#').attr('onsubmit', 'return false');
      if (isLanguage) {
        $el.attr('data-sb-migration', 'language-selector');
        $el.find('a[data-value][hreflang]').each((_, a) => {
          const target = $(a).attr('data-value');
          $(a).attr('href', localeHref(target, enPath));
        });
      } else {
        $el.attr('data-sb-migration', 'country-selector');
      }
      stats.formsNeutralized++;
    }
  });

  // 5. remove cart & login links entirely (per owner decision 2026-07-15 -
  // purchasing goes through Lab401, no cart/account on this site)
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const bare = href.replace(/^\/(fr|de|it|es)(?=\/|$)/, '');
    if (bare === '/cart' || bare.startsWith('/cart?') || bare.startsWith('/account') || href.includes('customer_authentication')) {
      $(el).remove();
    }
  });

  // 6. FAQ: distributor entry at the top of the "Purchasing" section (2nd h2)
  if (enPath === '/pages/faq') {
    const h2s = $('main .rte h2');
    if (h2s.length >= 2) {
      const q = STRINGS.faqQ[locale] || STRINGS.faqQ.en;
      const a = STRINGS.faqA[locale] || STRINGS.faqA.en;
      $(h2s[1]).after(`\n<h3 data-sb-migration="faq-distributor">${q}</h3>\n<p>${a}</p>`);
    } else {
      console.warn(`FAQ inject skipped for ${locale}: expected 2 h2 headings`);
    }
  }

  // 7. buy CTA wiring script
  $('head').append('<script src="/assets/sb-buy.js" defer></script>\n');

  const outFile = path.join(ROOT, 'scrape', 'clean', path.relative(path.join(ROOT, 'scrape', 'raw'), path.join(ROOT, entry.file)));
  await mkdir(path.dirname(outFile), { recursive: true });
  await writeFile(outFile, $.html(), 'utf8');
  report.push(stats);
}

await writeFile(
  path.join(ROOT, 'scrape', 'clean-report.json'),
  JSON.stringify({ pages: report, unmappedUrls: [...unmapped].sort() }, null, 2),
  'utf8'
);
const totals = report.reduce(
  (a, r) => ({ stripped: a.stripped + r.scriptsStripped, kept: a.kept + r.scriptsKept, forms: a.forms + r.formsNeutralized, buy: a.buy + r.buyButtons }),
  { stripped: 0, kept: 0, forms: 0, buy: 0 }
);
console.log(`Cleaned ${report.length} pages. Scripts stripped ${totals.stripped}, kept ${totals.kept}, forms neutralized ${totals.forms}, buy buttons ${totals.buy}. Unmapped URLs: ${unmapped.size}`);
