// langify's floating switcher submits language changes to Shopify's
// /localization route, which doesn't exist on the static site. Intercept the
// widget's language links in the CAPTURE phase (runs before langify's own
// handler) and navigate straight to the locale-equivalent URL. The footer
// selector uses data-value anchors with real hrefs and is unaffected.
(function () {
  function targetHref(code) {
    var p = location.pathname.replace(/^\/(fr|de|it|es)(?=\/|$)/, '') || '/';
    if (code === 'en') return p;
    return '/' + code + (p === '/' ? '' : p);
  }
  document.addEventListener(
    'click',
    function (e) {
      var a = e.target.closest && e.target.closest('a[data-language-code]');
      if (!a) return;
      var code = (a.getAttribute('data-language-code') || '').toLowerCase();
      if (!/^(en|fr|de|it|es)$/.test(code)) return;
      e.preventDefault();
      e.stopPropagation();
      window.location.href = targetHref(code);
    },
    true
  );
})();
