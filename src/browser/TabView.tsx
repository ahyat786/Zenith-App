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
import { useStore } from '../state/store';
import { BRIDGE_SCRIPT, joinPayload } from '../core/inject';
import { shieldBootScript } from '../core/shield';
import { adblockShouldBlock } from '../core/native';
import { DESKTOP_INJECT_SCRIPT, DESKTOP_UA, isDesktopUa } from '../core/desktop';
import { planCached } from '../core/plan';
import { webviewRefs } from './refs';
import {
  claimWebViewLoad,
  forceWebViewLoad,
  cancelBlankProbe,
  noteBlankProbeResult,
  pendingNavigationUrl,
  probeBlankWebView,
  shouldApplyNavUrl,
} from './navIntent';
import { isBlankWebUrl, isNewTabUrl } from './newtab';
import { Button } from '../ui/kit';
import { Icon } from '../ui/Icon';

interface Props {
  tab: Tab;
  active: boolean;
  theme: Theme;
}

export function TabView({ tab, active, theme }: Props) {
  const { state, dispatch, siteConfigFor, openNewTab } = useStore();
  const [sourceUrl, setSourceUrl] = useState(() => pendingNavigationUrl(tab.id) || tab.url);
  const lastHistoryUrl = useRef<string>('');
  const injectGen = useRef(0);
  const mountedAt = useRef(Date.now());
  const loadedOnce = useRef(false);

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
        if (locked) {
          setSourceUrl((cur) => (cur === locked ? cur : locked));
          forceWebViewLoad(ref, locked);
          // Satu putaran kemudian: native view kadang belum siap di callback ref.
          setTimeout(() => {
            if (pendingNavigationUrl(tab.id) === locked) {
              forceWebViewLoad(webviewRefs.get(tab.id), locked);
            }
          }, 0);
        }
      } else {
        webviewRefs.delete(tab.id);
      }
    },
    [tab.id],
  );

  // URL yang diketik dari tab baru / omnibox harus dimuat, bukan hanya disimpan.
  useEffect(() => {
    const pending = pendingNavigationUrl(tab.id);
    if (pending && pending !== sourceUrl) {
      setSourceUrl(pending);
    } else if (
      !pending &&
      tab.url &&
      !isNewTabUrl(tab.url) &&
      tab.url !== sourceUrl &&
      (!sourceUrl || isBlankWebUrl(sourceUrl))
    ) {
      setSourceUrl(tab.url);
    }
    const wv = webviewRefs.get(tab.id);
    if (!wv) {
      return;
    }
    const locked = claimWebViewLoad(tab.id);
    if (locked) {
      forceWebViewLoad(wv, locked);
    }
  }, [tab.id, tab.url, sourceUrl]);

  const recoverIfBlank = useCallback(() => {
    if (pendingNavigationUrl(tab.id)) {
      return;
    }
    if (!loadedOnce.current && Date.now() - mountedAt.current < 2500) {
      return;
    }
    if (!active) {
      return;
    }
    probeBlankWebView(tab.id, tab.url);
  }, [active, tab.id, tab.url]);

  useEffect(() => {
    if (!active) {
      return;
    }
    const wait = loadedOnce.current ? 400 : Math.max(0, 2500 - (Date.now() - mountedAt.current));
    const timer = setTimeout(recoverIfBlank, wait);
    return () => clearTimeout(timer);
  }, [active, recoverIfBlank]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        if (timer) {
          clearTimeout(timer);
        }
        timer = setTimeout(recoverIfBlank, 350);
      }
    });
    return () => {
      if (timer) {
        clearTimeout(timer);
      }
      sub.remove();
    };
  }, [recoverIfBlank]);

  useEffect(() => {
    return () => cancelBlankProbe(tab.id);
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
        case 'zen:health':
          noteBlankProbeResult(tab.id, String(msg.token || ''), !!msg.dead, tab.url);
          break;
        case 'zen:urlchange': {
          const url = String(msg.url || '');
          if (!url || isBlankWebUrl(url) || !shouldApplyNavUrl(tab.id, url)) {
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
    [tab.id, tab.url, sourceUrl, injectPhase, dispatch, shieldOn],
  );

  // ---------------- navigasi ----------------
  const onNavigationStateChange = useCallback(
    (nav: WebViewNavigation) => {
      if (!nav.url || isBlankWebUrl(nav.url) || !shouldApplyNavUrl(tab.id, nav.url)) {
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
    [tab.id, tab.url, tab.title, tab.canGoBack, tab.canGoForward, tab.loading, tab.incognito, dispatch],
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
        source={{ uri: sourceUrl }}
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
            <Text style={{ color: theme.text, fontSize: 16, fontWeight: '700', textAlign: 'center' }}>
              Tidak dapat memuat halaman
            </Text>
            <Text style={{ color: theme.subtext, fontSize: 13, textAlign: 'center' }}>
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
        domStorageEnabled
        incognito={tab.incognito}
        thirdPartyCookiesEnabled={!tab.incognito}
        userAgent={desktop ? DESKTOP_UA : siteCfg?.userAgent || undefined}
        applicationNameForUserAgent={`Zenith/0.4.6 zp:${tab.profileId || 'profile-utama'}`}
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
