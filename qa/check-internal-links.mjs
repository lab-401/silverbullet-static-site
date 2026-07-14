#!/usr/bin/env node
/**
 * QA: scan every HTML file in dist/ for root-relative internal references
 * (href/src/srcset/poster/content attributes starting with "/") and verify
 * each target exists in dist (file, or directory containing index.html).
 * Also lists any remaining absolute URLs pointing at Shopify infrastructure
 * (cdn.shopify.com, shopifycdn, monorail, shop.app), classified by whether
 * they sit inside JSON-LD <script> blocks or HTML comments.
 *
 * Usage: node qa/check-internal-links.mjs [distDir]
 * Output: JSON report on stdout.
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, resolve, dirname, sep } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(process.argv[2] || join(__dirname, "..", "dist"));

// ---------- collect HTML files ----------
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.html?$/i.test(name)) out.push(p);
  }
  return out;
}
const htmlFiles = walk(DIST);
const relOf = (p) => p.slice(DIST.length + 1).split(sep).join("/");

// ---------- extraction ----------
const ATTR_RE = /\b(href|src|srcset|poster|content)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;

function splitSrcset(value) {
  // srcset = comma separated "<url> [descriptor]" candidates
  return value
    .split(",")
    .map((c) => c.trim().split(/\s+/)[0])
    .filter(Boolean);
}

// url -> { count, pages:Set, attrs:Set }
const refs = new Map();

function addRef(url, page, attr) {
  let r = refs.get(url);
  if (!r) refs.set(url, (r = { count: 0, pages: new Set(), attrs: new Set() }));
  r.count++;
  r.pages.add(page);
  r.attrs.add(attr);
}

// Shopify-infra domain mentions (URLs or bare hostnames, incl. JSON-escaped \/)
const SHOPIFY_RE =
  /(?:(?:https?:)?(?:\\?\/){2})?[a-z0-9.-]*(?:cdn\.shopify\.com|shopifycdn\.(?:com|net)|monorail[a-z0-9.-]*|shop\.app)(?:(?:\\?\/)[^\s"'<>\\]*)*/gi;
const shopifyHits = new Map(); // snippet -> { count, pages:Set, contexts:Set, sample }

function contextRanges(html) {
  const ranges = [];
  const push = (re, label) => {
    let m;
    while ((m = re.exec(html)) !== null) ranges.push([m.index, m.index + m[0].length, label]);
  };
  push(/<!--[\s\S]*?-->/g, "comment");
  push(/<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi, "json-ld");
  push(/<script(?![^>]*application\/ld\+json)[^>]*>[\s\S]*?<\/script>/gi, "inline-script");
  return ranges;
}
const contextOf = (idx, ranges) => {
  // json-ld/comment win over the generic script range
  let found = "markup";
  for (const [a, b, label] of ranges)
    if (idx >= a && idx < b) {
      if (label !== "inline-script") return label;
      found = "inline-script";
    }
  return found;
};

for (const file of htmlFiles) {
  const page = relOf(file);
  const html = readFileSync(file, "utf8");

  // 1) root-relative attribute URLs
  let m;
  ATTR_RE.lastIndex = 0;
  while ((m = ATTR_RE.exec(html)) !== null) {
    const attr = m[1].toLowerCase();
    const raw = m[2] ?? m[3] ?? "";
    const candidates = attr === "srcset" ? splitSrcset(raw) : [raw.trim()];
    for (const c of candidates) {
      if (c === "#") continue; // intentional data-sb-migration placeholder
      if (!c.startsWith("/")) continue; // only root-relative
      if (c.startsWith("//")) continue; // protocol-relative external
      addRef(c, page, attr);
    }
  }

  // 2) leftover Shopify infra domain mentions
  const ranges = contextRanges(html);
  SHOPIFY_RE.lastIndex = 0;
  while ((m = SHOPIFY_RE.exec(html)) !== null) {
    const key = m[0].replace(/\\\//g, "/"); // normalize JSON-escaped slashes
    let h = shopifyHits.get(key);
    if (!h)
      shopifyHits.set(
        key,
        (h = {
          count: 0,
          pages: new Set(),
          contexts: new Set(),
          sample: html
            .slice(Math.max(0, m.index - 60), m.index + m[0].length + 40)
            .replace(/\s+/g, " ")
            .trim(),
        })
      );
    h.count++;
    h.pages.add(page);
    h.contexts.add(contextOf(m.index, ranges));
  }
}

// ---------- resolve each unique URL against dist ----------
function targetExists(url) {
  // strip query + fragment
  let path = url.split("#")[0].split("?")[0];
  if (path === "" || path === "/") path = "/";
  let decoded;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    return { exists: false, resolved: null, note: "malformed percent-encoding" };
  }
  const segs = decoded.split("/").filter(Boolean);
  // reject traversal or invalid Windows chars
  if (segs.some((s) => s === ".." || /[<>:"|*]/.test(s)))
    return { exists: false, resolved: null, note: "invalid path segment" };
  const fsPath = join(DIST, ...segs);
  try {
    if (existsSync(fsPath)) {
      const st = statSync(fsPath);
      if (st.isFile()) return { exists: true, resolved: relOf(fsPath) };
      if (st.isDirectory()) {
        const idx = join(fsPath, "index.html");
        if (existsSync(idx)) return { exists: true, resolved: relOf(idx) };
        return { exists: false, resolved: null, note: "directory without index.html" };
      }
    }
    // static-host leniency: /foo may be served from foo.html
    const htmlAlt = fsPath + ".html";
    if (existsSync(htmlAlt) && statSync(htmlAlt).isFile())
      return { exists: true, resolved: relOf(htmlAlt), note: "resolved via .html extension" };
  } catch {
    /* fall through */
  }
  return { exists: false, resolved: null };
}

const missing = [];
let okCount = 0;
for (const [url, r] of refs) {
  const res = targetExists(url);
  if (res.exists) {
    okCount++;
  } else {
    missing.push({
      url,
      note: res.note || "target not found in dist",
      attrs: [...r.attrs].sort(),
      referenceCount: r.count,
      referencingPages: r.pages.size,
      examplePages: [...r.pages].slice(0, 2),
    });
  }
}
missing.sort((a, b) => b.referencingPages - a.referencingPages || a.url.localeCompare(b.url));

const shopify = [...shopifyHits.entries()].map(([url, h]) => ({
  url,
  count: h.count,
  pages: h.pages.size,
  contexts: [...h.contexts].sort(),
  sample: h.sample,
  examplePages: [...h.pages].slice(0, 2),
}));
shopify.sort((a, b) => b.pages - a.pages || a.url.localeCompare(b.url));

const report = {
  distDir: DIST,
  htmlFilesScanned: htmlFiles.length,
  uniqueInternalUrls: refs.size,
  resolvedOk: okCount,
  missing,
  shopifyUrls: shopify,
};

console.log(JSON.stringify(report, null, 2));
process.exitCode = missing.length ? 1 : 0;
