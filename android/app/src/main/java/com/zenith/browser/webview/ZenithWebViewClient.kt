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
    companion object {
        const val EXPECTED_URL = 0x5e417001
        const val FORCED_URI = 0x5e417002
        const val CORRECTED = 0x5e417003
    }


    override fun onPageStarted(view: WebView, url: String, favicon: android.graphics.Bitmap?) {
        val expected = view.getTag(EXPECTED_URL) as? String
        val corrected = view.getTag(CORRECTED) as? String
        if (
            !expected.isNullOrBlank() &&
            url.isNotEmpty() &&
            corrected != expected &&
            !sameDocument(url, expected) &&
            hostOf(url) != hostOf(expected) &&
            !url.startsWith("about:") &&
            !url.startsWith("zenith:")
        ) {
            view.setTag(CORRECTED, expected)
            view.post {
                try {
                    view.stopLoading()
                    view.loadUrl(expected)
                } catch (_: Throwable) {
                }
            }
            return
        }
        super.onPageStarted(view, url, favicon)
    }

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
    private fun hostOf(url: String): String {
        return try {
            android.net.Uri.parse(url).host?.removePrefix("www.")?.lowercase() ?: ""
        } catch (_: Throwable) {
            ""
        }
    }

    private fun sameDocument(a: String, b: String): Boolean {
        if (a == b) {
            return true
        }
        return a.trimEnd('/') == b.trimEnd('/')
    }

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
