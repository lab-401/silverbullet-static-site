// Generates a markdown twin for every page: dist/<path>/index.md
// Served by the Cloudflare worker when agents send Accept: text/markdown
// (the zone is on the Free plan, so CF's built-in Markdown for Agents is
// unavailable - we pre-generate better markdown from the clean content).
// Format mirrors CF's: YAML frontmatter, converted body, JSON-LD fenced.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { load } from 'cheerio';
import TurndownService from 'turndown';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const DIST = path.join(ROOT, 'dist');
const manifest = JSON.parse(await readFile(path.join(ROOT, 'scrape', 'pages-manifest.json'), 'utf8'));

const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-' });
td.remove(['script', 'style', 'noscript', 'svg', 'iframe', 'form', 'button', 'input', 'label', 'select', 'option']);
// srcset-heavy responsive images -> plain markdown image with alt + src
td.addRule('img', {
  filter: 'img',
  replacement: (_c, node) => {
    const alt = (node.getAttribute('alt') || '').trim();
    let src = node.getAttribute('src') || '';
    if (src.startsWith('//')) src = 'https:' + src;
    if (src.startsWith('/')) src = 'https://silverbullet.tools' + src;
    return src ? `![${alt}](${src})` : '';
  },
});

const yamlEsc = (s) => String(s).replace(/\s+/g, ' ').trim().replace(/"/g, '\\"');
let ok = 0;
for (const entry of manifest) {
  if (!entry.file) continue;
  const localizedPath = entry.locale === 'en' ? decodeURIComponent(entry.path) : `/${entry.locale}${entry.path === '/' ? '' : decodeURIComponent(entry.path)}`;
  const dir = path.join(DIST, ...localizedPath.split('/').filter(Boolean));
  let html;
  try {
    html = await readFile(path.join(dir, 'index.html'), 'utf8');
  } catch {
    continue;
  }
  const $ = load(html);
  const title = $('title').first().text().replace(/\s+/g, ' ').trim();
  const desc = $('meta[name="description"]').attr('content') || '';
  const canonical = $('link[rel="canonical"]').attr('href') || '';
  const lang = $('html').attr('lang') || 'en';
  const ld = $('main script[type="application/ld+json"], head script[type="application/ld+json"]')
    .map((_, el) => $(el).html())
    .get()
    .map((s) => {
      try {
        return JSON.stringify(JSON.parse(s), null, 2);
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  const mainHtml = $('main').html() || '';
  const body = td
    .turndown(mainHtml)
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const fm = [
    '---',
    `title: "${yamlEsc(title)}"`,
    desc ? `description: "${yamlEsc(desc)}"` : null,
    canonical ? `canonical: ${canonical}` : null,
    `language: ${lang}`,
    '---',
  ]
    .filter(Boolean)
    .join('\n');

  const ldBlock = ld.length ? '\n\n```json\n' + ld.join('\n') + '\n```\n' : '\n';
  await writeFile(path.join(dir, 'index.md'), `${fm}\n\n# ${title.split('–')[0].trim()}\n\n${body}${ldBlock}`, 'utf8');
  ok++;
}
console.log(`[gen-markdown] ${ok} markdown twins written to dist/`);
