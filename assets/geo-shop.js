/* Shop menu is Indonesia-only.
 *
 * Resolves the visitor's country from their IP via a keyless CORS service on
 * every load, painting immediately from the last known answer, then reveals
 * any .pk-shop / .pk-shop-m / .pk-shop-f link by putting .pk-geo-id on <body>.
 * If both sources fail, are blocked, or time out, the links stay hidden.
 *
 * Safe to load more than once, and re-applies itself after index.html's
 * bundler replaces the whole <html> element.
 */
(function () {
  var KEY = 'pk_geo_country';
  var TTL = 24 * 60 * 60 * 1000;
  var WANT = 'ID';

  var CSS = '.pk-shop,.pk-shop-m,.pk-shop-f{display:none}' +
            'body.pk-geo-id .pk-shop{display:inline}' +
            'body.pk-geo-id .pk-shop-m,body.pk-geo-id .pk-shop-f{display:block}';

  // Pages carry this rule inline too; this is the belt-and-braces copy for the
  // bundler-rendered document, whose <head> is rebuilt from the template.
  function ensureStyle() {
    if (document.getElementById('pk-shop-css')) return;
    var st = document.createElement('style');
    st.id = 'pk-shop-css';
    st.textContent = CSS;
    (document.head || document.documentElement).appendChild(st);
  }

  function apply(cc) {
    ensureStyle();
    if (!document.body) return;
    // toggle, not add: a revalidation that comes back non-ID has to be able to
    // hide the link again (e.g. the visitor turned a VPN on).
    document.body.classList.toggle('pk-geo-id', cc === WANT);
  }

  function cached() {
    if (window.__pkGeoCountry) return window.__pkGeoCountry;
    try {
      var o = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (o && Date.now() - o.t < TTL) {
        window.__pkGeoCountry = o.c;
        return o.c;
      }
    } catch (e) {}
    return null;
  }

  function store(cc) {
    window.__pkGeoCountry = cc;
    try { localStorage.setItem(KEY, JSON.stringify({ c: cc, t: Date.now() })); } catch (e) {}
  }

  function lookup() {
    var sources = [
      { url: 'https://api.country.is/', pick: function (j) { return j && j.country; } },
      { url: 'https://get.geojs.io/v1/ip/country.json', pick: function (j) { return j && j.country; } }
    ];
    (function attempt(i) {
      if (i >= sources.length) return;
      var src = sources[i];
      var settled = false;
      var bail = setTimeout(function () {
        if (!settled) { settled = true; attempt(i + 1); }
      }, 2500);
      fetch(src.url, { cache: 'no-store' })
        .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('bad status')); })
        .then(function (j) {
          if (settled) return;
          settled = true; clearTimeout(bail);
          var cc = String(src.pick(j) || '').toUpperCase();
          if (cc) { store(cc); apply(cc); } else attempt(i + 1);
        })
        .catch(function () {
          if (settled) return;
          settled = true; clearTimeout(bail);
          attempt(i + 1);
        });
    })(0);
  }

  function run() {
    // Once per document. The marker rides on <html>, so it is gone after the
    // bundler swaps that element and the check runs again for the new document.
    var root = document.documentElement;
    if (root.getAttribute('data-pk-geo') === '1') return;
    root.setAttribute('data-pk-geo', '1');
    // Stale-while-revalidate. Paint from the last known answer so the link
    // does not flicker, but ALWAYS re-check, otherwise a cached country
    // outlives the network it came from -- connect through a VPN once and the
    // old verdict stuck for the full day.
    var cc = cached();
    if (cc) apply(cc);
    lookup();
  }

  if (document.body) run();
  else document.addEventListener('DOMContentLoaded', run);
})();
