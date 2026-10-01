/**
 * Navigasi yang disengaja (omnibox / pintasan tab baru).
 *
 * Aturan anti-loop (v0.5.2):
 *  1. TIDAK ADA pemuatan ulang otomatis. WebView tidak pernah dimuat ulang
 *     sendiri oleh modul ini — hanya pengguna yang memicu reload.
 *  2. Peristiwa navigasi yang terlambat (masih melaporkan URL halaman lama
 *     tepat setelah pengguna mengetik alamat baru) diabaikan, bukan dipaksa
 *     kembali dengan loadUrl berulang.
 *  3. Pengalihan (redirect), tautan lintas-domain, dan navigasi SPA selalu
 *     diizinkan — itu bagian normal dari penjelajahan.
 */

import type { Tab } from '../types';
import { getWebView } from './refs';
import { isNewTabUrl } from './newtab';

const pendingLoads = new Map<string, string>();
const intents = new Map<string, { url: string; previous: string | null; at: number }>();
const probes = new Map<string, { token: string; timer: ReturnType<typeof setTimeout> }>();
const blankRecovered = new Map<string, number>();

/** Jendela singkat untuk menolak peristiwa navigasi basi setelah mengetik alamat. */
const INTENT_WINDOW_MS = 2500;
/** Jeda minimum antar pemulihan halaman kosong (jika benar-benar kosong). */
const BLANK_RECOVER_COOLDOWN_MS = 15000;
let freshId: string | null = null;
let blankHold = false;

export function canonicalUrl(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '').toLowerCase();
    let path = u.pathname || '/';
    if (path.length > 1 && path.endsWith('/')) {
      path = path.slice(0, -1);
    }
    return `${u.protocol}//${host}${path}${u.search}`;
  } catch {
    return url.trim().replace(/\/+$/, '');
  }
}

function sameUrl(a: string, b: string): boolean {
  if (!a || !b) {
    return false;
  }
  return canonicalUrl(a) === canonicalUrl(b);
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

/** Tab yang sudah ada tidak boleh diganti URL-nya oleh tab baru. */
export function lockTabUrls(_ids: string[]): void {
  // No-op sejak v0.5.2 — kunci URL global dulu menahan alamat yang diketik
  // pengguna di tab biasa. Pengamanan sekarang dilakukan per-tab oleh intent.
}

export function unlockTabUrl(_id: string | null | undefined): void {
  // No-op, disimpan untuk kompatibilitas pemanggil lama.
}

export function tabUrlLocked(_id: string | null | undefined): boolean {
  return false;
}

export function holdBlankTab(): void {
  blankHold = true;
}

export function releaseBlankTab(): void {
  blankHold = false;
}

export function blankTabHeld(): boolean {
  return blankHold;
}

export function noteFreshTab(id: string): void {
  freshId = id;
}

export function freshTabId(): string | null {
  return freshId;
}

export function clearFreshTab(id?: string): void {
  if (!id || freshId === id) {
    freshId = null;
  }
}

/** Catat bahwa tab ini sedang diarahkan ke URL baru oleh pengguna. */
export function commitNavigation(
  tabId: string,
  url: string,
  previous: string | null,
  _blocked: string[] = [],
): void {
  intents.set(tabId, {
    url,
    previous: previous && !isNewTabUrl(previous) && !sameUrl(previous, url) ? previous : null,
    at: Date.now(),
  });
  pendingLoads.set(tabId, url);
  blankRecovered.delete(tabId);
}

/** URL tujuan yang menunggu dimuat oleh WebView tab ini (sekali pakai). */
export function claimWebViewLoad(tabId: string): string | null {
  const url = pendingLoads.get(tabId) ?? null;
  if (url) {
    pendingLoads.delete(tabId);
  }
  return url;
}

export function pendingNavigationUrl(tabId: string): string | null {
  const intent = intents.get(tabId);
  if (!intent) {
    return null;
  }
  if (Date.now() - intent.at > INTENT_WINDOW_MS * 3) {
    intents.delete(tabId);
    return null;
  }
  return intent.url;
}

export function navigationEpoch(_tabId: string): number {
  // Selalu 0: WebView tidak pernah di-remount (remount = muat ulang paksa).
  return 0;
}

export function clearNavigationState(tabId: string): void {
  intents.delete(tabId);
  pendingLoads.delete(tabId);
  blankRecovered.delete(tabId);
  cancelBlankProbe(tabId);
}

/**
 * false = abaikan peristiwa navigasi ini.
 * Hanya menolak laporan basi dari halaman lama sesaat setelah navigasi baru.
 */
export function shouldApplyNavUrl(tabId: string, navUrl: string): boolean {
  if (!navUrl || navUrl === 'about:blank' || isNewTabUrl(navUrl)) {
    return false;
  }
  const intent = intents.get(tabId);
  if (!intent) {
    return true;
  }
  if (Date.now() - intent.at > INTENT_WINDOW_MS) {
    intents.delete(tabId);
    return true;
  }
  if (intent.previous && sameUrl(navUrl, intent.previous)) {
    // Peristiwa terlambat dari dokumen yang baru ditinggalkan — jangan timpa.
    return false;
  }
  intents.delete(tabId);
  return true;
}

/**
 * true = URL ini boleh disimpan untuk tab ini.
 *
 * Pengalihan, navigasi SPA, dan tautan lintas-domain tetap diizinkan.
 * Hanya laporan basi dari halaman sebelumnya yang diabaikan (tanpa memuat ulang).
 */
export function guardNavigation(
  tabId: string,
  navUrl: string,
  _expectedUrl: string,
  _foreignUrls: string[],
): boolean {
  return shouldApplyNavUrl(tabId, navUrl);
}

export function cancelBlankProbe(tabId: string): void {
  const probe = probes.get(tabId);
  if (!probe) {
    return;
  }
  clearTimeout(probe.timer);
  probes.delete(tabId);
}

/**
 * Tanya ke halaman apakah proses renderer-nya masih hidup.
 *
 * Tidak ada timer yang memuat ulang saat halaman diam — halaman lambat,
 * unduhan panjang, atau streaming tidak boleh diputus.
 */
export function probeBlankWebView(tabId: string, expectedUrl: string): void {
  if (!expectedUrl || isNewTabUrl(expectedUrl) || !/^https?:/i.test(expectedUrl)) {
    return;
  }
  const wv = getWebView(tabId);
  if (!wv) {
    return;
  }
  cancelBlankProbe(tabId);
  const token = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const timer = setTimeout(() => {
    if (probes.get(tabId)?.token === token) {
      probes.delete(tabId);
    }
  }, 3000);
  probes.set(tabId, { token, timer });
  const script =
    `(function(){try{var h=String(location.href||'');` +
    `var dead=!h||h==='about:blank'||h.indexOf('about:blank')===0;` +
    `if(window.ReactNativeWebView){window.ReactNativeWebView.postMessage(JSON.stringify({type:'zen:health',dead:dead,href:h,token:${JSON.stringify(token)}}));}` +
    `}catch(e){}})();true;`;
  try {
    (wv as any).injectJavaScript(script);
  } catch {
    cancelBlankProbe(tabId);
  }
}

/**
 * Hanya muat ulang bila halaman benar-benar kosong (renderer mati setelah
 * aplikasi lama di latar), dengan jeda agar tidak berulang.
 */
export function noteBlankProbeResult(
  tabId: string,
  token: string,
  dead: boolean,
  _href: string,
  expectedUrl: string,
): void {
  const probe = probes.get(tabId);
  if (!probe || probe.token !== token) {
    return;
  }
  clearTimeout(probe.timer);
  probes.delete(tabId);
  if (!dead || !expectedUrl || isNewTabUrl(expectedUrl) || !/^https?:/i.test(expectedUrl)) {
    return;
  }
  const now = Date.now();
  const last = blankRecovered.get(tabId) ?? 0;
  if (now - last < BLANK_RECOVER_COOLDOWN_MS) {
    return;
  }
  blankRecovered.set(tabId, now);
  forceWebViewLoad(getWebView(tabId), expectedUrl);
}

export function forceWebViewLoad(wv: any, url: string): void {
  if (!wv || !url) {
    return;
  }
  try {
    if (typeof wv.loadUrl === 'function') {
      wv.loadUrl(url);
      return;
    }
  } catch {
    // lanjut ke injeksi
  }
  try {
    wv.injectJavaScript?.(`location.replace(${JSON.stringify(url)});true;`);
  } catch {
    // webview sudah lepas
  }
}

export function otherTabUrls(
  tabs: { id: string; url: string }[],
  tabId: string,
  dest: string,
): string[] {
  const destKey = canonicalUrl(dest);
  const out: string[] = [];
  for (const t of tabs) {
    if (t.id === tabId || !t.url || isNewTabUrl(t.url)) {
      continue;
    }
    if (canonicalUrl(t.url) === destKey) {
      continue;
    }
    out.push(t.url);
  }
  return out;
}

export function beginTabNavigation(
  dispatch: (action: any) => void,
  tab: Pick<Tab, 'id' | 'url' | 'workspaceId'>,
  url: string,
  blocked: string[],
  _activeTabId: string | null,
): void {
  const target = url.trim();
  if (!target) {
    return;
  }
  releaseBlankTab();
  commitNavigation(tab.id, target, tab.url, blocked);
  const patch: Partial<Tab> = {
    url: target,
    title: '',
    loading: true,
    progress: 0.08,
  };
  if (isNewTabUrl(tab.url)) {
    patch.canGoBack = false;
    patch.canGoForward = false;
  }
  dispatch({ type: 'UPDATE_TAB', id: tab.id, patch });
  if (tab.workspaceId) {
    dispatch({ type: 'SET_ACTIVE_WORKSPACE', id: tab.workspaceId, tabId: tab.id });
  }
  dispatch({ type: 'SET_ACTIVE_TAB', id: tab.id });
  clearFreshTab(tab.id);
  const wv = getWebView(tab.id);
  if (wv) {
    const locked = claimWebViewLoad(tab.id);
    if (locked) {
      forceWebViewLoad(wv, locked);
    }
  }
  // Bila WebView-nya belum ter-mount (tab baru), intent tetap tersimpan dan
  // dimuat oleh setRef saat view muncul.
}

export { hostOf };
