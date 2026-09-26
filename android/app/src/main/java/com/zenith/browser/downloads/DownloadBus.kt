package com.zenith.browser.downloads

import android.app.DownloadManager
import android.content.Context
import android.net.Uri
import android.os.Environment

/**
 * Titik masuk unduhan dari WebView (ZenithWebViewManager).
 * fast=true (default, ala Via) → ZenithDownloadModule multi-thread;
 * fast=false → DownloadManager sistem.
 */
object DownloadBus {
    @Volatile
    var module: ZenithDownloadModule? = null

    @Volatile
    var fastEnabled: Boolean = true

    private val pending = mutableListOf<Array<String>>() // [url, filename, mime]

    fun request(context: Context, url: String, filename: String, mime: String) {
        val m = module
        when {
            fastEnabled && m != null -> m.enqueue(url, filename, mime, 4)
            fastEnabled -> synchronized(pending) { pending.add(arrayOf(url, filename, mime)) }
            else -> systemDownload(context, url, filename, mime)
        }
    }

    fun drainPending() {
        val m = module ?: return
        synchronized(pending) {
            for (a in pending) {
                m.enqueue(a[0], a[1], a[2], 4)
            }
            pending.clear()
        }
    }

    private fun systemDownload(context: Context, url: String, filename: String, mime: String) {
        try {
            val req = DownloadManager.Request(Uri.parse(url))
            req.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
            req.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, filename)
            req.setTitle(filename)
            req.setMimeType(mime)
            (context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager).enqueue(req)
        } catch (_: Throwable) {
            // perangkat lama tanpa izin tulis — diabaikan; pengguna bisa
            // mengaktifkan kembali mode unduhan cepat milik aplikasi.
        }
    }
}
