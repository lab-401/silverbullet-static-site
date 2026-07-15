// Site strings injected by clean.mjs, in all 5 locales.
// Also seeded into translate-products.mjs's glossary so the machine-translated
// product pages use these exact renderings.
export const STRINGS = {
  buyLegend: {
    en: 'Purchases are through our trusted distributor, Lab401.com.',
    fr: 'Les achats s’effectuent via notre distributeur de confiance, Lab401.com.',
    de: 'Der Kauf erfolgt über unseren vertrauenswürdigen Vertriebspartner Lab401.com.',
    it: 'Gli acquisti avvengono tramite il nostro distributore di fiducia, Lab401.com.',
    es: 'Las compras se realizan a través de nuestro distribuidor de confianza, Lab401.com.',
  },
  faqQ: {
    en: 'How do I purchase the SilverBullet?',
    fr: 'Comment acheter le SilverBullet ?',
    de: 'Wie kaufe ich den SilverBullet?',
    it: 'Come si acquista il SilverBullet?',
    es: '¿Cómo compro el SilverBullet?',
  },
  faqA: {
    en: 'All purchases are made through Lab401, the exclusive distributor of SilverBullet. The Buy buttons on this site take you directly to Lab401’s secure checkout.',
    fr: 'Tous les achats s’effectuent via Lab401, le distributeur exclusif de SilverBullet. Les boutons d’achat de ce site vous conduisent directement au paiement sécurisé de Lab401.',
    de: 'Alle Käufe erfolgen über Lab401, den exklusiven Vertriebspartner von SilverBullet. Die Kauf-Buttons auf dieser Website führen Sie direkt zum sicheren Checkout von Lab401.',
    it: 'Tutti gli acquisti avvengono tramite Lab401, il distributore esclusivo di SilverBullet. I pulsanti di acquisto di questo sito portano direttamente al checkout sicuro di Lab401.',
    es: 'Todas las compras se realizan a través de Lab401, el distribuidor exclusivo de SilverBullet. Los botones de compra de este sitio le llevan directamente al pago seguro de Lab401.',
  },
};

// en-string -> per-locale map, for glossary seeding
export const SEED = Object.fromEntries(Object.values(STRINGS).map((v) => [v.en, v]));
