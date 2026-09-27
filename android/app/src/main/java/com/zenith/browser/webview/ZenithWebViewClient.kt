package com.zenith.browser.webview

import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import com.reactnativecommunity.webview.RNCWebViewClient
import com.zenith.browser.core.ZenithCoreJNI
import java.io.ByteArrayInputStream

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

    private fun blockedResponse(): WebResourceResponse =
        WebResourceResponse(
            "text/plain",
            "utf-8",
            204,
            "No Content",
            mapOf("X-Zenith-Blocked" to "1"),
            ByteArrayInputStream(ByteArray(0))
        )
}
