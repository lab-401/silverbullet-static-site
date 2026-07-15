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
  newsletterLegend: {
    en: 'High-quality, low-volume, managed by our exclusive distributor Lab401.com.',
    fr: 'Haute qualité, faible volume – gérée par notre distributeur exclusif Lab401.com.',
    de: 'Hohe Qualität, geringes Aufkommen – verwaltet von unserem exklusiven Vertriebspartner Lab401.com.',
    it: 'Alta qualità, bassa frequenza – gestita dal nostro distributore esclusivo Lab401.com.',
    es: 'Alta calidad, bajo volumen – gestionada por nuestro distribuidor exclusivo Lab401.com.',
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

// Rewritten FAQ "Purchasing" answers (2026-07-15): purchases route through
// Lab401.com. Facts verified against lab401.com (payment methods identical,
// same legal entity ETOILE 401 SAS). DeepL-translated with brand glossary,
// human-reviewed. Questions keep their original source translations.
export const FAQ_ANSWERS = {
  payIntro: {
    en: 'Purchase and payment are handled securely at the checkout of Lab401.com, our exclusive distributor, using:',
    fr: 'L’achat et le paiement sont traités en toute sécurité lors du passage en caisse sur Lab401.com, notre distributeur exclusif, via :',
    de: 'Kauf und Bezahlung werden sicher an der Kasse von Lab401.com, unserem exklusiven Vertriebspartner, abgewickelt, und zwar mithilfe von:',
    it: 'L’acquisto e il pagamento vengono gestiti in modo sicuro alla cassa di Lab401.com, il nostro distributore esclusivo, utilizzando:',
    es: 'La compra y el pago se gestionan de forma segura en la página de pago de Lab401.com, nuestro distribuidor exclusivo, mediante:',
  },
  payWire: {
    en: 'If you require payment via international bank transfer, this can be arranged — please contact Lab401 directly. Please note, minimum order quantities apply to this method. Shipment will not proceed until funds are received.',
    fr: 'Si vous souhaitez effectuer le paiement par virement bancaire international, cela peut être organisé — veuillez contacter Lab401 directement. Veuillez noter que des quantités minimales de commande s’appliquent à ce mode de paiement. L’expédition n’aura lieu qu’après réception des fonds.',
    de: 'Sollten Sie eine Zahlung per internationaler Banküberweisung wünschen, kann dies arrangiert werden – bitte wenden Sie sich direkt an Lab401. Bitte beachten Sie, dass für diese Zahlungsart Mindestbestellmengen gelten. Der Versand erfolgt erst nach Eingang der Zahlung.',
    it: 'Se desiderate effettuare il pagamento tramite bonifico bancario internazionale, è possibile organizzarlo: vi preghiamo di contattare direttamente Lab401. Si prega di notare che per questa modalità di pagamento sono previsti quantitativi minimi d’ordine. La spedizione non verrà effettuata fino al ricevimento del pagamento.',
    es: 'Si necesita realizar el pago mediante transferencia bancaria internacional, se puede organizar; póngase en contacto directamente con Lab401. Tenga en cuenta que se aplican cantidades mínimas de pedido a este método. El envío no se tramitará hasta que se haya recibido el pago.',
  },
  vat: {
    en: 'Sales are processed by Lab401.com (ETOILE 401 SAS), an EU-registered entity. VAT is applicable to purchases delivered within the EU, with exceptions for VAT-registered entities. VAT is calculated at checkout.',
    fr: 'Les ventes sont traitées par Lab401.com (ETOILE 401 SAS), une entité enregistrée dans l’Union européenne. La TVA s’applique aux achats livrés au sein de l’Union européenne, à l’exception des entités assujetties à la TVA. La TVA est calculée lors du paiement.',
    de: 'Der Verkauf wird von Lab401.com (ETOILE 401 SAS), einem in der EU registrierten Unternehmen, abgewickelt. Bei Lieferungen innerhalb der EU fällt Mehrwertsteuer an, mit Ausnahmen für umsatzsteuerlich registrierte Unternehmen. Die Mehrwertsteuer wird an der Kasse berechnet.',
    it: 'Le vendite vengono gestite da Lab401.com (ETOILE 401 SAS), un’entità registrata nell’Unione Europea. L’IVA è applicabile agli acquisti con consegna all’interno dell’UE, salvo eccezioni per i soggetti registrati ai fini IVA. L’IVA viene calcolata al momento del pagamento.',
    es: 'Las ventas las gestiona Lab401.com (ETOILE 401 SAS), una entidad registrada en la UE. Se aplica el IVA a las compras con entrega dentro de la UE, salvo en el caso de las entidades registradas a efectos del IVA. El IVA se calcula al finalizar la compra.',
  },
  contractual: {
    en: 'Please note — a purchase is an explicit agreement of Lab401’s terms and conditions. <strong>Any products refused by clients will not be refunded.</strong>',
    fr: 'Remarque : tout achat implique l’acceptation explicite des conditions générales de vente de Lab401. <strong>Les produits refusés par les clients ne seront pas remboursés.</strong>',
    de: 'Bitte beachten Sie: Mit dem Kauf erklären Sie sich ausdrücklich mit den Allgemeinen Geschäftsbedingungen von Lab401 einverstanden. <strong>Für Produkte, die von Kunden abgelehnt werden, erfolgt keine Rückerstattung.</strong>',
    it: 'Nota bene: l’acquisto implica l’accettazione esplicita dei termini e delle condizioni di Lab401. <strong>I prodotti rifiutati dai clienti non saranno rimborsati.</strong>',
    es: 'Tenga en cuenta que la compra implica la aceptación explícita de los términos y condiciones de Lab401. <strong>No se reembolsará el importe de ningún producto rechazado por los clientes.</strong>',
  },
  security1: {
    en: 'To protect against credit card fraud, orders may be flagged for Purchase Security Validation. In this instance, Lab401 will reach out to the customer to perform a manual verification process.',
    fr: 'Afin de lutter contre la fraude à la carte bancaire, certaines commandes peuvent faire l’objet d’une « validation de sécurité des achats ». Dans ce cas, Lab401 contactera le client pour procéder à une vérification manuelle.',
    de: 'Zum Schutz vor Kreditkartenbetrug können Bestellungen für eine Kaufsicherheitsprüfung markiert werden. In diesem Fall wird sich Lab401 mit dem Kunden in Verbindung setzen, um eine manuelle Überprüfung durchzuführen.',
    it: 'A tutela contro le frodi con carta di credito, gli ordini potrebbero essere sottoposti a una verifica di sicurezza dell’acquisto. In tal caso, Lab401 contatterà il cliente per effettuare una verifica manuale.',
    es: 'Para protegerse contra el fraude con tarjetas de crédito, es posible que los pedidos se sometan a una «Validación de seguridad de la compra». En tal caso, Lab401 se pondrá en contacto con el cliente para llevar a cabo un proceso de verificación manual.',
  },
  security2: {
    en: 'Orders that are flagged for Purchase Security Validation are considered to be <em>incomplete</em> until validated. Delivery deadline obligations begin only when an order is validated.',
    fr: 'Les commandes soumises à une validation de sécurité des achats sont considérées comme <em>incomplètes</em> tant qu’elles n’ont pas été validées. Les délais de livraison ne commencent à courir qu’à partir du moment où la commande est validée.',
    de: 'Bestellungen, die zur Kaufsicherheitsprüfung markiert sind, gelten bis zur Validierung als <em>unvollständig</em>. Lieferfristen gelten erst ab dem Zeitpunkt der Validierung der Bestellung.',
    it: 'Gli ordini contrassegnati per la «Convalida di sicurezza dell’acquisto» sono considerati <em>incompleti</em> fino alla convalida. Gli obblighi relativi ai termini di consegna decorrono solo a partire dalla convalida dell’ordine.',
    es: 'Los pedidos marcados para «Validación de seguridad de la compra» se consideran <em>incompletos</em> hasta que se validen. Los plazos de entrega solo comienzan a contar una vez que se ha validado el pedido.',
  },
};
