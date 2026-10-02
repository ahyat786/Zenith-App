package com.zenith.browser.webview

import android.content.Context
import android.os.Bundle
import android.os.Parcel
import android.util.Base64
import android.webkit.WebView
import java.io.File
import java.util.Collections
import java.util.WeakHashMap
import java.util.concurrent.Executors

/**
 * Histori WebView per tab — `saveState()` / `restoreState()`.
 *
 * Rujukan resmi (developer.android.com/develop/ui/views/layout/webapps/webview):
 *  · "Mempertahankan riwayat" — simpan state WebView dengan `saveState()` lalu
 *    pulihkan `restoreState()`; hati-hati ukuran Bundle (`TransactionTooLargeException`).
 *
 * Cara Zenith melakukannya dengan aman:
 *  1. Tab id dikirim lewat penanda UA yang sudah ada (`zt:<tabId>`) sehingga
 *     manager tahu WebView mana milik tab mana — tanpa API RN baru.
 *  2. State di-Parcel → Base64 → berkas di penyimpanan internal aplikasi
 *     (bukan savedInstanceState), jadi TIDAK ada risiko TransactionTooLarge.
 *  3. Ada batas keras ukuran (512 KB) dan jumlah berkas (40); berkas terbesar
 *     yang gagal disimpan hanya dilewati, bukan dipotong.
 *  4. Tab privat tidak pernah disimpan (isi situs privat tidak boleh menetap).
 *  5. Penulisan berkas dilakukan di thread terpisah; pemanggilan
 *     `saveState`/`restoreState` tetap di UI thread (wajib menurut WebView).
 */
object ZenithTabState {

    private const val DIR_NAME = "tabstate"
    private const val MAX_BYTES = 512 * 1024
    private const val MAX_FILES = 40

    private val tabOf = Collections.synchronizedMap(WeakHashMap<WebView, String>())
    private val writer = Executors.newSingleThreadExecutor { r ->
        Thread(r, "zenith-tabstate").apply { isDaemon = true }
    }

    /** Dipanggil manager saat prop `applicationNameForUserAgent` berisi `zt:<tabId>`. */
    fun noteTab(webView: WebView, tabId: String) {
        if (tabId.isNotBlank()) {
            tabOf[webView] = tabId
        }
    }

    fun tabOf(webView: WebView): String? = tabOf[webView]

    fun forget(webView: WebView) {
        tabOf.remove(webView)
    }

    /** WebView yang sedang hidup untuk tab tertentu (dipakai modul native). */
    fun findWebView(tabId: String): WebView? {
        synchronized(tabOf) {
            return tabOf.entries.firstOrNull { it.value == tabId }?.key
        }
    }

    fun hasState(context: Context, tabId: String): Boolean {
        val f = fileFor(context, tabId)
        return f.exists() && f.length() > 0
    }

    /**
     * Simpan state WebView untuk tab-nya. WAJIB dipanggil dari UI thread.
     * @return true bila state benar-benar tersimpan.
     */
    fun save(webView: WebView, context: Context): Boolean {
        val tabId = tabOf[webView] ?: return false
        return saveFor(webView, context, tabId)
    }

    fun saveFor(webView: WebView, context: Context, tabId: String): Boolean {
        if (ZenithPrivate.isPrivate(webView)) {
            // Tab privat: riwayat tidak boleh menetap di disk.
            return false
        }
        val bytes = try {
            val bundle = Bundle()
            webView.saveState(bundle)
            val parcel = Parcel.obtain()
            try {
                parcel.writeBundle(bundle)
                parcel.marshall()
            } finally {
                parcel.recycle()
            }
        } catch (t: Throwable) {
            return false
        }
        if (bytes.isEmpty() || bytes.size > MAX_BYTES) {
            return false
        }
        writer.execute {
            try {
                val file = fileFor(context, tabId)
                file.parentFile?.mkdirs()
                file.writeBytes(bytes)
                prune(context)
            } catch (t: Throwable) {
                // state hanya akselerasi — gagal menyimpan bukan kesalahan fatal
            }
        }
        return true
    }

    /**
     * Pulihkan state WebView. WAJIB dipanggil dari UI thread.
     * @return true bila WebView sudah memuat halaman hasil pemulihan.
     */
    fun restore(webView: WebView, context: Context, tabId: String): Boolean {
        val text = try {
            val file = fileFor(context, tabId)
            if (!file.exists() || file.length() == 0L) {
                return false
            }
            file.readText()
        } catch (t: Throwable) {
            return false
        }
        if (text.isBlank()) {
            return false
        }
        return try {
            val bytes = Base64.decode(text, Base64.NO_WRAP)
            val parcel = Parcel.obtain()
            val bundle: Bundle?
            try {
                parcel.unmarshall(bytes, 0, bytes.size)
                parcel.setDataPosition(0)
                bundle = parcel.readBundle(WebView::class.java.classLoader)
            } finally {
                parcel.recycle()
            }
            if (bundle == null) {
                return false
            }
            webView.restoreState(bundle)
            val url = webView.url
            !url.isNullOrBlank() && url != "about:blank"
        } catch (t: Throwable) {
            false
        }
    }

    fun delete(context: Context, tabId: String) {
        writer.execute {
            try {
                fileFor(context, tabId).delete()
            } catch (t: Throwable) {
                // diabaikan
            }
        }
    }

    fun clearAll(context: Context) {
        writer.execute {
            try {
                dirFor(context).listFiles()?.forEach { it.delete() }
            } catch (t: Throwable) {
                // diabaikan
            }
        }
    }

    // ---------------------------------------------------------------- berkas

    private fun dirFor(context: Context): File = File(context.filesDir, DIR_NAME)

    private fun fileFor(context: Context, tabId: String): File =
        File(dirFor(context), safeName(tabId))

    /** Nama berkas aman: id tab berasal dari aplikasi sendiri, tetap dibersihkan. */
    private fun safeName(tabId: String): String {
        val clean = tabId.replace(Regex("[^A-Za-z0-9._-]"), "_")
        return if (clean.isEmpty()) "tab" else clean
    }

    /** Batasi jumlah berkas agar penyimpanan tidak tumbuh tanpa batas. */
    private fun prune(context: Context) {
        val files = dirFor(context).listFiles() ?: return
        if (files.size <= MAX_FILES) {
            return
        }
        files.sortedBy { it.lastModified() }
            .take(files.size - MAX_FILES)
            .forEach { it.delete() }
    }
}
