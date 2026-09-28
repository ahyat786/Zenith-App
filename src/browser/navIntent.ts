/**
 * Navigasi yang disengaja (omnibox / pintasan tab baru).
 *
 * WebView yang sudah terpasang tidak mengikuti perubahan `tab.url`, dan
 * peristiwa navigasi dari halaman sebelumnya bisa menimpa URL yang baru
 * diketik. Catatan ini mengunci tujuan sampai halaman itu benar-benar termuat.
 */

import type { Tab } from '../types';
import { getWebView } from './refs';
import { isNewTabUrl } from './newtab';

const probes = new Map<string, { token: string; timer: ReturnType<typeof setTimeout> }>();

export function cancelBlankProbe(tabId: string): void {
  const probe = probes.get(tabId);
  if (!probe) {
    return;
  }
  clearTimeout(probe.timer);
  probes.delete(tabId);
}

/** Renderer mati setelah aplikasi lama di latar: inject tidak menjawab, atau href masih about:blank. */
export function probeBlankWebView(tabId: string, expectedUrl: string): void {
  if (!expectedUrl || isNewTabUrl(expectedUrl) || !/^https?:/i.test(expectedUrl)) {
    return;
  }
  if (pendingNavigationUrl(tabId)) {
    return;
  }
  const wv = getWebView(tabId);
  if (!wv) {
    return;
  }
  cancelBlankProbe(tabId);
  const token = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const timer = setTimeout(() => {
    if (probes.get(tabId)?.token !== token) {
      return;
    }
    probes.delete(tabId);
    forceWebViewLoad(getWebView(tabId), expectedUrl);
  }, 2200);
  probes.set(tabId, { token, timer });
  const script =
    `(function(){try{var h=String(location.href||'');` +
    `try{window.scrollBy(0,1);window.scrollBy(0,-1);}catch(e){}` +
    `var dead=!h||h==='about:blank'||h.indexOf('about:blank')===0;` +
    `if(window.ReactNativeWebView){window.ReactNativeWebView.postMessage(JSON.stringify({type:'zen:health',dead:dead,href:h,token:${JSON.stringify(token)}}));}` +
    `}catch(e){}})();true;`;
  try {
    (wv as any).injectJavaScript(script);
  } catch {
    cancelBlankProbe(tabId);
    forceWebViewLoad(wv, expectedUrl);
  }
}

export function noteBlankProbeResult(tabId: string, token: string, dead: boolean, expectedUrl: string): void {
  const probe = probes.get(tabId);
  if (!probe || probe.token !== token) {
    return;
  }
  clearTimeout(probe.timer);
  probes.delete(tabId);
  if (dead) {
    forceWebViewLoad(getWebView(tabId), expectedUrl);
  }
}

interface Intent {
  url: string;
  previous: string | null;
  blocked: string[];
  started: boolean;
  dispatched: boolean;
  startedAt: number;
  at: number;
}

const intents = new Map<string, Intent>();
let freshId: string | null = null;

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
    return url.trim().replace(/\/$/, '');
  }
}

function sameUrl(a: string, b: string): boolean {
  return canonicalUrl(a) === canonicalUrl(b);
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
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

export function commitNavigation(
  tabId: string,
  url: string,
  previous: string | null,
  blocked: string[] = [],
): void {
  intents.set(tabId, {
    url,
    previous: previous && !isNewTabUrl(previous) ? previous : null,
    blocked: blocked.filter((u) => u && !isNewTabUrl(u) && canonicalUrl(u) !== canonicalUrl(url)),
    started: false,
    dispatched: false,
    startedAt: 0,
    at: Date.now(),
  });
}

function matchesBlocked(intent: Intent, navUrl: string): boolean {
  if (intent.previous && sameUrl(navUrl, intent.previous)) {
    return true;
  }
  return intent.blocked.some((u) => sameUrl(navUrl, u));
}

/** false = abaikan peristiwa ini. Jangan timpa URL yang baru diketik. */
export function shouldApplyNavUrl(tabId: string, navUrl: string): boolean {
  const intent = intents.get(tabId);
  if (!intent) {
    return true;
  }
  if (!navUrl || navUrl === 'about:blank' || isNewTabUrl(navUrl)) {
    return false;
  }
  if (Date.now() - intent.at > 8000) {
    intents.delete(tabId);
    return !matchesBlocked(intent, navUrl);
  }
  if (sameUrl(navUrl, intent.url)) {
    intents.delete(tabId);
    return true;
  }
  if (matchesBlocked(intent, navUrl)) {
    return false;
  }
  if (!intent.started) {
    return false;
  }
  const startedFor = Date.now() - (intent.startedAt || intent.at);
  if (hostOf(navUrl) === hostOf(intent.url) || startedFor > 1500) {
    intents.delete(tabId);
    return true;
  }
  return false;
}

export function claimWebViewLoad(tabId: string): string | null {
  const intent = intents.get(tabId);
  if (!intent || intent.dispatched) {
    return null;
  }
  intent.dispatched = true;
  intent.started = true;
  intent.startedAt = Date.now();
  return intent.url;
}

export function pendingNavigationUrl(tabId: string): string | null {
  return intents.get(tabId)?.url ?? null;
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

export function beginTabNavigation(
  dispatch: (action: any) => void,
  tab: Pick<Tab, 'id' | 'url'>,
  url: string,
  blocked: string[],
  activeTabId: string | null,
): void {
  commitNavigation(tab.id, url, tab.url, blocked);
  const patch: Partial<Tab> = {
    url,
    title: '',
    loading: true,
    progress: 0.08,
  };
  if (isNewTabUrl(tab.url)) {
    patch.canGoBack = false;
    patch.canGoForward = false;
  }
  dispatch({ type: 'UPDATE_TAB', id: tab.id, patch });
  if (activeTabId !== tab.id) {
    dispatch({ type: 'SET_ACTIVE_TAB', id: tab.id });
  }
  clearFreshTab(tab.id);
  const wv = getWebView(tab.id);
  if (wv) {
    const locked = claimWebViewLoad(tab.id);
    if (locked) {
      forceWebViewLoad(wv, locked);
    }
  }
}
