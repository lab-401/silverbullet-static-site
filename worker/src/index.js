// Agent-readiness edge worker for silverbullet.tools (origin: GitHub Pages).
// 1. RFC 8288 Link headers on HTML responses (agent discovery).
// 2. Correct media type for /.well-known/api-catalog (RFC 9727 linkset).
// 3. Markdown content negotiation: Accept: text/markdown serves the
//    build-time markdown twin (dist/<path>/index.md) with x-markdown-tokens.
//    (Zone is on the Free plan; CF's built-in Markdown for Agents needs Pro.)

const LINK_HEADER = [
  '</.well-known/api-catalog>; rel="api-catalog"; type="application/linkset+json"',
  '</agents.md>; rel="service-doc"; type="text/markdown"; title="Agent guide"',
  '</llms.txt>; rel="describedby"; type="text/markdown"; title="LLM index"',
  '</sitemap.xml>; rel="describedby"; type="application/xml"',
].join(', ');

// paths that have HTML pages (and therefore markdown twins)
function isPagePath(p) {
  return !/\.[a-z0-9]{2,12}$/i.test(p) && !p.startsWith('/.well-known/');
}

function mdPathFor(p) {
  const clean = p.replace(/\/$/, '');
  return (clean || '') + '/index.md';
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const accept = request.headers.get('accept') || '';

    // markdown negotiation for page URLs (GET and HEAD)
    if ((request.method === 'GET' || request.method === 'HEAD') && /\btext\/markdown\b/i.test(accept) && isPagePath(url.pathname)) {
      const mdUrl = new URL(url);
      mdUrl.pathname = mdPathFor(url.pathname);
      const mdResp = await fetch(mdUrl.toString(), { headers: { 'user-agent': request.headers.get('user-agent') || 'sb-edge' } });
      if (mdResp.ok) {
        const body = await mdResp.text();
        const h = new Headers();
        h.set('content-type', 'text/markdown; charset=utf-8');
        h.set('x-markdown-tokens', String(Math.ceil(body.length / 4)));
        h.set('vary', 'Accept');
        h.set('link', LINK_HEADER);
        h.set('cache-control', 'public, max-age=600');
        return new Response(request.method === 'HEAD' ? null : body, { status: 200, headers: h });
      }
      // fall through to HTML if no twin exists
    }

    const resp = await fetch(request);
    const ct = resp.headers.get('content-type') || '';
    const needsLink = ct.includes('text/html');
    const isCatalog = url.pathname === '/.well-known/api-catalog';
    if (!needsLink && !isCatalog) return resp;

    const h = new Headers(resp.headers);
    if (needsLink) {
      h.set('link', LINK_HEADER);
      h.append('vary', 'Accept');
    }
    if (isCatalog) h.set('content-type', 'application/linkset+json');
    return new Response(resp.body, { status: resp.status, statusText: resp.statusText, headers: h });
  },
};
