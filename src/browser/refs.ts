import type { WebView } from 'react-native-webview';

/** Registry WebView per tab id — dipakai untuk goBack/goReload/inject. */
export const webviewRefs = new Map<string, WebView | null>();

export function getWebView(tabId: string | null | undefined): WebView | null {
  if (!tabId) {
    return null;
  }
  return webviewRefs.get(tabId) ?? null;
}
