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
 *
 * Profil utama (profile-utama) tetap di toples bawaan WebView. v0.4.4 memindahkan
 * semua tab ke ProfileStore "Zu…", sehingga kuki/akun yang sudah tersimpan
 * terlihat hilang setelah update. Profil tambahan dan mode privat tetap terpisah.
 */
object ZenithPrivate {
    const val PRIMARY_ID = "profile-utama"

    @Volatile
    var activeId: String = PRIMARY_ID

    private class Binding(
        val profileId: String,
        val incognito: Boolean,
        val systemJar: Boolean,
    )

    private val marked = Collections.newSetFromMap(WeakHashMap<WebView, Boolean>())
    private val bound = Collections.synchronizedMap(WeakHashMap<WebView, Binding>())
    private val wantedId = Collections.synchronizedMap(WeakHashMap<WebView, String>())

    fun setActive(id: String) {
        activeId = id.ifBlank { PRIMARY_ID }
    }

    fun isPrimary(id: String): Boolean {
        val v = id.ifBlank { PRIMARY_ID }
        return v == PRIMARY_ID || v == "utama"
    }

    fun nameFor(id: String, incognito: Boolean): String {
        val safe = id.replace(Regex("[^A-Za-z0-9]"), "").take(20).ifBlank { "utama" }
        return if (incognito) "Zp$safe" else "Zu$safe"
    }

    /** Profil milik tab ini, dari UA marker. Belum mengunci toples. */
    fun noteProfile(webView: WebView, profileId: String) {
        wantedId[webView] = profileId.ifBlank { activeId }
    }

    /**
     * Catat mode privat. Jangan setProfile di sini bila profil tab belum
     * diketahui — createViewInstance dulu akan mengunci toples yang salah.
     */
    fun bind(webView: WebView, incognito: Boolean) {
        if (incognito) {
            marked.add(webView)
        } else {
            marked.remove(webView)
        }
        val id = wantedId[webView] ?: bound[webView]?.profileId
        if (id != null) {
            apply(webView, id, incognito)
        }
    }

    fun hasProfileHint(webView: WebView): Boolean = wantedId[webView] != null

    /** Pastikan toples yang benar terpasang sebelum permintaan pertama. */
    fun ensureBeforeLoad(webView: WebView) {
        val id = wantedId[webView] ?: bound[webView]?.profileId ?: activeId
        val incognito = isPrivate(webView)
        apply(webView, id, incognito)
    }

    private fun apply(webView: WebView, profileId: String, incognito: Boolean) {
        val id = profileId.ifBlank { activeId }
        val systemJar = !incognito && isPrimary(id)
        val existing = bound[webView]
        if (
            existing != null &&
            existing.profileId == id &&
            existing.incognito == incognito &&
            existing.systemJar == systemJar
        ) {
            return
        }
        if (existing != null && !existing.systemJar && systemJar) {
            return
        }
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
        if (!systemJar && !attach(webView, nameFor(id, incognito))) {
            if (incognito) {
                bound[webView] = Binding(id, true, false)
            }
            return
        }
        bound[webView] = Binding(id, incognito, systemJar)
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
        if (binding != null && !binding.systemJar) {
            val name = nameFor(binding.profileId, binding.incognito)
            profileCookie(name, url)?.let { return it }
            if (binding.incognito) {
                return null
            }
        }
        return try {
            CookieManager.getInstance().getCookie(url)
        } catch (_: Throwable) {
            null
        }
    }

    fun flush() {
        try {
            CookieManager.getInstance().flush()
        } catch (_: Throwable) {
        }
    }

    /**
     * Salin kuki yang hanya ada di toples Zu profil utama (v0.4.4) ke toples
     * bawaan, bila URL itu belum punya kuki. Tidak menimpa kuki yang sudah ada.
     */
    fun importMissingCookies(profileName: String, urls: List<String>) {
        val cm = CookieManager.getInstance()
        try {
            cm.setAcceptCookie(true)
        } catch (_: Throwable) {
        }
        for (url in urls) {
            if (!url.startsWith("http://") && !url.startsWith("https://")) {
                continue
            }
            val already = try {
                cm.getCookie(url)
            } catch (_: Throwable) {
                null
            }
            if (!already.isNullOrBlank()) {
                continue
            }
            val raw = profileCookie(profileName, url) ?: continue
            for (part in raw.split(';')) {
                val cookie = part.trim()
                if (!cookie.contains('=')) {
                    continue
                }
                try {
                    cm.setCookie(url, cookie)
                } catch (_: Throwable) {
                }
            }
        }
        flush()
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

    private fun attach(webView: WebView, name: String): Boolean {
        return try {
            if (!supported()) {
                return false
            }
            val store = profileStore() ?: return false
            store.javaClass.getMethod("getOrCreateProfile", String::class.java).invoke(store, name)
            Class.forName("androidx.webkit.WebViewCompat")
                .getMethod("setProfile", WebView::class.java, String::class.java)
                .invoke(null, webView, name)
            true
        } catch (_: Throwable) {
            false
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
