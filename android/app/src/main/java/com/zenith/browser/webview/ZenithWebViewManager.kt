package com.zenith.browser.webview

import com.facebook.react.bridge.ReadableMap
import com.facebook.react.uimanager.ThemedReactContext
import com.reactnativecommunity.webview.RNCWebViewManager
import com.reactnativecommunity.webview.RNCWebViewWrapper
import com.zenith.browser.downloads.DownloadBus

/**
 * Manager WebView Zenith — nama komponen tetap "RNCWebView",
 * tetapi klien dan unduhan diganti, dan mode privat tidak menghapus
 * kuki tab normal.
 */
class ZenithWebViewManager : RNCWebViewManager() {

    override fun getName(): String = "RNCWebView"

    /**
     * Jangan panggil super. RNCWebViewManagerImpl.setIncognito(true)
     * menjalankan CookieManager.removeAllCookies() pada toples global,
     * lalu tab privat tetap berbagi kuki dengan tab biasa.
     */
    override fun setIncognito(view: RNCWebViewWrapper, value: Boolean) {
        if (value) {
            ZenithPrivate.apply(view.webView)
        } else {
            ZenithPrivate.unmark(view.webView)
        }
    }

    /**
     * Tunda muat satu putaran UI agar setIncognito sempat memasang profil
     * sebelum permintaan pertama. Tanpa ini, source bisa memuat di toples kuki normal.
     */
    override fun setNewSource(view: RNCWebViewWrapper, source: ReadableMap?) {
        view.webView.post {
            if (ZenithPrivate.isPrivate(view.webView)) {
                ZenithPrivate.apply(view.webView)
            }
            loadSource(view, source)
        }
    }

    private fun loadSource(view: RNCWebViewWrapper, source: ReadableMap?) {
        super.setNewSource(view, source)
    }

    override fun addEventEmitters(reactContext: ThemedReactContext, view: RNCWebViewWrapper) {
        super.addEventEmitters(reactContext, view)
        view.webView.setWebViewClient(ZenithWebViewClient())
        view.webView.setDownloadListener { url, userAgent, contentDisposition, mimetype, contentLength ->
            DownloadBus.request(view.webView, url, userAgent, contentDisposition, mimetype, contentLength)
        }
    }
}
