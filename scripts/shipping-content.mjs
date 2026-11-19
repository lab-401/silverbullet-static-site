// Content policy shared by the scrape pipeline and feed importer.
// Remove the whole promotion (including its icon), while retaining other benefits.
import { load } from 'cheerio';

const SPACE = String.raw`(?:\s|&(?:amp;)?nbsp;|&#(?:160|x[aA]0);)`;
const CLAIM = [
  `Free${SPACE}+(?:world[ -]?wide${SPACE}+)?(?:shipping|delivery)`,
  `(?:Livraison|Expédition)${SPACE}+gratuite(?:${SPACE}+dans le monde entier)?`,
  `Kostenlose[rn]?${SPACE}+(?:weltweiter${SPACE}+)?(?:Versand|Lieferung)`,
  `(?:Spedizione|Consegna)${SPACE}+gratuita(?:${SPACE}+in tutto il mondo)?`,
  `Envío${SPACE}+gratuito(?:${SPACE}+a todo el mundo)?`,
].join('|');
const CLAIM_RE = new RegExp(CLAIM, 'iu');
const DETAILS = [
  'Rapid and tracked',
  'Rapide et (?:avec )?suivi',
  'Schnell und (?:mit Sendungsverfolgung|nachverfolgt)',
  'Rapid[ao] e (?:tracciat[ao]|tracciabile)',
  'Rápido y con seguimiento',
].join('|');
const PROMOTION_RE = new RegExp(
  `[ \\t\\u00a0]*(?:📦${SPACE}*)?(?:${CLAIM})(?:${SPACE}*:${SPACE}*(?:${DETAILS})\\.?)?`,
  'giu'
);

export function removeShippingText(text) {
  if (!CLAIM_RE.test(text)) return text;
  // Keep the warranty sentence grammatical in each language.
  return text
    .replace(/Free Shipping from Europe and a lifetime warranty\./gi, 'Lifetime warranty.')
    .replace(/Livraison gratuite depuis l'Europe et garantie à vie\./gi, 'Garantie à vie.')
    .replace(/Kostenloser Versand aus Europa und eine lebenslange Garantie\./gi, 'Lebenslange Garantie.')
    .replace(/Spedizione gratuita dall'Europa e garanzia a vita\./gi, 'Garanzia a vita.')
    .replace(/Envío gratuito desde Europa y garantía de por vida\./gi, 'Garantía de por vida.')
    .replace(PROMOTION_RE, '');
}

// Replace only affected string literals, preserving the original JSON formatting.
export function removeShippingJson(json) {
  return json.replace(/"(?:[^"\\]|\\.)*"/g, (literal) => {
    const text = JSON.parse(literal);
    const cleaned = removeShippingText(text);
    return cleaned === text ? literal : JSON.stringify(cleaned);
  });
}

export function removeShippingHtml(html) {
  const $ = load(html, { sourceCodeLocationInfo: true }, false);
  const removals = [];
  $('li').each((_, el) => {
    // Only remove the individual benefit, never a containing list or section.
    if ($(el).find('li').length || !CLAIM_RE.test($(el).text())) return;
    const { startOffset, endOffset } = el.sourceCodeLocation;
    removals.push({ startOffset, endOffset });
  });
  // Source offsets avoid reserializing (and reformatting) unrelated HTML.
  for (const { startOffset, endOffset } of removals.sort((a, b) => b.startOffset - a.startOffset)) {
    html = html.slice(0, startOffset) + html.slice(endOffset);
  }
  html = html.replace(
    /(<script\b[^>]*\btype=["']application\/(?:ld\+)?json["'][^>]*>)([\s\S]*?)(<\/script>)/gi,
    (_, open, json, close) => open + removeShippingJson(json) + close
  );
  return removeShippingText(html);
}

export function removeShippingFeed(xml) {
  // Shopify embeds its product descriptions as HTML in Atom CDATA sections.
  return xml.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_, html) => `<![CDATA[${removeShippingHtml(html)}]]>`);
}
