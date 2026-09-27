package com.zenith.browser.core

import android.os.SystemClock
import android.util.Base64
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * Klien DNS-over-HTTPS (RFC 8484) — fitur "Jaringan & DNS Aman" (Shield Guard).
 *
 * Memakai OkHttp (sudak dibundel React Native) yang menegosiasikan HTTP/2
 * otomatis — Quad9 MENOLAK HTTP/1.1 dengan status 505 sehingga klien
 * HTTP/1.1 murni tidak bisa menghubunginya.
 *
 * Strategi dua tahap:
 *  1. GET  ?dns=<base64url>          — diterima mayoritas server (Quad9, AdGuard, Cloudflare, Google)
 *  2. POST application/dns-message   — BebasDNS hanya menerima POST
 */
object ZenithDoh {

    private val baseClient: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .connectTimeout(6, TimeUnit.SECONDS)
            .readTimeout(6, TimeUnit.SECONDS)
            .build()
    }

    /** Bangun paket kueri DNS (record A) untuk `name`. */
    fun buildQuery(name: String): ByteArray {
        val n = name.trim().trim('.')
        require(n.isNotEmpty()) { "nama kosong" }
        val out = java.io.ByteArrayOutputStream(32 + n.length)
        val txid = (System.nanoTime() and 0xffff).toInt()
        out.write((txid ushr 8) and 0xff)
        out.write(txid and 0xff)
        out.write(0x01) // flags: RD=1
        out.write(0x00)
        // QDCOUNT=1, sisanya 0
        out.write(0); out.write(1); out.write(0); out.write(0)
        out.write(0); out.write(0); out.write(0); out.write(0)
        for (label in n.split('.')) {
            require(label.isNotEmpty() && label.length <= 63) { "label tidak valid: $label" }
            out.write(label.length)
            out.write(label.toByteArray(Charsets.US_ASCII))
        }
        out.write(0)
        out.write(0); out.write(1) // QTYPE = A
        out.write(0); out.write(1) // QCLASS = IN
        return out.toByteArray()
    }

    private fun skipName(buf: ByteArray, offIn: Int): Int {
        var off = offIn
        while (true) {
            if (off >= buf.size) {
                return off
            }
            val l = buf[off].toInt() and 0xff
            if (l and 0xC0 == 0xC0) {
                return off + 2 // penunjuk kompresi
            }
            if (l == 0) {
                return off + 1
            }
            off += 1 + l
        }
    }

    /** Ambil semua jawaban A/AAAA. `questionLen` = panjang kueri asli. */
    fun parseAnswers(resp: ByteArray, questionLen: Int): List<String> {
        val ips = ArrayList<String>()
        if (resp.size < 12 || questionLen < 12) {
            return ips
        }
        if (resp[3].toInt() and 0x0F != 0) {
            return ips // NXDOMAIN dkk.
        }
        val ancount = ((resp[6].toInt() and 0xff) shl 8) or (resp[7].toInt() and 0xff)
        var off = questionLen.coerceAtMost(resp.size)
        var i = 0
        while (i < ancount) {
            off = skipName(resp, off)
            if (off + 10 > resp.size) {
                break
            }
            val rtype = ((resp[off].toInt() and 0xff) shl 8) or (resp[off + 1].toInt() and 0xff)
            val rdlen = ((resp[off + 8].toInt() and 0xff) shl 8) or (resp[off + 9].toInt() and 0xff)
            val rstart = off + 10
            if (rstart + rdlen > resp.size) {
                break
            }
            if (rtype == 1 && rdlen == 4) {
                ips.add(
                    "${resp[rstart].toInt() and 0xff}.${resp[rstart + 1].toInt() and 0xff}." +
                        "${resp[rstart + 2].toInt() and 0xff}.${resp[rstart + 3].toInt() and 0xff}"
                )
            } else if (rtype == 28 && rdlen == 16) {
                val sb = StringBuilder()
                for (j in 0 until 8) {
                    val seg = ((resp[rstart + j * 2].toInt() and 0xff) shl 8) or
                        (resp[rstart + j * 2 + 1].toInt() and 0xff)
                    if (j > 0) {
                        sb.append(':')
                    }
                    sb.append(Integer.toHexString(seg))
                }
                ips.add(sb.toString())
            }
            off = rstart + rdlen
            i++
        }
        return ips
    }

    private fun ok(ips: List<String>, t0: Long): String =
        JSONObject()
            .put("ok", true)
            .put("ips", JSONArray(ips))
            .put("ms", (SystemClock.elapsedRealtime() - t0).toInt())
            .toString()

    private fun err(msg: String?): String =
        JSONObject().put("ok", false).put("error", msg ?: "gagal").toString()

    /** Uji resolusi satu nama via satu server DoH. Keluaran JSON string. */
    fun resolve(url: String, name: String, timeoutMs: Int): String {
        val t0 = SystemClock.elapsedRealtime()
        val query = try {
            buildQuery(name)
        } catch (t: Throwable) {
            return err(t.message)
        }
        val timeout = timeoutMs.toLong().coerceIn(500, 15000)
        val client = baseClient.newBuilder()
            .readTimeout(timeout, TimeUnit.MILLISECONDS)
            .callTimeout(timeout + 2000, TimeUnit.MILLISECONDS)
            .build()

        // --- 1) GET ?dns=<base64url> ---
        val b64 = Base64.encodeToString(query, Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP)
        val getBody = try {
            client.newCall(
                Request.Builder()
                    .url("$url?dns=$b64")
                    .header("Accept", "application/dns-message")
                    .build()
            ).execute().use { r ->
                if (r.isSuccessful) {
                    r.body?.bytes()
                } else {
                    null
                }
            }
        } catch (_: Throwable) {
            null
        }
        if (getBody != null) {
            val ips = parseAnswers(getBody, query.size)
            if (ips.isNotEmpty()) {
                return ok(ips, t0)
            }
        }

        // --- 2) POST wireformat ---
        return try {
            client.newCall(
                Request.Builder()
                    .url(url)
                    .header("Content-Type", "application/dns-message")
                    .header("Accept", "application/dns-message")
                    .post(query.toRequestBody("application/dns-message".toMediaType()))
                    .build()
            ).execute().use { r ->
                if (r.isSuccessful) {
                    ok(parseAnswers(r.body?.bytes() ?: ByteArray(0), query.size), t0)
                } else {
                    err("HTTP ${r.code}")
                }
            }
        } catch (t: Throwable) {
            err(t.message ?: t.toString())
        }
    }
}
