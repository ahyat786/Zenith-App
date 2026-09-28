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
    override fun createViewInstance(reactContext: ThemedReactContext): RNCWebViewWrapper {
        // Jangan setProfile di sini. Profil tab belum diketahui, dan profil
        // utama harus tetap di toples bawaan supaya akun tidak hilang.
        val view = super.createViewInstance(reactContext)
        // State tersimpan Android bisa mengembalikan URL tanpa isi. RN lalu
        // melewatkan loadUrl karena URL-nya sama, dan tab terbuka putih.
        view.webView.setSaveEnabled(false)
        view.webView.setSaveFromParentEnabled(false)
        return view
    }

    override fun setIncognito(view: RNCWebViewWrapper, value: Boolean) {
        ZenithPrivate.bind(view.webView, value)
    }

    override fun setApplicationNameForUserAgent(view: RNCWebViewWrapper, value: String?) {
        val raw = value ?: ""
        val marker = " zp:"
        val idx = raw.lastIndexOf(marker)
        if (idx >= 0) {
            ZenithPrivate.noteProfile(view.webView, raw.substring(idx + marker.length).trim())
            val ua = raw.substring(0, idx).trim()
            super.setApplicationNameForUserAgent(view, if (ua.isEmpty()) "Zenith/0.4.9" else ua)
        } else {
            super.setApplicationNameForUserAgent(view, value)
        }
    }

    /**
     * Tunda muat satu putaran UI agar profil tab dan mode privat terpasang
     * sebelum permintaan pertama. Profil utama tidak dipindah ke ProfileStore.
     */
    override fun setNewSource(view: RNCWebViewWrapper, source: ReadableMap?) {
        view.webView.translationX = 0f
        view.webView.alpha = 1f
        view.webView.visibility = android.view.View.VISIBLE
        view.webView.post {
            if (!ZenithPrivate.hasProfileHint(view.webView)) {
                view.webView.post {
                    ZenithPrivate.ensureBeforeLoad(view.webView)
                    loadSource(view, source)
                }
                return@post
            }
            ZenithPrivate.ensureBeforeLoad(view.webView)
            loadSource(view, source)
        }
    }

    override fun onDropViewInstance(view: RNCWebViewWrapper) {
        try {
            view.webView.stopLoading()
            view.webView.onPause()
        } catch (_: Throwable) {
        }
        super.onDropViewInstance(view)
    }

    private fun loadSource(view: RNCWebViewWrapper, source: ReadableMap?) {
        val uri = try {
            if (source != null && source.hasKey("uri")) source.getString("uri") else null
        } catch (_: Throwable) {
            null
        }
        if (!uri.isNullOrBlank() && uri != "about:blank" && !uri.startsWith("zenith:")) {
            view.webView.setTag(ZenithWebViewClient.EXPECTED_URL, uri)
        }
        super.setNewSource(view, source)
        if (uri.isNullOrBlank() || uri == "about:blank" || uri.startsWith("zenith:")) {
            return
        }
        // Sekali per URL. Mengulang loadUrl setiap navigasi membuat refresh berputar terus.
        val forced = view.webView.getTag(ZenithWebViewClient.FORCED_URI) as? String
        if (forced == uri) {
            return
        }
        view.webView.setTag(ZenithWebViewClient.FORCED_URI, uri)
        val current = try {
            view.webView.url
        } catch (_: Throwable) {
            null
        }
        if (!current.isNullOrBlank() && current != uri) {
            try {
                view.webView.loadUrl(uri)
            } catch (_: Throwable) {
            }
        }
    }

    override fun addEventEmitters(reactContext: ThemedReactContext, view: RNCWebViewWrapper) {
        super.addEventEmitters(reactContext, view)
        view.webView.setWebViewClient(ZenithWebViewClient())
        view.webView.setDownloadListener { url, userAgent, contentDisposition, mimetype, contentLength ->
            DownloadBus.request(view.webView, url, userAgent, contentDisposition, mimetype, contentLength)
        }
    }
}
