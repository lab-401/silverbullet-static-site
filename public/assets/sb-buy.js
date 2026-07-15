// Purchasing goes through Lab401.com, the exclusive SilverBullet distributor.
// Every buy CTA (Buy-it-now buttons and Add-to-cart submits) navigates to
// Lab401's checkout via a Shopify cart permalink for the SilverBullet 2,
// honoring the nearest quantity selector.
(function () {
  var CART_URL = 'https://lab401.com/cart/53597858595163:';
  function qtyNear(el) {
    var scope = el.closest('.shopify-section') || document;
    var q = scope.querySelector('input[name="quantity"]');
    var n = q ? parseInt(q.value, 10) : 1;
    return n > 0 && n < 100 ? n : 1;
  }
  document.addEventListener('click', function (e) {
    var btn =
      e.target.closest &&
      e.target.closest('[data-sb-migration="buy-now"], form[data-sb-migration="add-to-cart-form"] button[type="submit"]');
    if (!btn) return;
    e.preventDefault();
    window.location.href = CART_URL + qtyNear(btn);
  });
})();
