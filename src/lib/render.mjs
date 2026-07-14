// Build-time render helpers for reconstructing per-page details
// that scripts/split.mjs normalized out of the shared parts.

const LOCALES = ['en', 'fr', 'de', 'it', 'es'];

// locale-equivalent URL of a page (path = locale-less path, e.g. "/pages/faq")
export function localeHref(targetLocale, path) {
  if (targetLocale === 'en') return path;
  return path === '/' ? `/${targetLocale}` : `/${targetLocale}${path}`;
}

// resolve %%LANG_HREF_xx%% tokens in shared parts
export function applyLangHrefs(html, path) {
  return html.replace(/%%LANG_HREF_([a-z]{2})%%/g, (_, lang) => localeHref(lang, path));
}

// Re-add active-state markers to nav anchors whose href is the current page.
// Matches the theme's original markup exactly: desktop header items get only
// aria-current="page"; mobile drawer items get the --active class + aria-current.
export function applyActiveNav(html, activeNav) {
  if (!activeNav?.length) return html;
  let out = html;
  for (const href of activeNav) {
    out = out.replace(
      new RegExp(`(<a\\b[^>]*?href="${escapeRe(href)}"[^>]*?class=")([^"]*(?:header__menu-item|menu-drawer__menu-item)[^"]*)("[^>]*?>)(\\s*<span)?`, 'g'),
      (m, pre, cls, post, span) => {
        const isDrawer = cls.includes('menu-drawer__menu-item');
        if (isDrawer && !cls.includes('menu-drawer__menu-item--active')) cls += ' menu-drawer__menu-item--active';
        if (!post.includes('aria-current')) post = post.replace(/^"/, '" aria-current="page"');
        // desktop header items carry the active marker on the inner <span>
        if (!isDrawer && span) span += ' class="header__active-menu-item"';
        return pre + cls + post + (span || '');
      }
    );
  }
  return out;
}

// "<html class="no-js" lang="en">" -> { class: "no-js", lang: "en" }
export function parseTagAttrs(tag) {
  const attrs = {};
  const re = /([a-zA-Z-:@.]+)(?:="([^"]*)")?/g;
  const inner = tag.replace(/^<[a-zA-Z0-9-]+\s*/, '').replace(/>$/, '');
  let m;
  while ((m = re.exec(inner))) attrs[m[1]] = m[2] ?? '';
  return attrs;
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export { LOCALES };
