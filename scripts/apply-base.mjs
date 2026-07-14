// Post-build: when BASE_PATH != '/', prefix root-absolute internal URLs in dist/
// so the site works on a GitHub Pages project subpath. No-op at domain root.
// Rewrites href/src/srcset/poster/content/action attributes and url(/...) in
// inline CSS, skipping URLs that already carry the base and protocol/anchor refs.
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const base = (process.env.BASE_PATH || '/').replace(/\/$/, '');
if (!base) {
  console.log('[apply-base] BASE_PATH is /, nothing to rewrite.');
  process.exit(0);
}

const DIST = new URL('../dist', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

async function* walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else yield p;
  }
}

const prefix = (u) => (u.startsWith(base + '/') || u === base ? u : base + u);

let count = 0;
for await (const file of walk(DIST)) {
  const ext = path.extname(file);
  if (!['.html', '.css', '.xml', '.txt', '.js', '.webmanifest', '.json'].includes(ext)) continue;
  let text = await readFile(file, 'utf8');
  const before = text;

  if (ext === '.html') {
    // attributes with a single root-absolute URL
    text = text.replace(
      /(\s(?:href|src|poster|action|data-src|content)=")(\/(?!\/)[^"]*)(")/g,
      (_, a, u, z) => a + prefix(u) + z
    );
    // srcset / data-srcset: comma-separated candidates
    text = text.replace(/(\s(?:srcset|data-srcset)=")([^"]+)(")/g, (_, a, v, z) => {
      const out = v
        .split(',')
        .map((c) => c.trim().replace(/^(\/(?!\/)\S*)/, (u) => prefix(u)))
        .join(', ');
      return a + out + z;
    });
    // inline css url(/...)
    text = text.replace(/url\((['"]?)(\/(?!\/)[^'")]+)\1\)/g, (_, q, u) => `url(${q}${prefix(u)}${q})`);
  } else if (ext === '.css') {
    text = text.replace(/url\((['"]?)(\/(?!\/)[^'")]+)\1\)/g, (_, q, u) => `url(${q}${prefix(u)}${q})`);
  }

  if (text !== before) {
    await writeFile(file, text, 'utf8');
    count++;
  }
}
console.log(`[apply-base] Rewrote root-absolute URLs with base "${base}" in ${count} files.`);
