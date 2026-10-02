package com.zenith.browser.core

import android.content.ComponentName
import android.os.Handler
import android.os.Looper
import android.content.Intent
import android.provider.Settings
import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import androidx.appcompat.app.AppCompatDelegate
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.module.annotations.ReactModule
import java.io.File

/**
 * Modul React Native "ZenithCore" — membungkus ZenithCoreJNI (Rust)
 * menjadi Promise agar bisa dipanggil dari sisi TypeScript.
 *
 * Bila libzenith_core.so tidak tersedia, setiap metode mengembalikan
 * null/false dan sisi JS memakai implementasi fallback murni-TS.
 */
@ReactModule(name = ZenithCoreModule.NAME)
class ZenithCoreModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "ZenithCore"
    }

    init {
        // Ikuti daur hidup aktivitas agar pemantau inset selalu menempel pada
        // decorView yang benar setelah rotasi atau perubahan tema.
        reactApplicationContext.addLifecycleEventListener(object : LifecycleEventListener {
            override fun onHostResume() {
                ZenithSystemBars.bind(reactApplicationContext)
                ZenithSystemBars.attach(reactApplicationContext.currentActivity)
            }

            override fun onHostPause() {}

            override fun onHostDestroy() {}
        })
    }

    override fun getName(): String = NAME

    private inline fun <T> guard(promise: Promise, fallback: T, block: () -> T) {
        try {
            promise.resolve(if (ZenithCoreJNI.available) block() else fallback)
        } catch (t: Throwable) {
            promise.reject("ZENITH_CORE", t.message ?: t.toString(), t)
        }
    }

    @ReactMethod
    fun coreVersion(promise: Promise) =
        guard(promise, null as String?) { ZenithCoreJNI.coreVersion() }

    @ReactMethod
    fun parseUserScript(src: String, promise: Promise) =
        guard(promise, null as String?) { ZenithCoreJNI.parseUserScript(src) }

    @ReactMethod
    fun matchUserScript(metaJson: String, url: String, promise: Promise) =
        guard(promise, false) { ZenithCoreJNI.matchUserScript(metaJson, url) }

    @ReactMethod
    fun parseExtensionManifest(manifestJson: String, promise: Promise) =
        guard(promise, null as String?) { ZenithCoreJNI.parseExtensionManifest(manifestJson) }

    @ReactMethod
    fun extensionScriptsFor(extJson: String, url: String, runAt: String, promise: Promise) =
        guard(promise, null as String?) { ZenithCoreJNI.extensionScriptsFor(extJson, url, runAt) }

    @ReactMethod
    fun adblockInit(hosts: String, mode: String, promise: Promise) =
        guard(promise, null as String?) { ZenithCoreJNI.adblockInit(hosts, mode) }

    @ReactMethod
    fun adblockSetEnabled(enabled: Boolean, promise: Promise) =
        guard(promise, Unit) { ZenithCoreJNI.adblockSetEnabled(enabled) }

    @ReactMethod
    fun adblockAllowHost(host: String, allow: Boolean, promise: Promise) =
        guard(promise, Unit) { ZenithCoreJNI.adblockAllowHost(host, allow) }

    @ReactMethod
    fun adblockStats(promise: Promise) =
        guard(promise, null as String?) { ZenithCoreJNI.adblockStats() }

    @ReactMethod
    fun adblockResetStats(promise: Promise) =
        guard(promise, Unit) { ZenithCoreJNI.adblockResetStats() }

    @ReactMethod
    fun adblockConnectionLog(promise: Promise) =
        guard(promise, null as String?) { ZenithCoreJNI.adblockConnectionLog() }

    @ReactMethod
    fun adblockClearConnectionLog(promise: Promise) =
        guard(promise, Unit) { ZenithCoreJNI.adblockClearConnectionLog() }

    @ReactMethod
    fun adblockNoteRequest(url: String, promise: Promise) =
        guard(promise, Unit) { ZenithCoreJNI.adblockNoteRequest(url) }

    @ReactMethod
    fun adblockShouldBlock(url: String, promise: Promise) =
        guard(promise, false) { ZenithCoreJNI.adblockShouldBlock(url) }

    @ReactMethod
    fun dohResolve(url: String, name: String, timeoutMs: Int, promise: Promise) {
        // Murni OkHttp (HTTP/2) — tidak bergantung libzenith_core.so.
        try {
            promise.resolve(ZenithDoh.resolve(url, name, timeoutMs))
        } catch (t: Throwable) {
            promise.reject("ZENITH_DOH", t.message ?: t.toString(), t)
        }
    }

    @ReactMethod
    fun normalizeInput(input: String, searchTemplate: String, promise: Promise) =
        guard(promise, null as String?) { ZenithCoreJNI.normalizeInput(input, searchTemplate) }

    @ReactMethod
    fun expandSearch(template: String, query: String, promise: Promise) =
        guard(promise, null as String?) { ZenithCoreJNI.expandSearch(template, query) }

    @ReactMethod
    fun hostOf(url: String, promise: Promise) =
        guard(promise, null as String?) { ZenithCoreJNI.hostOf(url) }

    /**
     * Buka layar Pengaturan DNS Privat Android (DoT) — untuk mengaktifkan
     * DNS terenkripsi (mis. dns.adguard.com) tanpa VPN.
     */
    @ReactMethod
    fun openPrivateDnsSettings(promise: Promise) {
        val ctx = reactApplicationContext
        fun tryStart(intent: Intent): Boolean = try {
            ctx.startActivity(intent)
            true
        } catch (_: Throwable) {
            false
        }
        val opened = tryStart(
            Intent().setComponent(
                ComponentName("com.android.settings", "com.android.settings.Settings\$PrivateDnsSettingActivity"),
            ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        ) || tryStart(Intent(Settings.ACTION_WIRELESS_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) ||
            tryStart(Intent(Settings.ACTION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        promise.resolve(opened)
    }

    /** true bila WebView perangkat bisa memisahkan profil kuki tab privat. */
    @ReactMethod
    fun privateProfileSupported(promise: Promise) {
        promise.resolve(com.zenith.browser.webview.ZenithPrivate.supported())
    }

    /** Hapus sesi profil privat saja. Tidak menyentuh kuki tab normal. */
    @ReactMethod
    fun clearPrivateSession(promise: Promise) {
        com.zenith.browser.webview.ZenithPrivate.clear()
        promise.resolve(true)
    }

    /** Profil browser yang dipakai WebView baru. Tab lama tetap di profilnya. */
    @ReactMethod
    fun setActiveBrowserProfile(profileId: String, promise: Promise) {
        com.zenith.browser.webview.ZenithPrivate.setActive(profileId)
        promise.resolve(true)
    }

    /** Cadangan state di filesDir. Bertahan saat update, terpisah dari AsyncStorage. */
    @ReactMethod
    fun readStateBackup(promise: Promise) {
        try {
            val file = File(reactApplicationContext.filesDir, "zenith-state.json")
            promise.resolve(if (file.exists()) file.readText(Charsets.UTF_8) else null)
        } catch (_: Throwable) {
            promise.resolve(null)
        }
    }

    @ReactMethod
    fun writeStateBackup(json: String, promise: Promise) {
        try {
            val dir = reactApplicationContext.filesDir
            val file = File(dir, "zenith-state.json")
            val tmp = File(dir, "zenith-state.json.tmp")
            tmp.writeText(json, Charsets.UTF_8)
            if (!tmp.renameTo(file)) {
                file.writeText(json, Charsets.UTF_8)
                tmp.delete()
            }
            promise.resolve(true)
        } catch (_: Throwable) {
            promise.resolve(false)
        }
    }

    @ReactMethod
    fun snapshotCookies(urls: ReadableArray, promise: Promise) {
        try {
            val list = ArrayList<String>(urls.size())
            for (i in 0 until urls.size()) {
                if (!urls.isNull(i)) {
                    urls.getString(i)?.let { list.add(it) }
                }
            }
            com.zenith.browser.webview.ZenithPrivate.snapshotCookies(reactApplicationContext, list)
            promise.resolve(true)
        } catch (_: Throwable) {
            promise.resolve(false)
        }
    }

    @ReactMethod
    fun restoreCookieSnapshot(promise: Promise) {
        try {
            promise.resolve(com.zenith.browser.webview.ZenithPrivate.restoreCookieSnapshot(reactApplicationContext))
        } catch (_: Throwable) {
            promise.resolve(0)
        }
    }

    @ReactMethod
    fun flushCookies(promise: Promise) {
        com.zenith.browser.webview.ZenithPrivate.flush()
        promise.resolve(true)
    }

    /**
     * Pertahankan kompatibilitas bridge tanpa menyembunyikan atau menghentikan WebView
     * tab lain yang masih aktif di memori.
     */
    @ReactMethod
    fun setPageHold(hold: Boolean) {
        // No-op: visibilitas tiap tab diatur oleh kontainer React Native (display: 'none' / 'flex').
    }

    // ------------------------------------------------------------------
    // Bilah sistem & inset keyboard (Material edge-to-edge)
    // ------------------------------------------------------------------

    /**
     * Atur warna ikon status bar/navigation bar.
     * Dipanggil dari JS setiap tema aplikasi berubah.
     */
    @ReactMethod
    fun setBarsAppearance(lightStatusBar: Boolean, lightNavBar: Boolean, promise: Promise) {
        try {
            ZenithSystemBars.bind(reactApplicationContext)
            if (reactApplicationContext.currentActivity != null) {
                ZenithSystemBars.attach(reactApplicationContext.currentActivity)
            }
            promise.resolve(ZenithSystemBars.applyAppearance(lightStatusBar, lightNavBar))
        } catch (_: Throwable) {
            promise.resolve(false)
        }
    }

    /**
     * Selaraskan tema Android dengan tema aplikasi.
     *
     * Ini penting untuk WebView: media query `prefers-color-scheme` mengikuti
     * tema Android (isLightTheme), bukan tema internal JS. Dengan menyetel
     * mode malam yang sama, konten web ikut gelap/terang bersama antarmuka —
     * perilaku yang dianjurkan dokumen WebView & Material 3.
     */
    @ReactMethod
    fun setNightMode(mode: String, promise: Promise) {
        try {
            val resolved = when (mode) {
                "dark" -> AppCompatDelegate.MODE_NIGHT_YES
                "light" -> AppCompatDelegate.MODE_NIGHT_NO
                else -> AppCompatDelegate.MODE_NIGHT_FOLLOW_SYSTEM
            }
            AppCompatDelegate.setDefaultNightMode(resolved)
            promise.resolve(true)
        } catch (_: Throwable) {
            promise.resolve(false)
        }
    }

    /**
     * Simpan histori WebView tab ini (saveState) — dipanggil saat aplikasi ke
     * latar. Panduan resmi: developer.android.com/develop/ui/views/layout/
     * webapps/webview ("Mempertahankan riwayat").
     */
    @ReactMethod
    fun saveTabState(tabId: String, promise: Promise) {
        Handler(Looper.getMainLooper()).post {
            try {
                val view = com.zenith.browser.webview.ZenithTabState.findWebView(tabId)
                val saved = view != null &&
                    com.zenith.browser.webview.ZenithTabState.saveFor(
                        view,
                        reactApplicationContext,
                        tabId,
                    )
                promise.resolve(saved)
            } catch (_: Throwable) {
                promise.resolve(false)
            }
        }
    }

    /**
     * Pulihkan histori WebView tab ini (restoreState) saat tab dibuka kembali
     * atau aplikasi dimulai ulang setelah prosesnya dibunuh.
     *
     * View native baru terdaftar beberapa milidetik setelah komit React, jadi
     * pencarian diulang beberapa kali sebelum menyerah (JS lalu memuat URL
     * seperti biasa — tidak ada halaman yang gagal tampil).
     */
    @ReactMethod
    fun restoreTabState(tabId: String, promise: Promise) {
        val context = reactApplicationContext
        if (!com.zenith.browser.webview.ZenithTabState.hasState(context, tabId)) {
            promise.resolve(false)
            return
        }
        attemptRestore(context, tabId, 0, promise)
    }

    private fun attemptRestore(
        context: ReactApplicationContext,
        tabId: String,
        attempt: Int,
        promise: Promise,
    ) {
        Handler(Looper.getMainLooper()).postDelayed({
            try {
                val view = com.zenith.browser.webview.ZenithTabState.findWebView(tabId)
                if (view == null) {
                    if (attempt < 12) {
                        attemptRestore(context, tabId, attempt + 1, promise)
                    } else {
                        promise.resolve(false)
                    }
                    return
                }
                val restored = com.zenith.browser.webview.ZenithTabState.restore(view, context, tabId)
                promise.resolve(restored)
            } catch (_: Throwable) {
                promise.resolve(false)
            }
        }, if (attempt == 0) 0L else 60L)
    }

    /** Hapus state tab yang sudah ditutup (tidak menumpuk di penyimpanan). */
    @ReactMethod
    fun deleteTabState(tabId: String, promise: Promise) {
        try {
            com.zenith.browser.webview.ZenithTabState.delete(reactApplicationContext, tabId)
            promise.resolve(true)
        } catch (_: Throwable) {
            promise.resolve(false)
        }
    }

    /**
     * Palet warna dinamis Material You (Android 12+) untuk mode terang/gelap.
     * Rujukan: developer.android.com/develop/ui/views/theming/dynamic-colors
     * Mengembalikan null bila perangkat/wallpaper tidak mendukung.
     */
    @ReactMethod
    fun dynamicColors(mode: String, promise: Promise) {
        try {
            val map = ZenithDynamicColor.palette(reactApplicationContext, mode == "dark")
            if (map == null) {
                promise.resolve(null)
            } else {
                promise.resolve(map)
            }
        } catch (_: Throwable) {
            promise.resolve(null)
        }
    }

    /** Mulai mengirim tinggi keyboard ke JS (event "ZenithImeInsets"). */
    @ReactMethod
    fun enableSystemUiTracking(promise: Promise) {
        try {
            ZenithSystemBars.bind(reactApplicationContext)
            ZenithSystemBars.attach(reactApplicationContext.currentActivity)
            ZenithSystemBars.startTracking()
            promise.resolve(true)
        } catch (_: Throwable) {
            promise.resolve(false)
        }
    }

    /** Tinggi keyboard saat ini dalam dp (0 bila tertutup). */
    @ReactMethod
    fun imeInset(promise: Promise) {
        try {
            promise.resolve(ZenithSystemBars.imeInsetDp())
        } catch (_: Throwable) {
            promise.resolve(0.0)
        }
    }

    /** Pulihkan kuki v0.4.4 yang tersesat di toples Zu, tanpa menimpa toples bawaan. */
    @ReactMethod
    fun restorePrimaryCookies(urls: ReadableArray, promise: Promise) {
        val list = ArrayList<String>(urls.size())
        for (i in 0 until urls.size()) {
            if (!urls.isNull(i)) {
                urls.getString(i)?.let { list.add(it) }
            }
        }
        Thread {
            try {
                com.zenith.browser.webview.ZenithPrivate.importMissingCookies(
                    com.zenith.browser.webview.ZenithPrivate.nameFor(
                        com.zenith.browser.webview.ZenithPrivate.PRIMARY_ID,
                        false,
                    ),
                    list,
                )
            } catch (_: Throwable) {
            }
            promise.resolve(true)
        }.start()
    }
}
