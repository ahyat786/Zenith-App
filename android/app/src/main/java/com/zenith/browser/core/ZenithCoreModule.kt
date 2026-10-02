package com.zenith.browser.core

import android.content.ComponentName
import android.content.Intent
import android.provider.Settings
import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
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
        reactApplicationContext.addLifecycleEventListener(object :
            com.facebook.react.common.LifecycleEventListener {
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
