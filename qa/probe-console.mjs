// qa/probe-console.mjs
// Loads a list of pages on the local static replica and records:
//  - every console error/warning
//  - every failed network request (HTTP status >= 400, or request failed at network level)
// Favicon 404s are ignored.
import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:4322';
const PAGES = [
  '/',
  '/products/silver-bullet-2',
  '/products/spare-tips',
  '/pages/faq',
  '/pages/how-to-use-the-silver-bullet',
  '/blogs/news',
  '/fr/',
  '/de/products/silver-bullet-2',
  '/collections/frontpage',
  '/es/pages/faq',
];

const isFavicon = (url) => /favicon[^/]*\.(ico|png|svg)(\?|$)|\/favicon\.ico(\?|$)/i.test(url);

const results = [];

const browser = await chromium.launch();
const context = await browser.newContext();

for (const path of PAGES) {
  const page = await context.newPage();
  const entry = { page: path, consoleMessages: [], pageErrors: [], failedRequests: [] };

  page.on('console', (msg) => {
    const type = msg.type();
    if (type === 'error' || type === 'warning') {
      entry.consoleMessages.push({ type, text: msg.text(), location: msg.location() });
    }
  });

  page.on('pageerror', (err) => {
    entry.pageErrors.push({ type: 'pageerror', text: String(err) });
  });

  page.on('response', (resp) => {
    if (resp.status() >= 400 && !isFavicon(resp.url())) {
      entry.failedRequests.push({
        kind: 'http-error',
        status: resp.status(),
        url: resp.url(),
        resourceType: resp.request().resourceType(),
      });
    }
  });

  page.on('requestfailed', (req) => {
    if (isFavicon(req.url())) return;
    const failure = req.failure();
    // Ignore deliberate aborts by the page itself? No — record everything, note error text.
    entry.failedRequests.push({
      kind: 'request-failed',
      url: req.url(),
      resourceType: req.resourceType(),
      errorText: failure ? failure.errorText : 'unknown',
    });
  });

  try {
    const resp = await page.goto(BASE + path, { waitUntil: 'load', timeout: 30000 });
    entry.navStatus = resp ? resp.status() : null;
    // Give lazy scripts / deferred work a moment to run and log.
    await page.waitForTimeout(2500);
    // Nudge lazy-loaded content near the bottom of the page.
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1500);
  } catch (e) {
    entry.navError = String(e);
  }

  await page.close();
  results.push(entry);
}

await browser.close();

console.log(JSON.stringify(results, null, 2));
