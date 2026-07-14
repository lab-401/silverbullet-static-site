// Patches copied theme assets for static hosting. Idempotent; patches both
// scrape/assets (source of truth) and public/assets (build input).
//
// localization-form.<hash>.js: Dawn's LocalizationForm submits a POST to
// Shopify's /localization endpoint on item click. Statically, a programmatic
// form.submit() would POST to the page URL (405 on GitHub Pages). Replace it
// with plain navigation via the anchor's href (the cleaner rewrites language
// links to locale-equivalent URLs; country links stay href="#" and become
// inert). The dropdown open/close logic in the same file is kept as-is.
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

// minified theme: ...input.value=event.currentTarget.dataset.value,form&&form.submit()}
// replacement must be a single expression (comma-operator position)
const SUBMIT_CALL = /form\s*&&\s*form\.submit\(\)/;
const REPLACEMENT =
  '(function(a){var h=a.getAttribute&&a.getAttribute("href");h&&h!=="#"&&(window.location.href=h)})(event.currentTarget)/* static-site patch: was form.submit() */';

let patched = 0;
for (const dir of ['scrape/assets', 'public/assets', 'dist/assets']) {
  const full = path.join(ROOT, dir);
  let files;
  try {
    files = await readdir(full);
  } catch {
    continue;
  }
  for (const f of files.filter((f) => f.startsWith('localization-form.') && f.endsWith('.js'))) {
    const p = path.join(full, f);
    const src = await readFile(p, 'utf8');
    if (src.includes('static-site patch')) continue; // already patched
    if (!SUBMIT_CALL.test(src)) {
      console.log(`WARN ${dir}/${f}: form.submit() pattern not found`);
      continue;
    }
    await writeFile(p, src.replace(SUBMIT_CALL, REPLACEMENT), 'utf8');
    patched++;
    console.log(`patched ${dir}/${f}`);
  }
}
console.log(`Done, ${patched} file(s) patched.`);
