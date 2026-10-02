/**
 * TabView — satu WebView per tab.
 *
 * Alur injeksi skrip (Via-style userscript + Kiwi-style content script):
 *  1. BRIDGE_SCRIPT disuntik statis pada document-start (tanpa race).
 *  2. Jembatan mengirim sinyal zen:docstart / zen:docend / zen:docidle.
 *  3. Tiap sinyal → rencana injeksi dihitung (Rust match) → disuntik.
 *     Pembungkus idempoten mencegah skrip berjalan dua kali.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking, Text, View } from 'react-native';
import { WebView as WebViewComponent, type WebViewNavigation } from 'react-native-webview';
import type { ShouldStartLoadRequest } from 'react-native-webview/lib/WebViewTypes';

/** Tipe props react-native-webview v14 belum kompatibel penuh dengan React 19 —
 *  cast ke any; runtime tetap memakai komponen yang sama. */
const Wv: any = WebViewComponent;
import type { Tab } from '../types';
import type { Theme } from '../theme';
import { type as typeScale } from '../theme';
import { useStore } from '../state/store';
import { BRIDGE_SCRIPT, joinPayload } from '../core/inject';
import { shieldBootScript } from '../core/shield';
import { adblockShouldBlock, restoreTabState, saveTabState } from '../core/native';
import { RESTORE_PLACEHOLDER, restoreSourceUri, shouldAttemptRestore } from './tabRestore';
import {
  getScroll,
  putScroll,
  REPORT_SCROLL_SCRIPT,
  restoreScrollScript,
  shouldRestoreScroll,
} from './scrollMemory';
import { DESKTOP_INJECT_SCRIPT, DESKTOP_UA, isDesktopUa } from '../core/desktop';
import { planCached } from '../core/plan';
import { webviewRefs } from './refs';
import {
  claimWebViewLoad,
  forceWebViewLoad,
  cancelBlankProbe,
  guardNavigation,
  noteBlankProbeResult,
  pendingNavigationUrl,
  probeBlankWebView,
} from './navIntent';
import { isBlankWebUrl, isNewTabUrl } from './newtab';
import { Button } from '../ui/kit';
import { Icon } from '../ui/Icon';

interface Props {
  tab: Tab;
  active: boolean;
  theme: Theme;
}

/**
 * Ingatan gulir untuk seluruh sesi (semua tab). Sengaja di lingkup modul:
 * WebView tab dilepas-pasang oleh keep-alive, ingatan ini harus bertahan.
 */
const scrollMemory = new Map<string, number>();

export function TabView({ tab, active, theme }: Props) {
  const { state, fullState, dispatch, siteConfigFor, openNewTab } = useStore();
  const pendingUrl = pendingNavigationUrl(tab.id);
  const sourceUrl = pendingUrl || tab.url;
  /**
   * URL awal WebView DIBEKUKAN saat mount.
   *
   * Prop `source` react-native-webview memanggil loadUrl setiap kali berubah.
   * Sebelumnya nilai ini mengikuti tab.url sehingga setiap pengalihan (redirect),
   * navigasi SPA, atau re-render memicu muat ulang baru — inilah penyebab
   * halaman "refresh terus menerus" di tab aktif. Navigasi yang disengaja
   * sekarang lewat claimWebViewLoad + forceWebViewLoad saja.
   */
  const initialUrl = useRef<string>(pendingUrl || tab.url).current;
  /**
   * Histori WebView per tab (saveState/restoreState — panduan resmi WebView).
   *
   * WebView pertama-tama dipasang dengan sumber "zenith:restoring" yang
   * SENGAJA dilewati manager native (tidak ada pemuatan apa pun). Setelah
   * view native terdaftar, kami minta native memulihkan histori tab ini:
   *  · berhasil → sumber tetap "zenith:restored" (juga dilewati manager),
   *    halaman hasil pemulihan dibiarkan hidup — tidak ada muat ulang;
   *  · gagal / tidak ada state → sumber berganti ke URL tab seperti biasa.
   *
   * Navigasi baru (URL diketik, tautan diklik) selalu menang: bila ada
   * pemuatan yang sudah diklaim, pemulihan tidak dijalankan sama sekali.
   */
  const [sourceUri, setSourceUri] = useState<string>(RESTORE_PLACEHOLDER);
  const restoreDone = useRef(false);
  useEffect(() => {
    if (restoreDone.current) {
      return;
    }
    restoreDone.current = true;
    if (!shouldAttemptRestore(pendingNavigationUrl(tab.id), tab.id)) {
      // Pengguna sudah meminta halaman lain — jangan pulihkan histori lama.
      setSourceUri(restoreSourceUri(false, initialUrl));
      return;
    }
    let alive = true;
    (async () => {
      const restored = await restoreTabState(tab.id);
      if (!alive) {
        return;
      }
      setSourceUri(restoreSourceUri(restored, initialUrl));
    })();
    return () => {
      alive = false;
    };
    // sekali per tab: id tab tidak berubah selama komponen ini hidup
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab.id]);

  const source = useRef({ uri: RESTORE_PLACEHOLDER }).current;
  source.uri = sourceUri;

  /** Sekali per pemuatan: tanya ukuran dokumen supaya pemulihan berbasis data. */
  const askMetrics = useCallback(() => {
    const wv = webviewRefs.get(tab.id);
    if (!wv) {
      return;
    }
    try {
      wv.injectJavaScript(
        "(function(){try{var de=document.documentElement||{};" +
          "if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(" +
          "JSON.stringify({type:'zen:metrics',h:de.scrollHeight||0,vh:window.innerHeight||0,url:location.href}));" +
          "}catch(e){}})();true;",
      );
    } catch {
      // WebView belum siap — pemulihan dilewati, bukan kesalahan
    }
  }, [tab.id]);
  const lastHistoryUrl = useRef<string>('');
  const injectGen = useRef(0);
  const loadedOnce = useRef(false);
  const metricsReady = useRef(false);
  const tabRef = useRef(tab);
  tabRef.current = tab;

  const siteCfg = siteConfigFor(tab.url);
  /** Mode desktop per-situs: UA macOS + viewport 1280 + scalesPageToFit. */
  const desktop = isDesktopUa(siteCfg?.userAgent);
  /** Shield Guard aktif untuk situs ini? */
  const shieldOn = state.settings.adblockEnabled && siteCfg?.adblockEnabled !== false;

  const setRef = useCallback(
    (ref: any) => {
      if (ref) {
        webviewRefs.set(tab.id, ref);
        const locked = claimWebViewLoad(tab.id);
        if (locked && locked !== initialUrl) {
          forceWebViewLoad(ref, locked);
        }
      } else {
        webviewRefs.delete(tab.id);
      }
    },
    [tab.id, initialUrl],
  );

  const foreignUrls = fullState.tabs
    .filter((t) => t.id !== tab.id && t.url && !isNewTabUrl(t.url))
    .map((t) => t.url);

  // URL yang diketik dari tab baru / omnibox harus dimuat, bukan hanya disimpan.
  useEffect(() => {
    const wv = webviewRefs.get(tab.id);
    if (!wv) {
      return;
    }
    const locked = claimWebViewLoad(tab.id);
    if (locked && locked !== initialUrl) {
      forceWebViewLoad(wv, locked);
    }
  }, [tab.id, tab.url, initialUrl]);

  /**
   * Pulihkan hanya bila renderer benar-benar mati (halaman putih setelah
   * aplikasi lama di latar). Tidak pernah memuat ulang saat halaman sedang
   * memuat — dulu inilah yang membuat tombol refresh berputar terus.
   */
  const recoverIfBlank = useCallback(() => {
    const cur = tabRef.current;
    if (!active || cur.loading || pendingNavigationUrl(tab.id) || !loadedOnce.current) {
      return;
    }
    probeBlankWebView(tab.id, cur.url);
  }, [active, tab.id]);

  // Batas aman indikator pemuatan saja. Jangan panggil stopLoading() agar
  // unduhan atau streaming panjang tidak terputus.
  useEffect(() => {
    if (!tab.loading) {
      return;
    }
    const timer = setTimeout(() => {
      if (tabRef.current.loading) {
        dispatch({ type: 'UPDATE_TAB', id: tab.id, patch: { loading: false, progress: 1 } });
      }
    }, 15000);
    return () => clearTimeout(timer);
  }, [tab.loading, tab.id, dispatch]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        if (timer) {
          clearTimeout(timer);
        }
        timer = setTimeout(recoverIfBlank, 450);
      } else {
        // Aplikasi ke latar: simpan histori WebView tab ini selagi hidup.
        // (Proses bisa dibunuh kapan saja sesudah ini.)
        void saveTabState(tab.id);
      }
    });
    return () => {
      if (timer) {
        clearTimeout(timer);
      }
      sub.remove();
    };
    // tab.id dipakai di dalam listener (saveTabState) — ikut jadi dependensi
    // supaya histori tab yang benar yang disimpan bila tab berpindah.
  }, [recoverIfBlank, tab.id]);

  useEffect(() => {
    return () => {
      // Tab akan dilepas (keep-alive) / ditutup: minta posisi gulir terakhir
      // supaya ingatan tidak tertinggal pada laporan throttle terakhir.
      try {
        webviewRefs.get(tab.id)?.injectJavaScript(REPORT_SCROLL_SCRIPT);
      } catch {
        // WebView sudah hilang — tidak masalah
      }
      cancelBlankProbe(tab.id);
    };
  }, [tab.id]);

  // ---------------- injeksi per fase ----------------
  const injectPhase = useCallback(
    async (phase: 'start' | 'end' | 'idle', url: string) => {
      const wv = webviewRefs.get(tab.id);
      if (!wv || !url || !/^https?:\/\//i.test(url)) {
        return;
      }
      const gen = ++injectGen.current;
      const plan = await planCached({
        url,
        scripts: state.scripts,
        extensions: state.extensions,
        globalCss: state.settings.customCss,
        siteConfig: siteConfigFor(url),
      });
      if (gen !== injectGen.current) {
        return; // navigasi baru terjadi — buang hasil basi
      }
      const phasePayload =
        phase === 'start' ? plan.start : phase === 'end' ? plan.end : plan.idle;
      // Shield Guard: lapisan kosmetik ringkas (kelas iklan generik + aturan
      // halaman uji d3host) — dikombinasikan dengan blokir jaringan Rust.
      const cosmetic = shieldOn
        ? '(function(){try{var s=document.createElement("style");s.textContent=".textads,.adbox.banner_ads.adsbox,.adsbox.banner_ads{display:none!important;}";(document.head||document.documentElement).appendChild(s);}catch(e){}})();'
        : '';
      const payload = joinPayload([phasePayload, plan.css, cosmetic]);
      if (payload) {
        try {
          wv.injectJavaScript(payload);
        } catch {
          // webview mungkin sudah lepas
        }
      }
    },
    [tab.id, state.scripts, state.extensions, state.settings.customCss, siteConfigFor, shieldOn],
  );

  // ---------------- pesan dari jembatan ----------------
  const onMessage = useCallback(
    (e: { nativeEvent: { data: string } }) => {
      let msg: any;
      try {
        msg = JSON.parse(e.nativeEvent.data);
      } catch {
        return;
      }
      if (!msg || typeof msg.type !== 'string') {
        return;
      }
      switch (msg.type) {
        case 'zen:docstart':
          injectPhase('start', msg.url || sourceUrl);
          break;
        case 'zen:docend':
          injectPhase('end', msg.url || sourceUrl);
          break;
        case 'zen:docidle':
          injectPhase('idle', msg.url || sourceUrl);
          break;
        case 'zen:metrics': {
          /*
           * Tinggi dokumen & viewport datang dari halaman; pemulihan gulir
           * hanya dijalankan bila halaman memang bisa digulir. Sekali per
           * pemuatan — dan injeksi `scrollTo` tidak pernah memicu navigasi,
           * jadi jaminan anti-refresh tetap utuh.
           */
          if (metricsReady.current) {
            break;
          }
          const mUrl = String(msg.url || '');
          if (!shouldRestoreScroll(scrollMemory, mUrl, Number(msg.h), Number(msg.vh))) {
            break;
          }
          metricsReady.current = true;
          webviewRefs.get(tab.id)?.injectJavaScript(restoreScrollScript(getScroll(scrollMemory, mUrl)));
          break;
        }
        case 'zen:scroll': {
          // Ingatan gulir per URL (dipakai saat WebView dibangun ulang).
          putScroll(scrollMemory, String(msg.url || ''), Number(msg.y));
          break;
        }
      case 'zen:health':
        noteBlankProbeResult(tab.id, String(msg.token || ''), !!msg.dead, String(msg.href || ''), tab.url);
        break;
        case 'zen:urlchange': {
          const url = String(msg.url || '');
          if (!url || isBlankWebUrl(url) || !guardNavigation(tab.id, url, tab.url, foreignUrls)) {
            break;
          }
          if (/^https?:/i.test(tab.url) && !/^https?:/i.test(url)) {
            break;
          }
          try {
            const prevHost = new URL(tab.url).hostname;
            const nextHost = new URL(url).hostname;
            if (prevHost !== nextHost) {
              injectPhase('start', url); // pindah situs dalam SPA
            }
          } catch {
            // abaikan
          }
          dispatch({
            type: 'UPDATE_TAB',
            id: tab.id,
            patch: { url, title: msg.title || '' },
          });
          break;
        }
        case 'zen:linkmenu':
          dispatch({
            type: 'SET_UI',
            patch: { linkMenu: { url: String(msg.url || ''), text: String(msg.text || '') } },
          });
          break;
        case 'zen:shield':
          if (shieldOn && msg.url) {
            adblockShouldBlock(String(msg.url)).catch(() => {});
          }
          break;
        case 'zen:error':
          console.warn(`[Zenith] ${msg.script}: ${msg.message}`);
          break;
        default:
          break;
      }
    },
    [tab.id, tab.url, sourceUrl, injectPhase, dispatch, shieldOn, foreignUrls],
  );

  // ---------------- navigasi ----------------
  const onNavigationStateChange = useCallback(
    (nav: WebViewNavigation) => {
      if (!nav.url || isBlankWebUrl(nav.url) || !guardNavigation(tab.id, nav.url, tab.url, foreignUrls)) {
        return;
      }
      if (/^https?:/i.test(nav.url)) {
        loadedOnce.current = true;
      }
      const patch: Partial<Tab> = {};
      const keepSaved = /^https?:/i.test(tab.url) && !/^https?:/i.test(nav.url);
      if (!keepSaved && nav.url !== tab.url) {
        patch.url = nav.url;
      }
      if (nav.title && nav.title !== tab.title) {
        patch.title = nav.title;
      }
      if (nav.canGoBack !== tab.canGoBack) {
        patch.canGoBack = nav.canGoBack;
      }
      if (nav.canGoForward !== tab.canGoForward) {
        patch.canGoForward = nav.canGoForward;
      }
      if (nav.loading !== tab.loading) {
        patch.loading = nav.loading;
      }
      if (Object.keys(patch).length > 0) {
        dispatch({ type: 'UPDATE_TAB', id: tab.id, patch });
      }
      if (
        !tab.incognito &&
        /^https?:\/\//i.test(nav.url) &&
        nav.url !== lastHistoryUrl.current
      ) {
        lastHistoryUrl.current = nav.url;
        dispatch({
          type: 'ADD_HISTORY',
          item: { url: nav.url, title: nav.title || '', at: Date.now() },
        });
      }
    },
    [tab.id, tab.url, tab.title, tab.canGoBack, tab.canGoForward, tab.loading, tab.incognito, dispatch, foreignUrls],
  );

  const upgradedRef = useRef<Set<string>>(new Set());
  const shouldStartLoadWithRequest = useCallback(
    (req: ShouldStartLoadRequest) => {
      const url = req.url || '';
      if (/^(mailto|tel|sms|geo|market|intent):/i.test(url)) {
        Linking.openURL(url).catch(() => {});
        return false;
      }
      // Brave: paksa https:// untuk frame utama (sekali per URL; host lokal lolos)
      if (
        req.isTopFrame &&
        state.settings.httpsUpgrades &&
        siteCfg?.httpsUpgrades !== false &&
        url.startsWith('http://') &&
        !/^http:\/\/(localhost|127\.0\.0\.1|192\.168\.|10\.)/i.test(url)
      ) {
        if (!upgradedRef.current.has(url)) {
          if (upgradedRef.current.size > 200) {
            upgradedRef.current.clear();
          }
          upgradedRef.current.add(url);
          const httpsUrl = 'https://' + url.slice(7);
          const wv = webviewRefs.get(tab.id);
          if (wv) {
            wv.injectJavaScript(`location.replace(${JSON.stringify(httpsUrl)});true;`);
            return false;
          }
        }
      }
      return true;
    },
    [state.settings.httpsUpgrades, siteCfg, tab.id],
  );

  const onProgress = useCallback(
    (e: { nativeEvent: { progress: number } }) => {
      const p = e.nativeEvent.progress;
      if (Math.abs(p - tab.progress) >= 0.08 || p >= 1) {
        dispatch({ type: 'UPDATE_TAB', id: tab.id, patch: { progress: p } });
      }
    },
    [tab.id, tab.progress, dispatch],
  );

  if (!sourceUrl || sourceUrl === 'about:blank' || isNewTabUrl(sourceUrl)) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.bg, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: theme.subtext }}>Tab kosong</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, display: active ? 'flex' : 'none', zIndex: active ? 2 : 0 }}>
      <Wv
        ref={setRef}
        source={source}
        style={{ flex: 1, backgroundColor: theme.bg }}
        originWhitelist={['*']}
        injectedJavaScriptBeforeContentLoaded={
          BRIDGE_SCRIPT + '\n' + DESKTOP_INJECT_SCRIPT + (shieldOn ? '\n' + shieldBootScript() : '')
        }
        onMessage={onMessage as any}
        onShouldStartLoadWithRequest={shouldStartLoadWithRequest}
        onNavigationStateChange={onNavigationStateChange}
        onLoadingProgress={onProgress}
        onLoadEnd={() => {
          loadedOnce.current = true;
          dispatch({ type: 'UPDATE_TAB', id: tab.id, patch: { loading: false, progress: 1 } });
          // Pemuatan baru: izinkan satu pemulihan gulir untuk URL ini.
          metricsReady.current = false;
          askMetrics();
        }}
        cacheEnabled
        onOpenWindow={(e: any) => {
          const target = e?.nativeEvent?.targetUrl;
          if (typeof target === 'string' && target) {
            openNewTab(target, { incognito: tab.incognito });
          }
        }}
        onRenderProcessGone={() => {
          // Proses render mati setelah lama di latar. reload() pada about:blank tetap kosong.
          const url = tab.url;
          loadedOnce.current = true;
          setTimeout(() => {
            if (url && !isNewTabUrl(url)) {
              forceWebViewLoad(webviewRefs.get(tab.id), url);
            }
          }, 200);
        }}
        renderError={() => (
          <View
            style={{
              flex: 1,
              backgroundColor: theme.bg,
              alignItems: 'center',
              justifyContent: 'center',
              padding: 32,
              gap: 12,
            }}>
            <Icon name="warning" size={40} color={theme.warn} />
            <Text style={{ color: theme.text, ...typeScale.bodyLarge, fontWeight: '700', textAlign: 'center' }}>
              Tidak dapat memuat halaman
            </Text>
            <Text style={{ color: theme.subtext, ...typeScale.bodyMedium, textAlign: 'center' }}>
              Periksa koneksi internet Anda lalu coba lagi.
            </Text>
            <View style={{ marginTop: 8 }}>
              <Button
                label="Coba lagi"
                theme={theme}
                onPress={() => webviewRefs.get(tab.id)?.reload()}
              />
            </View>
          </View>
        )}
        javaScriptEnabled={siteCfg?.javascriptEnabled !== false}
        /*
         * Panduan WebView resmi:
         *  · forceDarkOn — konten web mengikuti tema aplikasi (gelap/terang).
         *    Di Android 13+ Zenith memakai "algorithmic darkening" Jetpack Webkit
         *    (lihat ZenithWebViewManager) sehingga halaman gelap tetap terbaca.
         *  · allowsFullscreenVideo — video HTML5 layar penuh dikelola
         *    WebChromeClient (kelola jendela WebView).
         *  · allowsProtectedMedia — konten DRM (L1) tetap diputar.
         */
        forceDarkOn={theme.dark}
        allowsFullscreenVideo
        domStorageEnabled
        incognito={tab.incognito}
        thirdPartyCookiesEnabled={!tab.incognito}
        userAgent={desktop ? DESKTOP_UA : siteCfg?.userAgent || undefined}
        applicationNameForUserAgent={`Zenith/0.9.0 zp:${tab.profileId || 'profile-utama'} zt:${tab.id}`}
        scalesPageToFit={desktop || undefined}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        setSupportMultipleWindows
        allowsProtectedMedia
        mixedContentMode="never"
        startInLoadingState={false}
        renderLoading={undefined}
      />
    </View>
  );
}
