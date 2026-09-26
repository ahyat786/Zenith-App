/**
 * Payload JavaScript yang disuntikkan ke WebView.
 *
 * - BRIDGE_SCRIPT (document-start, statis): jembatan Zen, deteksi URL SPA,
 *   sinyal siklus dokumen, menu tautan tekan-lama (Glance).
 * - SHIM_SCRIPT: API GM_* (userscript Via/Greasy Fork) + chrome.* mini
 *   (subset ekstensi).
 * - wrapScript: pembungkus idempoten + penangkap error.
 */

export const BRIDGE_SCRIPT = String.raw`
(function () {
  if (window.__ZEN_BRIDGE__) return;
  window.__ZEN_BRIDGE__ = true;
  var post = function (msg) {
    try {
      if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(msg));
    } catch (e) {}
  };
  window.Zen = { post: post };
  var lastUrl = location.href;
  var send = function (type) {
    try { post({ type: type, url: location.href, title: document.title }); } catch (e) {}
  };
  var onUrlChange = function () {
    try {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        post({ type: 'zen:urlchange', url: location.href, title: document.title });
      }
    } catch (e) {}
  };
  try {
    var ps = history.pushState, rs = history.replaceState;
    history.pushState = function () {
      var r = ps.apply(this, arguments);
      setTimeout(onUrlChange, 0);
      return r;
    };
    history.replaceState = function () {
      var r = rs.apply(this, arguments);
      setTimeout(onUrlChange, 0);
      return r;
    };
  } catch (e) {}
  window.addEventListener('popstate', onUrlChange);
  window.addEventListener('hashchange', onUrlChange);
  document.addEventListener('DOMContentLoaded', function () { send('zen:docend'); });
  window.addEventListener('load', function () { send('zen:docidle'); });
  document.addEventListener('contextmenu', function (e) {
    try {
      var el = e.target;
      var a = el && el.closest ? el.closest('a[href]') : null;
      if (a && a.href) {
        e.preventDefault();
        post({ type: 'zen:linkmenu', url: a.href, text: (a.textContent || '').trim().slice(0, 120) });
      }
    } catch (err) {}
  }, true);
  send('zen:docstart');
})();
`;

export const SHIM_SCRIPT = String.raw`
(function () {
  if (window.__ZEN_SHIM__) return;
  window.__ZEN_SHIM__ = true;
  var PREFIX = 'zen:gm:';
  function mkStyle(css) {
    try {
      var s = document.createElement('style');
      s.setAttribute('data-zenith', 'gm');
      s.textContent = css;
      (document.head || document.documentElement).appendChild(s);
      return s;
    } catch (e) { return null; }
  }
  window.GM_info = window.GM_info || { scriptHandler: 'Zenith', version: '0.3.2', script: { name: '', version: '' } };
  window.GM = window.GM || {};
  window.GM_addStyle = window.GM_addStyle || mkStyle;
  window.GM_setValue = window.GM_setValue || function (k, v) { try { localStorage.setItem(PREFIX + k, JSON.stringify(v)); } catch (e) {} };
  window.GM_getValue = window.GM_getValue || function (k, d) {
    try { var r = localStorage.getItem(PREFIX + k); return r === null ? d : JSON.parse(r); } catch (e) { return d; }
  };
  window.GM_deleteValue = window.GM_deleteValue || function (k) { try { localStorage.removeItem(PREFIX + k); } catch (e) {} };
  window.GM_listValues = window.GM_listValues || function () {
    var out = [];
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf(PREFIX) === 0) out.push(k.slice(PREFIX.length));
      }
    } catch (e) {}
    return out;
  };
  window.unsafeWindow = window;
  if (!window.chrome) {
    var EPREFIX = 'zen:ext:';
    function lsRead(k) { try { var r = localStorage.getItem(EPREFIX + k); return r === null ? {} : JSON.parse(r); } catch (e) { return {}; } }
    function lsWrite(k, v) { try { localStorage.setItem(EPREFIX + k, JSON.stringify(v)); } catch (e) {} }
    window.chrome = {
      runtime: {
        id: 'zenith',
        sendMessage: function (m, cb) { try { window.Zen && window.Zen.post({ type: 'zen:extmsg', message: m }); } catch (e) {} if (typeof cb === 'function') setTimeout(cb, 0); },
        onMessage: { addListener: function () {}, removeListener: function () {} },
        getURL: function (p) { return p; },
        lastError: null
      },
      storage: {
        local: {
          get: function (keys, cb) {
            var out = {};
            var ks = typeof keys === 'string' ? [keys] : keys || [];
            if (typeof ks === 'object' && ks.length === undefined) { out = lsRead('obj'); }
            else { for (var i = 0; i < ks.length; i++) { var o = lsRead(ks[i]); if (o[ks[i]] !== undefined) out[ks[i]] = o[ks[i]]; } }
            if (typeof cb === 'function') setTimeout(function () { cb(out); }, 0);
          },
          set: function (obj, cb) {
            for (var k in obj) { var cur = lsRead(k); cur[k] = obj[k]; lsWrite(k, cur); }
            if (typeof cb === 'function') setTimeout(cb, 0);
          }
        }
      }
    };
  }
})();
`;

/** Bungkus satu skrip: idempoten (guard per id) + lapor error ke Zen. */
export function wrapScript(id: string, code: string, label: string): string {
  const idJson = JSON.stringify(id);
  const labelJson = JSON.stringify(label);
  return `(function(){try{if(!window.__ZEN_RUN)window.__ZEN_RUN={};if(window.__ZEN_RUN[${idJson}])return;window.__ZEN_RUN[${idJson}]=1;\n${code}\n}catch(e){try{window.Zen&&window.Zen.post({type:'zen:error',script:${labelJson},message:String(e&&e.message||e),url:location.href});}catch(_){}}})();`;
}

/** Suntik CSS ke dokumen (idempoten, diperbarui bila sudah ada). */
export function cssInjection(css: string): string {
  const cssJson = JSON.stringify(css);
  return `(function(){try{var el=document.getElementById('zenith-style');if(el){el.textContent=${cssJson};return;}var s=document.createElement('style');s.id='zenith-style';s.textContent=${cssJson};(document.head||document.documentElement).appendChild(s);}catch(e){}})();`;
}

/** Gabungkan potongan-potongan menjadi satu payload injectJavaScript. */
export function joinPayload(parts: string[]): string {
  return parts.filter(Boolean).join('\n;\n');
}
