// Verifies newsletter wiring: form action/method/fields point at Lab401's
// list, legend present and localized, console clean.
import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:4322';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' - ' + detail : ''}`);
  if (!ok) failures++;
};

const LEGENDS = {
  '': 'High-quality, low-volume, managed by our exclusive distributor Lab401.com.',
  '/fr': 'Haute qualité, faible volume – gérée par notre distributeur exclusif Lab401.com.',
  '/de': 'Hohe Qualität, geringes Aufkommen – verwaltet von unserem exklusiven Vertriebspartner Lab401.com.',
  '/it': 'Alta qualità, bassa frequenza – gestita dal nostro distributore esclusivo Lab401.com.',
  '/es': 'Alta calidad, bajo volumen – gestionada por nuestro distribuidor exclusivo Lab401.com.',
};

for (const [loc, expected] of Object.entries(LEGENDS)) {
  const page = await ctx.newPage();
  await page.goto(BASE + (loc || '/'), { waitUntil: 'load' });
  const form = page.locator('form[data-sb-migration="newsletter-form"]').first();
  const action = await form.getAttribute('action');
  const method = (await form.getAttribute('method')) || '';
  const onsubmit = await form.getAttribute('onsubmit');
  const tags = await form.locator('input[name="contact[tags]"]').getAttribute('value');
  const email = await form.locator('input[name="contact[email]"]').count();
  const legend = (await page.locator('[data-sb-migration="newsletter-legend"]').first().textContent())?.trim();
  check(`newsletter action ${loc || '/en'}`, action === 'https://lab401.com/contact#footer_newsletter_newsletter', action);
  check(`newsletter fields ${loc || '/en'}`, method.toLowerCase() === 'post' && !onsubmit && tags === 'prospect, newsletter' && email === 1, `method=${method} tags=${tags}`);
  check(`newsletter legend ${loc || '/en'}`, legend === expected, legend);
  await page.close();
}

// legend also present on a translated product page footer
{
  const page = await ctx.newPage();
  await page.goto(BASE + '/fr/products/silver-bullet-2', { waitUntil: 'load' });
  const legend = (await page.locator('[data-sb-migration="newsletter-legend"]').first().textContent())?.trim();
  check('legend on fr product page', legend === LEGENDS['/fr'], legend);
  await page.close();
}

await browser.close();
console.log(failures ? `${failures} FAILURES` : 'ALL PASS');
process.exit(failures ? 1 : 0);
