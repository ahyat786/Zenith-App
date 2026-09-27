package com.zenith.browser.webview

import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import com.reactnativecommunity.webview.RNCWebViewClient
import com.zenith.browser.core.ZenithCoreJNI
import java.io.IOException
import java.io.InputStream

/**
 * WebViewClient Zenith — memblokir permintaan sub-sumber daya (iklan/pelacak)
 * pada level jaringan via shouldInterceptRequest, memakai mesin Rust.
 *
 * Frame utama TIDAK diblokir supaya halaman tetap termuat;
 * pengguna dapat mematikan pemblokiran per-situs dari Pengaturan Situs.
 */
class ZenithWebViewClient : RNCWebViewClient() {

    override fun shouldInterceptRequest(
        view: WebView,
        request: WebResourceRequest
    ): WebResourceResponse? {
        if (ZenithCoreJNI.available) {
            try {
                if (request.isForMainFrame) {
                    // Catat halaman utama ke log koneksi Shield Guard.
                    ZenithCoreJNI.adblockNoteRequest(request.url.toString())
                } else if (ZenithCoreJNI.adblockShouldBlock(request.url.toString())) {
                    return blockedResponse()
                }
            } catch (_: Throwable) {
                // jangan ganggu navigasi bila mesin Rust bermasalah
            }
        }
        return super.shouldInterceptRequest(view, request)
    }

    /**
     * Jawaban kosong membuat `fetch` di halaman uji tetap "berhasil".
     * Stream yang melempar membuat pemuatan gagal (setara ditolak jaringan),
     * sehingga tes host, gambar iklan, dan skrip umpan terhitung terblokir.
     */
    private fun blockedResponse(): WebResourceResponse =
        WebResourceResponse(
            "text/plain",
            "utf-8",
            403,
            "Blocked",
            mapOf("X-Zenith-Blocked" to "1"),
            object : InputStream() {
                override fun read(): Int = throw IOException("blocked")
                override fun read(b: ByteArray, off: Int, len: Int): Int = throw IOException("blocked")
            }
        )
}
