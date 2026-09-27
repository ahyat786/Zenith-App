package com.zenith.browser.core

import android.content.ComponentName
import android.content.Intent
import android.provider.Settings
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.module.annotations.ReactModule

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
}
