export const meta = {
  name: 'silverbullet-qa',
  description: 'Multi-agent QA: visual diffs, runtime behavior, links, SEO, agent-discoverability',
  phases: [
    { title: 'Triage', detail: 'read visual-report.json, pick pairs to review' },
    { title: 'Visual review', detail: 'one agent per diff pair' },
    { title: 'Runtime QA', detail: 'console errors, links, interactions, staging' },
    { title: 'SEO audit', detail: 'heads, schema, sitemap/robots/agents.md' },
    { title: 'Synthesis', detail: 'consolidated QA report' },
  ],
};

const ROOT = args.root;
const SHOTS = `${ROOT}\\qa\\screenshots`;

const PAIRS_SCHEMA = {
  type: 'object',
  properties: {
    pairs: {
      type: 'array',
      items: {
        type: 'object',
        properties: { pair: { type: 'string' }, mismatchPct: { type: 'number' } },
        required: ['pair', 'mismatchPct'],
      },
    },
  },
  required: ['pairs'],
};

const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    pair: { type: 'string' },
    classification: { type: 'string', enum: ['expected-delta', 'replica-defect', 'screenshot-noise', 'live-site-dynamic'] },
    description: { type: 'string' },
    rootCauseHint: { type: 'string' },
    severity: { type: 'string', enum: ['none', 'low', 'medium', 'high'] },
  },
  required: ['pair', 'classification', 'description', 'severity'],
};

const FINDINGS_SCHEMA = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          detail: { type: 'string' },
          severity: { type: 'string', enum: ['info', 'low', 'medium', 'high'] },
          fixSuggestion: { type: 'string' },
        },
        required: ['title', 'detail', 'severity'],
      },
    },
  },
  required: ['findings'],
};

phase('Triage');
const triage = await agent(
  `Read the file ${ROOT}\\qa\\visual-report.json (JSON array of {pair, mismatchPct, heightDelta, error}).
Return the pairs that need human-level review: every entry with an error, plus every entry with mismatchPct > 0.25.
Cap at 30 pairs, keeping the worst by mismatchPct; if you cap, prefer covering distinct pages over duplicate viewports of the same page.
Return only via structured output.`,
  { label: 'triage-visual-report', schema: PAIRS_SCHEMA, effort: 'low' }
);
log(`Reviewing ${triage.pairs.length} visual pairs`);

phase('Visual review');
const CONTEXT = `Context: this is a static replica (Astro) of the Shopify site silverbullet.tools.
Known INTENTIONAL deltas (classify as expected-delta):
- The Shop Pay purple accelerated-checkout "Buy with ShopPay" button on the live site is replaced by a plain dark "Buy it now" button in the replica.
- The "Follow on Shop" purple widget in the live footer is removed in the replica.
- Cookie/consent banners on the live site do not exist in the replica.
Live-site dynamics (classify live-site-dynamic): rotating testimonials/announcements captured at different states, ad-hoc sale popups.
Screenshot noise: partially-loaded lazy images, font rendering AA, scrollbar overlays.
Everything else that visibly differs (layout shifts, missing images, missing sections, broken styles, wrong fonts, missing buttons) is a replica-defect.`;

const reviews = (
  await parallel(
    triage.pairs.map((p) => () => {
      const f = p.pair;
      return agent(
        `${CONTEXT}

Compare these two full-page screenshots and their pixel-diff:
- live site:  ${SHOTS}\\live\\${f}
- replica:    ${SHOTS}\\local\\${f}
- diff mask:  ${SHOTS}\\diff\\${f} (may not exist if below diff threshold)
Read the images with the Read tool. The mismatch was ${p.mismatchPct}%.
Long pages: the diff mask shows WHERE differences are - focus your reading there.
Classify the difference, describe exactly what visibly differs and where (section, element), and if replica-defect give a root-cause hint (e.g. "hero image missing -> check asset mapping for X").
Return only structured output.`,
        { label: `visual:${f.slice(0, 40)}`, phase: 'Visual review', schema: REVIEW_SCHEMA }
      ).then((r) => r && { ...r, mismatchPct: p.mismatchPct });
    })
  )
).filter(Boolean);

phase('Runtime QA');
const runtimeAgents = [
  {
    key: 'console-errors',
    prompt: `Working dir: ${ROOT}. A static replica of silverbullet.tools is served at http://127.0.0.1:4322 (astro preview, already running).
Write and run a Node script (playwright is installed in the project; use it from ${ROOT}) that loads these pages: /, /products/silver-bullet-2, /products/spare-tips, /pages/faq, /pages/how-to-use-the-silver-bullet, /blogs/news, /fr/, /de/products/silver-bullet-2, /collections/frontpage, /es/pages/faq
and records every console error/warning and every failed network request (status >= 400 or request-failed). Ignore favicon 404s.
Save your script under ${ROOT}\\qa\\ (e.g. qa\\probe-console.mjs). Report findings via structured output: one finding per distinct error with the pages it occurs on.`,
  },
  {
    key: 'links',
    prompt: `Working dir: ${ROOT}. Write and run a Node script (save under ${ROOT}\\qa\\) that scans every HTML file in ${ROOT}\\dist for internal references: href/src/srcset/poster/content attribute URLs that start with "/" (root-relative). For each unique URL, verify the target exists in dist (file, or directory with index.html; for /assets/x check dist/assets/x; URL-decode percent-encoding; strip query strings and #fragments).
Report each MISSING target as a finding (with count of referencing pages and 2 example pages). Links intentionally dead: href="#" placeholders (data-sb-migration) - ignore plain "#".
Also list (as info) any remaining absolute URLs pointing to cdn.shopify.com, shopifycdn, monorail, shop.app in dist HTML - there should be none outside JSON-LD/comments.`,
  },
  {
    key: 'interactions',
    prompt: `Working dir: ${ROOT}. The static replica runs at http://127.0.0.1:4322; the original live site is https://silverbullet.tools.
Using playwright (installed in ${ROOT}; headless), verify these interactions work on the REPLICA and match the live site's behavior:
1. Desktop (1440px): open the header search modal (magnifier icon); open a nav dropdown if any; footer language selector opens and its links point to locale-equivalent pages (e.g. Français on /pages/faq -> /fr/pages/faq).
2. Product page /products/silver-bullet-2: image gallery thumbnails switch the main image; image zoom/modal opens; "Buy it now" placeholder button exists (data-sb-migration="buy-now"); quantity +/- buttons work.
3. Mobile (390px): hamburger menu drawer opens and nav links are present.
4. Homepage: sliders/carousels (testimonials) can be advanced with their arrow buttons.
Write your probe script(s) under ${ROOT}\\qa\\. Report each broken or behavior-divergent interaction as a finding (severity medium/high), and confirm working ones as info findings.`,
  },
  {
    key: 'staging',
    prompt: `The GitHub Pages staging deploy is at https://lab-401.github.io/silverbullet-static-site/ (note the /silverbullet-static-site/ base path; built from an older commit without sitemap/robots - do NOT report their absence).
Using playwright from ${ROOT} (or WebFetch), load the staging homepage, /silverbullet-static-site/products/silver-bullet-2/ and /silverbullet-static-site/fr/ and check: pages render styled (CSS loads), images load (no 404s in network log), internal nav links carry the /silverbullet-static-site/ prefix, hreflang/canonical tags point to https://silverbullet.tools (canonical policy) and a noindex robots meta is present (staging).
Report base-path or asset-loading defects as findings (high severity), plus info confirmations.`,
  },
];

phase('SEO audit');
const seoAgents = [
  {
    key: 'heads-schema',
    prompt: `Working dir: ${ROOT}. Audit the built pages in ${ROOT}\\dist (root-base build for the final domain https://silverbullet.tools).
Sample at least: index.html, products/silver-bullet-2, products/spare-tips, pages/faq, blogs/news, one blog post, fr/index.html, de/products/silver-bullet-2, es/pages/faq.
Check per page: exactly one <title>; meta description present; canonical URL points to https://silverbullet.tools + correct path; hreflang set complete (en/fr/de/it/es + x-default) and consistent; og:title/og:description/og:image present with ABSOLUTE og:image URLs that resolve to files under dist/assets; twitter card meta; JSON-LD blocks parse as valid JSON and Product schema on product pages has name/price/priceCurrency/availability/sku and image URLs that are absolute and resolve under dist/assets; exactly one h1 per page; html lang attribute matches the locale.
Report every violation as a finding with page + exact issue. Confirmations as info.`,
  },
  {
    key: 'seo-files',
    prompt: `Working dir: ${ROOT}. Audit these generated files in ${ROOT}\\dist: sitemap.xml, robots.txt, agents.md, llms.txt.
Check: sitemap lists all 110 pages with correct absolute URLs (https://silverbullet.tools/...) and valid xhtml:link hreflang alternates (well-formed XML - validate by parsing); robots.txt allows crawling and references the sitemap (this dist was built WITHOUT STAGING so it must be the allow variant); every URL mentioned in agents.md and llms.txt resolves to a real page in dist (map URL path -> dist folder); factual claims in agents.md/llms.txt match actual page content (spot-check the €600 price and product names against dist product pages' JSON-LD).
Report discrepancies as findings; confirmations as info.`,
  },
  {
    key: 'ai-discoverability',
    prompt: `Working dir: ${ROOT}. Evaluate how well an AI agent (shopping assistant, search crawler LLM) could understand and use the static site in ${ROOT}\\dist. Read dist/agents.md, dist/llms.txt, and 2-3 key pages' HTML (index.html, products/silver-bullet-2/index.html).
Assess: is the product's purpose, price, and buying path clear from machine-readable surfaces (JSON-LD, agents.md, llms.txt)? Are the data-sb-migration="buy-now" placeholders documented anywhere an agent would look? Is there anything in the HTML that still tells agents to use Shopify endpoints (stale references to /cart, /api, UCP, shop.app) that would mislead them?
Suggest concrete improvements (severity low/medium) - e.g. wording for agents.md, extra JSON-LD fields, sameAs links. Do not modify files; report findings only.`,
  },
];

const [runtimeResults, seoResults] = await Promise.all([
  parallel(
    runtimeAgents.map((a) => () =>
      agent(a.prompt + '\n\nReturn only structured output.', { label: `runtime:${a.key}`, phase: 'Runtime QA', schema: FINDINGS_SCHEMA }).then(
        (r) => r && { key: a.key, ...r }
      )
    )
  ),
  parallel(
    seoAgents.map((a) => () =>
      agent(a.prompt + '\n\nReturn only structured output.', { label: `seo:${a.key}`, phase: 'SEO audit', schema: FINDINGS_SCHEMA }).then(
        (r) => r && { key: a.key, ...r }
      )
    )
  ),
]);

phase('Synthesis');
const all = {
  visual: reviews,
  runtime: runtimeResults.filter(Boolean),
  seo: seoResults.filter(Boolean),
};
const synthesis = await agent(
  `You are consolidating QA results for the static replica of silverbullet.tools (repo at ${ROOT}).
Here are all findings as JSON:
${JSON.stringify(all).slice(0, 180000)}

Write a prioritized report to ${ROOT}\\qa\\QA-REPORT.md with sections:
1. Verdict summary (counts by severity, overall assessment)
2. Defects to fix (deduplicated, prioritized: severity high->low; each with root cause and concrete fix location - which script/source file in the pipeline: scripts/clean.mjs, scripts/split.mjs, src/pages/[...slug].astro, scripts/gen-seo-files.mjs, public/assets, etc.)
3. Expected/accepted deltas (buy button, follow-on-shop, cookie banner, live-site dynamics)
4. Info confirmations (what verifiably works)
Then return via final text a SHORT summary: top defects needing fixes (max 10 bullet lines).`,
  { label: 'synthesize-qa-report' }
);
return { synthesis, counts: { visual: reviews.length, runtime: all.runtime.length, seo: all.seo.length } };
