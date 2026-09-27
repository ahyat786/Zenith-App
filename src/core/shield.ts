/**
 * Shield Guard di dalam halaman.
 *
 * Halaman uji (superadblocktest, turtlecute, ujidns, fivefilters) menganggap
 * lolos hanya jika `fetch` ditolak — jawaban 204 tetap "terjangkau".
 * Jembatan ini menolak fetch/XHR sebelum jaringan, menyembunyikan umpan
 * kosmetik, dan melaporkan hostname ke log koneksi.
 */
import { SHIELD_PROBE_SUFFIXES } from './shieldProbe';

export const SHIELD_COSMETIC_CSS = [
  '.textads',
  '.adsbox',
  '.banner_ads',
  '.banner-ads',
  '.adbox',
  '.ADBox',
  '.AdBox',
  '.adbox-wrapper',
  '.adSocial',
  '.ad-unit',
  '.afs_ads',
  '.ad-zone',
  '.ad-space',
  '.adsbygoogle',
  'ins.adsbygoogle',
  '.an-advert-banner',
  '.an-sponsored',
  '.interads',
  '[id^="ADSLOT_"]',
  '[id^="google_ads_"]',
  'iframe[src*="ad_box_"]',
  'iframe[src*="doubleclick"]',
  'iframe[src*="googlesyndication"]',
].join(',');

export function shieldBootScript(): string {
  const hosts = JSON.stringify(SHIELD_PROBE_SUFFIXES);
  const css = JSON.stringify(
    SHIELD_COSMETIC_CSS +
      '{display:none!important;height:0!important;max-height:0!important;overflow:hidden!important;visibility:hidden!important;opacity:0!important;}',
  );
  return String.raw`
(function () {
  if (window.__ZEN_SHIELD__) return;
  window.__ZEN_SHIELD__ = true;
  var HOSTS = new Set(${hosts});
  var CSS = ${css};
  function hostOf(url) {
    try {
      var u = new URL(String(url), location.href);
      return (u.hostname || '').toLowerCase().trim();
    } catch (e) {
      return '';
    }
  }
  function pathOf(url) {
    try {
      var u = new URL(String(url), location.href);
      return (u.pathname + u.search).toLowerCase();
    } catch (e) {
      return String(url || '').toLowerCase();
    }
  }
  function hostBlocked(host) {
    var h = String(host || '').toLowerCase();
    while (h) {
      if (HOSTS.has(h)) return true;
      var i = h.indexOf('.');
      if (i < 0) break;
      h = h.slice(i + 1);
    }
    return false;
  }
  function bait(url) {
    var p = pathOf(url);
    if (p.indexOf('/ads.js') >= 0 || p.indexOf('/pagead.js') >= 0 || p.indexOf('/adsbygoogle.js') >= 0 || p.indexOf('/advertisement.js') >= 0 || p.indexOf('/partner.ads.js') >= 0 || p.indexOf('/widget/ads.js') >= 0) return true;
    if (p.indexOf('ad_box_') >= 0) return true;
    if (p.indexOf('/gampad/ads') >= 0 || p.indexOf('/pagead/ads') >= 0 || p.indexOf('/pagead/js/') >= 0) return true;
    var h = hostOf(url);
    if (h === 'vk.com' && p.indexOf('/rtrg') >= 0) return true;
    return false;
  }
  function blocked(url) {
    if (!url) return false;
    if (bait(url)) return true;
    return hostBlocked(hostOf(url));
  }
  function report(url) {
    try {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'zen:shield', url: String(url) }));
      }
    } catch (e) {}
  }
  function installCss() {
    try {
      var s = document.createElement('style');
      s.setAttribute('data-zenith', 'shield');
      s.textContent = CSS;
      (document.head || document.documentElement).appendChild(s);
    } catch (e) {}
  }
  installCss();
  try {
    var ofetch = window.fetch;
    if (ofetch) {
      window.fetch = function (input, init) {
        var url = typeof input === 'string' ? input : input && input.url;
        if (blocked(url)) {
          report(url);
          return Promise.reject(new TypeError('Failed to fetch'));
        }
        return ofetch.apply(this, arguments);
      };
    }
  } catch (e) {}
  try {
    var xo = XMLHttpRequest.prototype.open;
    var xs = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (method, url) {
      this.__zenUrl = url;
      return xo.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function () {
      if (blocked(this.__zenUrl)) {
        report(this.__zenUrl);
        try { this.dispatchEvent(new Event('error')); } catch (e) {}
        return;
      }
      return xs.apply(this, arguments);
    };
  } catch (e) {}
  function neuter(el) {
    try {
      if (!el || el.__zenDead) return;
      var src = el.src || el.getAttribute('src') || '';
      if (!blocked(src)) return;
      el.__zenDead = true;
      report(src);
      el.removeAttribute('src');
      try { el.src = ''; } catch (e) {}
    } catch (e) {}
  }
  try {
    var mo = new MutationObserver(function (recs) {
      for (var i = 0; i < recs.length; i++) {
        var nodes = recs[i].addedNodes;
        for (var j = 0; j < nodes.length; j++) {
          var n = nodes[j];
          if (!n || n.nodeType !== 1) continue;
          if (n.tagName === 'SCRIPT' || n.tagName === 'IMG' || n.tagName === 'IFRAME') neuter(n);
          if (n.querySelectorAll) {
            var found = n.querySelectorAll('script[src],img[src],iframe[src]');
            for (var k = 0; k < found.length; k++) neuter(found[k]);
          }
        }
      }
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
  } catch (e) {}
})();
`;
}
