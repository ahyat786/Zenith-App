package com.zenith.browser.webview

import android.view.View
import android.webkit.CookieManager
import android.webkit.WebSettings
import android.webkit.WebView
import java.util.Collections
import java.util.WeakHashMap

/**
 * Mode privat tanpa memanggil CookieManager.removeAllCookies().
 * Implementasi RN menghapus SEMUA kuki aplikasi lalu tetap memakai toples yang sama.
 * Di sini tab privat memakai profil WebView terpisah bila runtime mendukungnya.
 */
object ZenithPrivate {
    const val PROFILE = "ZenithPrivate"

    private val marked = Collections.newSetFromMap(WeakHashMap<WebView, Boolean>())

    fun apply(webView: WebView) {
        marked.add(webView)
        val settings = webView.settings
        settings.cacheMode = WebSettings.LOAD_NO_CACHE
        settings.saveFormData = false
        @Suppress("DEPRECATION")
        settings.savePassword = false
        webView.importantForAutofill = View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS
        try {
            webView.clearFormData()
            webView.clearHistory()
        } catch (_: Throwable) {
        }
        attachProfile(webView)
    }

    fun unmark(webView: WebView) {
        marked.remove(webView)
    }

    fun isPrivate(webView: WebView): Boolean = marked.contains(webView)

    fun supported(): Boolean {
        return try {
            val feature = Class.forName("androidx.webkit.WebViewFeature")
            val multi = feature.getField("MULTI_PROFILE").get(null) as String
            feature.getMethod("isFeatureSupported", String::class.java).invoke(null, multi) as Boolean
        } catch (_: Throwable) {
            false
        }
    }

    fun cookies(webView: WebView?, url: String): String? {
        if (webView != null && isPrivate(webView)) {
            profileCookie(url)?.let { return it }
            return null
        }
        return try {
            CookieManager.getInstance().getCookie(url)
        } catch (_: Throwable) {
            null
        }
    }

    /** Hapus sesi profil privat saja. Tidak menyentuh kuki tab normal. */
    fun clear() {
        try {
            val store = profileStore() ?: return
            val profile = store.javaClass.getMethod("getProfile", String::class.java).invoke(store, PROFILE)
                ?: return
            val cm = profile.javaClass.getMethod("getCookieManager").invoke(profile)
            cm?.javaClass
                ?.getMethod("removeAllCookies", android.webkit.ValueCallback::class.java)
                ?.invoke(cm, null)
            profile.javaClass.methods.firstOrNull { it.name == "getWebStorage" }?.invoke(profile)?.let { storage ->
                storage.javaClass.methods.firstOrNull { it.name == "deleteAllData" }?.invoke(storage)
            }
        } catch (_: Throwable) {
        }
    }

    private fun attachProfile(webView: WebView) {
        try {
            val feature = Class.forName("androidx.webkit.WebViewFeature")
            val multi = feature.getField("MULTI_PROFILE").get(null) as String
            val supported = feature.getMethod("isFeatureSupported", String::class.java).invoke(null, multi) as Boolean
            if (!supported) return
            val store = profileStore() ?: return
            store.javaClass.getMethod("getOrCreateProfile", String::class.java).invoke(store, PROFILE)
            Class.forName("androidx.webkit.WebViewCompat")
                .getMethod("setProfile", WebView::class.java, String::class.java)
                .invoke(null, webView, PROFILE)
        } catch (_: Throwable) {
        }
    }

    private fun profileCookie(url: String): String? {
        return try {
            val store = profileStore() ?: return null
            val profile = store.javaClass.getMethod("getProfile", String::class.java).invoke(store, PROFILE)
                ?: return null
            val cm = profile.javaClass.getMethod("getCookieManager").invoke(profile) ?: return null
            cm.javaClass.getMethod("getCookie", String::class.java).invoke(cm, url) as? String
        } catch (_: Throwable) {
            null
        }
    }

    private fun profileStore(): Any? {
        return try {
            Class.forName("androidx.webkit.ProfileStore").getMethod("getInstance").invoke(null)
        } catch (_: Throwable) {
            null
        }
    }
}
