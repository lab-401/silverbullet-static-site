// Pixel-compares qa/screenshots/live vs qa/screenshots/local pairs.
// Output: qa/screenshots/diff/*.png + qa/visual-report.json ranked by mismatch.
import { mkdir, readdir, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const LIVE = path.join(ROOT, 'qa', 'screenshots', 'live');
const LOCAL = path.join(ROOT, 'qa', 'screenshots', 'local');
const DIFF = path.join(ROOT, 'qa', 'screenshots', 'diff');
// stale masks from earlier runs mislead triage - start clean
await rm(DIFF, { recursive: true, force: true });
await mkdir(DIFF, { recursive: true });

function pad(png, w, h) {
  if (png.width === w && png.height === h) return png;
  const out = new PNG({ width: w, height: h, fill: true });
  PNG.bitblt(png, out, 0, 0, png.width, png.height, 0, 0);
  return out;
}

const liveFiles = (await readdir(LIVE)).filter((f) => f.endsWith('.png'));
const results = [];
for (const f of liveFiles) {
  try {
    const a = PNG.sync.read(await readFile(path.join(LIVE, f)));
    let b;
    try {
      b = PNG.sync.read(await readFile(path.join(LOCAL, f)));
    } catch {
      results.push({ pair: f, error: 'missing local shot' });
      continue;
    }
    const w = Math.max(a.width, b.width);
    const h = Math.max(a.height, b.height);
    const A = pad(a, w, h);
    const B = pad(b, w, h);
    const d = new PNG({ width: w, height: h });
    const bad = pixelmatch(A.data, B.data, d.data, w, h, { threshold: 0.15, includeAA: false });
    const pct = (100 * bad) / (w * h);
    if (pct > 0.05) await writeFile(path.join(DIFF, f), PNG.sync.write(d));
    results.push({
      pair: f,
      mismatchPct: +pct.toFixed(3),
      badPixels: bad,
      dims: { live: [a.width, a.height], local: [b.width, b.height] },
      heightDelta: b.height - a.height,
    });
  } catch (e) {
    results.push({ pair: f, error: String(e).slice(0, 200) });
  }
}
results.sort((x, y) => (y.mismatchPct ?? 999) - (x.mismatchPct ?? 999));
await writeFile(path.join(ROOT, 'qa', 'visual-report.json'), JSON.stringify(results, null, 2), 'utf8');
const worst = results.slice(0, 15);
console.log('Worst pairs:');
for (const r of worst) console.log(`  ${r.pair}: ${r.error ?? r.mismatchPct + '% (heightΔ ' + r.heightDelta + 'px)'}`);
const clean = results.filter((r) => !r.error && r.mismatchPct < 0.5).length;
console.log(`${clean}/${results.length} pairs under 0.5% mismatch`);
