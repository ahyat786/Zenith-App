package com.zenith.browser.webview

import android.os.Build
import android.view.View
import android.webkit.CookieManager
import android.webkit.WebSettings
import android.webkit.WebView
import java.util.Collections
import java.util.WeakHashMap

/**
 * Profil browser terpisah + mode privat.
 * Tidak memanggil CookieManager.removeAllCookies() pada toples global.
 * Setiap profil Zenith memakai ProfileStore sendiri bila WebView mendukungnya.
 */
object ZenithPrivate {
    @Volatile
    var activeId: String = "profile-utama"

    private class Binding(val profileId: String, val incognito: Boolean)

    private val marked = Collections.newSetFromMap(WeakHashMap<WebView, Boolean>())
    private val bound = Collections.synchronizedMap(WeakHashMap<WebView, Binding>())

    fun setActive(id: String) {
        activeId = id.ifBlank { "utama" }
    }

    fun nameFor(id: String, incognito: Boolean): String {
        val safe = id.replace(Regex("[^A-Za-z0-9]"), "").take(20).ifBlank { "utama" }
        return if (incognito) "Zp$safe" else "Zu$safe"
    }

    /** Ikat WebView ke profil aktif. Dipanggil sekali sebelum halaman dimuat. */
    fun bind(webView: WebView, incognito: Boolean) {
        val existing = bound[webView]
        val profileId = existing?.profileId ?: activeId
        if (existing != null && existing.incognito == incognito) {
            return
        }
        bound[webView] = Binding(profileId, incognito)
        val name = nameFor(profileId, incognito)
        val settings = webView.settings
        settings.domStorageEnabled = true
        if (Build.VERSION.SDK_INT >= 26) {
            webView.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, true)
        }
        if (incognito) {
            marked.add(webView)
            settings.cacheMode = WebSettings.LOAD_NO_CACHE
            settings.saveFormData = false
            @Suppress("DEPRECATION")
            settings.savePassword = false
            webView.importantForAutofill = View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS
        } else {
            marked.remove(webView)
            settings.cacheMode = WebSettings.LOAD_DEFAULT
        }
        attach(webView, name)
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
        val binding = webView?.let { bound[it] }
        val name = binding?.let { nameFor(it.profileId, it.incognito) }
        if (!name.isNullOrBlank()) {
            profileCookie(name, url)?.let { return it }
            if (isPrivate(webView)) {
                return null
            }
        }
        return try {
            CookieManager.getInstance().getCookie(url)
        } catch (_: Throwable) {
            null
        }
    }

    /** Hapus sesi privat profil yang sedang aktif. Tidak menyentuh profil lain. */
    fun clear() {
        clearNamed(nameFor(activeId, true))
    }

    fun clearNamed(name: String) {
        try {
            val store = profileStore() ?: return
            val profile = store.javaClass.getMethod("getProfile", String::class.java).invoke(store, name) ?: return
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

    private fun attach(webView: WebView, name: String) {
        try {
            if (!supported()) {
                return
            }
            val store = profileStore() ?: return
            store.javaClass.getMethod("getOrCreateProfile", String::class.java).invoke(store, name)
            Class.forName("androidx.webkit.WebViewCompat")
                .getMethod("setProfile", WebView::class.java, String::class.java)
                .invoke(null, webView, name)
        } catch (_: Throwable) {
        }
    }

    private fun profileCookie(name: String, url: String): String? {
        return try {
            val store = profileStore() ?: return null
            val profile = store.javaClass.getMethod("getProfile", String::class.java).invoke(store, name) ?: return null
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
