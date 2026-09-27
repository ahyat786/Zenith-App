package com.zenith.browser.downloads

import android.app.DownloadManager
import android.content.Context
import android.net.Uri
import android.os.Environment
import android.webkit.CookieManager
import android.webkit.URLUtil
import android.webkit.WebView
import android.widget.Toast
import com.zenith.browser.webview.ZenithPrivate

/**
 * Jembatan unduhan WebView. Hanya http(s). URL yang sama tidak diantre dua kali;
 * pemicu kedua memunculkan pemberitahuan.
 */
object DownloadBus {
    @Volatile
    var module: ZenithDownloadModule? = null

    @Volatile
    var fastEnabled: Boolean = true

    private val pending = ArrayDeque<Pending>()

    private data class Pending(
        val url: String,
        val filename: String?,
        val mime: String?,
        val cookie: String?,
    )

    fun request(
        view: WebView,
        url: String?,
        userAgent: String?,
        contentDisposition: String?,
        mimetype: String?,
        contentLength: Long,
    ) {
        if (url.isNullOrBlank()) return
        if (!url.startsWith("http://") && !url.startsWith("https://")) {
            toast(
                view.context,
                "Tautan ini bukan berkas http. Tidak diunduh, dan tidak akan diulang.",
            )
            return
        }
        val filename = URLUtil.guessFileName(url, contentDisposition, mimetype)
        val mime = mimetype?.substringBefore(';')?.trim()?.ifBlank { null }
        val cookie = ZenithPrivate.cookies(view, url)
        val mod = module
        if (fastEnabled && mod != null) {
            mod.enqueue(url, filename, mime, 4, false, cookie)
            return
        }
        synchronized(pending) {
            if (pending.none { it.url.substringBefore('#') == url.substringBefore('#') }) {
                pending.add(Pending(url, filename, mime, cookie))
            }
        }
        if (!fastEnabled) {
            systemDownload(view.context, url, userAgent, filename, mime, contentLength, cookie)
        }
    }

    fun drainPending() {
        val mod = module ?: return
        val batch = synchronized(pending) {
            val copy = pending.toList()
            pending.clear()
            copy
        }
        for (item in batch) {
            mod.enqueue(item.url, item.filename, item.mime, 4, false, item.cookie)
        }
    }

    private fun systemDownload(
        context: Context,
        url: String,
        userAgent: String?,
        filename: String?,
        mime: String?,
        contentLength: Long,
        cookie: String?,
    ) {
        try {
            val req = DownloadManager.Request(Uri.parse(url))
            val jar = cookie ?: CookieManager.getInstance().getCookie(url)
            if (!jar.isNullOrBlank()) req.addRequestHeader("Cookie", jar)
            if (!userAgent.isNullOrBlank()) req.addRequestHeader("User-Agent", userAgent)
            req.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
            req.setDestinationInExternalPublicDir(
                Environment.DIRECTORY_DOWNLOADS,
                filename ?: "unduhan",
            )
            if (!mime.isNullOrBlank()) req.setMimeType(mime)
            if (contentLength > 0) req.setDescription("$contentLength B")
            val dm = context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
            dm.enqueue(req)
        } catch (t: Throwable) {
            toast(context, "Gagal mengunduh: ${t.message}")
        }
    }

    private fun toast(context: Context, text: String) {
        val app = context.applicationContext
        android.os.Handler(android.os.Looper.getMainLooper()).post {
            Toast.makeText(app, text, Toast.LENGTH_LONG).show()
        }
    }
}
