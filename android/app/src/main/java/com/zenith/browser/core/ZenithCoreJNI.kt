package com.zenith.browser.core

/**
 * Jembatan JNI ke inti Rust (libzenith_core.so).
 *
 * Semua fungsi @JvmStatic external — nama JNI-nya mengikuti pola
 * Java_com_zenith_browser_core_ZenithCoreJNI_<fungsi> (lihat rust/zenith-core/src/jni.rs).
 */
object ZenithCoreJNI {
    @Volatile
    var available: Boolean = false
        private set

    init {
        available = try {
            System.loadLibrary("zenith_core")
            true
        } catch (t: Throwable) {
            android.util.Log.w("ZenithCore", "libzenith_core tidak tersedia, fallback ke JS", t)
            false
        }
    }

    @JvmStatic external fun coreVersion(): String

    // Userscript (format Via / Greasy Fork)
    @JvmStatic external fun parseUserScript(src: String): String
    @JvmStatic external fun matchUserScript(metaJson: String, url: String): Boolean

    // Ekstensi Chrome (subset Kiwi)
    @JvmStatic external fun parseExtensionManifest(manifestJson: String): String
    @JvmStatic external fun extensionScriptsFor(extJson: String, url: String, runAt: String): String

    // Pemblokir iklan
    @JvmStatic external fun adblockInit(hosts: String, mode: String): String
    @JvmStatic external fun adblockSetEnabled(enabled: Boolean)
    @JvmStatic external fun adblockAllowHost(host: String, allow: Boolean)
    @JvmStatic external fun adblockShouldBlock(url: String): Boolean
    @JvmStatic external fun adblockStats(): String
    @JvmStatic external fun adblockResetStats()
    @JvmStatic external fun adblockConnectionLog(): String
    @JvmStatic external fun adblockClearConnectionLog()
    @JvmStatic external fun adblockNoteRequest(url: String)


    // URL kit
    @JvmStatic external fun normalizeInput(input: String, searchTemplate: String): String
    @JvmStatic external fun expandSearch(template: String, query: String): String
    @JvmStatic external fun hostOf(url: String): String
}
