// Loads the scraped page records and HTML partials produced by scripts/split.mjs.
const metaModules = import.meta.glob('../scraped/**/meta.json', { eager: true });
const htmlModules = import.meta.glob('../scraped/**/*.html', { query: '?raw', import: 'default', eager: true });

export const pages = Object.entries(metaModules).map(([key, mod]) => {
  const record = mod.default ?? mod;
  const dir = key.replace(/\/meta\.json$/, '');
  return { ...record, mainHtml: htmlModules[`${dir}/main.html`] };
});

export function sharedPart(locale, file) {
  return htmlModules[`../scraped/${locale}/_shared/${file}`];
}
