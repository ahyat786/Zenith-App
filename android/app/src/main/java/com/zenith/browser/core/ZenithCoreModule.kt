package com.zenith.browser.core

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
    fun normalizeInput(input: String, searchTemplate: String, promise: Promise) =
        guard(promise, null as String?) { ZenithCoreJNI.normalizeInput(input, searchTemplate) }

    @ReactMethod
    fun expandSearch(template: String, query: String, promise: Promise) =
        guard(promise, null as String?) { ZenithCoreJNI.expandSearch(template, query) }

    @ReactMethod
    fun hostOf(url: String, promise: Promise) =
        guard(promise, null as String?) { ZenithCoreJNI.hostOf(url) }
}
