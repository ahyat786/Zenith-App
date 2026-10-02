package com.zenith.browser.webview

import android.os.Build
import android.webkit.WebSettings
import androidx.webkit.WebSettingsCompat
import androidx.webkit.WebViewFeature
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.uimanager.ThemedReactContext
import com.reactnativecommunity.webview.RNCWebViewManager
import com.reactnativecommunity.webview.RNCWebViewWrapper
import com.zenith.browser.downloads.DownloadBus

/**
 * Manager WebView Zenith — nama komponen tetap "RNCWebView", klien dan
 * unduhan diganti, mode privat tidak menghapus kuki tab normal.
 *
 * PERBAIKAN v0.5.2 — penyebab "tab aktif refresh terus menerus":
 *
 *  RNCWebViewManager menyimpan `mPendingSource`, `mUserAgent`, dan
 *  `mUserAgentWithApplicationName` pada SATU objek impl bersama, lalu
 *  memprosesnya sinkron di `onAfterUpdateTransaction(view)`.
 *
 *  Versi lama menunda `super.setNewSource()` di dalam `view.post { ... }`.
 *  Akibatnya `mPendingSource` milik WebView A tertinggal dan ikut diproses
 *  ulang untuk WebView B (view daur ulang / re-render berikutnya), sehingga
 *  `loadSource` memanggil `loadUrl` berulang tanpa henti — halaman tampak
 *  me-refresh sendiri di tab yang sedang dibuka, dan URL tab lain ikut
 *  tersalin. Sekarang semuanya dijalankan sinkron + idempoten:
 *
 *   1. Tidak ada penundaan `view.post` sebelum `super.setNewSource`.
 *   2. URI awal yang sama tidak pernah dimuat ulang (tag per-view).
 *   3. UA (per-situs, mode desktop) disimpan per-view, bukan di field bersama.
 *   4. Tidak pernah menyembunyikan / menghentikan WebView tab lain.
 */
class ZenithWebViewManager : RNCWebViewManager() {

    companion object {
        private const val TAG_LAST_SOURCE_URI = 0x5e417010
        private const val TAG_CUSTOM_UA = 0x5e417011
        private const val TAG_APP_NAME_UA = 0x5e417012
        private const val FALLBACK_APP_VERSION = "Zenith/0.8.0"
        private val REGEX_MARKER = Regex("\\s(?:zp|zt):")
        private val REGEX_PROFILE = Regex("zp:([^\\s]+)")
        private val REGEX_TAB = Regex("zt:([^\\s]+)")
    }

    override fun getName(): String = "RNCWebView"

    /**
     * Jangan panggil super.setIncognito(true). RNCWebViewManagerImpl
     * menjalankan CookieManager.removeAllCookies() pada toples global,
     * lalu tab privat tetap berbagi kuki dengan tab biasa.
     */
    override fun createViewInstance(reactContext: ThemedReactContext): RNCWebViewWrapper {
        val view = super.createViewInstance(reactContext)
        // State tersimpan Android bisa mengembalikan URL tanpa isi.
        view.webView.setSaveEnabled(false)
        view.webView.setSaveFromParentEnabled(false)
        enableSafeBrowsing(view.webView)
        return view
    }

    /**
     * Safe Browsing — praktik keamanan resmi WebView (Android Developers →
     * Membangun aplikasi web di WebView, "Menangani navigasi halaman").
     * Fitur ini aktif secara default pada WebView modern, tetapi dipanggil
     * eksplisit agar perangkat lama ikut terlindungi.
     */
    private fun enableSafeBrowsing(webView: android.webkit.WebView) {
        try {
            if (WebViewFeature.isFeatureSupported(WebViewFeature.SAFE_BROWSING_ENABLE)) {
                WebSettingsCompat.setSafeBrowsingEnabled(webView.settings, true)
            }
        } catch (_: Throwable) {
            // perangkat sangat lama — abaikan
        }
    }

    /**
     * Mode gelap konten web.
     *
     * Versi bawaan react-native-webview memakai WebSettingsCompat.setForceDark
     * (usang sejak Android 13). Bila perangkat mendukung, Zenith memakai
     * "algorithmic darkening" Jetpack Webkit — API pengganti resmi dari
     * AndroidX Webkit (developer.android.com/develop/ui/views/layout/webapps/webview).
     */
    override fun setForceDarkOn(view: RNCWebViewWrapper, enabled: Boolean) {
        val webView = view.webView
        try {
            if (WebViewFeature.isFeatureSupported(WebViewFeature.ALGORITHMIC_DARKENING)) {
                WebSettingsCompat.setAlgorithmicDarkeningAllowed(webView.settings, enabled)
                return
            }
            if (Build.VERSION.SDK_INT > Build.VERSION_CODES.P &&
                WebViewFeature.isFeatureSupported(WebViewFeature.FORCE_DARK)
            ) {
                // Perangkat Android 10–12: pakai force-dark lama.
                WebSettingsCompat.setForceDark(
                    webView.settings,
                    if (enabled) WebSettingsCompat.FORCE_DARK_ON else WebSettingsCompat.FORCE_DARK_OFF
                )
                if (enabled && WebViewFeature.isFeatureSupported(WebViewFeature.FORCE_DARK_STRATEGY)) {
                    WebSettingsCompat.setForceDarkStrategy(
                        webView.settings,
                        WebSettingsCompat.DARK_STRATEGY_WEB_THEME_DARKENING_ONLY
                    )
                }
            }
        } catch (_: Throwable) {
            // biarkan WebView memakai perilaku bawaan
        }
    }

    override fun setIncognito(view: RNCWebViewWrapper, value: Boolean) {
        ZenithPrivate.bind(view.webView, value)
    }

    /** UA kustom per tab (mode desktop per-situs). Jangan lewat field bersama impl. */
    override fun setUserAgent(view: RNCWebViewWrapper, value: String?) {
        view.webView.setTag(TAG_CUSTOM_UA, value?.takeIf { it.isNotBlank() })
        applyUserAgent(view)
    }

    /**
     * Penanda profil pada UA (` zp:`) dipakai untuk mengikat toples kuki tab ini.
     * Nilai UA disimpan per-view agar tab lain tidak mewarisinya.
     */
    override fun setApplicationNameForUserAgent(view: RNCWebViewWrapper, value: String?) {
        val raw = value ?: ""
        // Penanda: " zp:<profileId>" (toples kuki) dan " zt:<tabId>"
        // (histori saveState/restoreState per tab). Nama aplikasi = teks
        // sebelum penanda pertama.
        val firstMarker = REGEX_MARKER.find(raw)?.range?.first
        val base = if (firstMarker != null) raw.substring(0, firstMarker).trim() else raw.trim()
        view.webView.setTag(TAG_APP_NAME_UA, base.ifEmpty { FALLBACK_APP_VERSION })
        REGEX_PROFILE.find(raw)?.groupValues?.getOrNull(1)?.takeIf { it.isNotBlank() }?.let {
            ZenithPrivate.noteProfile(view.webView, it)
        }
        REGEX_TAB.find(raw)?.groupValues?.getOrNull(1)?.takeIf { it.isNotBlank() }?.let {
            ZenithTabState.noteTab(view.webView, it)
        }
        applyUserAgent(view)
    }

    private fun applyUserAgent(view: RNCWebViewWrapper) {
        val customUa = view.webView.getTag(TAG_CUSTOM_UA) as? String
        val appName = view.webView.getTag(TAG_APP_NAME_UA) as? String
        val defaultUa = try {
            WebSettings.getDefaultUserAgent(view.webView.context)
        } catch (_: Throwable) {
            ""
        }
        val targetUa = when {
            !customUa.isNullOrBlank() -> customUa
            !appName.isNullOrBlank() -> "$defaultUa $appName".trim()
            else -> defaultUa
        }
        if (targetUa.isBlank()) {
            return
        }
        try {
            if (view.webView.settings.userAgentString != targetUa) {
                view.webView.settings.userAgentString = targetUa
            }
        } catch (_: Throwable) {
        }
    }

    /**
     * Sinkron. Jangan dibungkus `view.post` — lihat catatan kelas.
     * URI awal yang sama hanya dimuat sekali; sesudah itu navigasi di dalam
     * halaman (redirect, SPA) dibiarkan hidup tanpa dimuat ulang.
     */
    override fun setNewSource(view: RNCWebViewWrapper, source: ReadableMap?) {
        view.webView.translationX = 0f
        view.webView.alpha = 1f
        view.webView.visibility = android.view.View.VISIBLE
        val uri = try {
            if (source != null && source.hasKey("uri")) source.getString("uri") else null
        } catch (_: Throwable) {
            null
        }
        if (!uri.isNullOrBlank() && (uri == "about:blank" || uri.startsWith("zenith:"))) {
            return
        }
        if (!uri.isNullOrBlank() && uri == view.webView.getTag(TAG_LAST_SOURCE_URI)) {
            // Sumber awal sudah pernah dimuat untuk view ini — biarkan halaman
            // berjalan (jangan reload) meski komponen di-render ulang.
            return
        }
        if (!uri.isNullOrBlank()) {
            view.webView.setTag(TAG_LAST_SOURCE_URI, uri)
            view.webView.setTag(ZenithWebViewClient.EXPECTED_URL, uri)
        }
        ZenithPrivate.ensureBeforeLoad(view.webView)
        applyUserAgent(view)
        super.setNewSource(view, source)
    }

    /** Muat URL baru dari sisi JS (omnibox, tautan, pemulihan halaman putih). */
    override fun loadUrl(view: RNCWebViewWrapper, url: String) {
        view.webView.translationX = 0f
        view.webView.alpha = 1f
        view.webView.visibility = android.view.View.VISIBLE
        view.webView.setTag(TAG_LAST_SOURCE_URI, url)
        ZenithPrivate.ensureBeforeLoad(view.webView)
        applyUserAgent(view)
        super.loadUrl(view, url)
    }

    override fun onDropViewInstance(view: RNCWebViewWrapper) {
        try {
            // Simpan histori tab ini sebelum WebView dilepas, supaya pindah
            // tab / buka ulang tidak mengulang dari nol (saveState resmi).
            ZenithTabState.save(view.webView, view.webView.context.applicationContext ?: view.webView.context)
            view.webView.stopLoading()
            view.webView.onPause()
        } catch (_: Throwable) {
        }
        super.onDropViewInstance(view)
    }

    override fun addEventEmitters(reactContext: ThemedReactContext, view: RNCWebViewWrapper) {
        super.addEventEmitters(reactContext, view)
        view.webView.setWebViewClient(ZenithWebViewClient())
        view.webView.setDownloadListener { url, userAgent, contentDisposition, mimetype, contentLength ->
            DownloadBus.request(view.webView, url, userAgent, contentDisposition, mimetype, contentLength)
        }
    }
}
