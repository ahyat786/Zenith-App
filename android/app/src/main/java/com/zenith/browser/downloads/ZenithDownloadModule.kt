package com.zenith.browser.downloads

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.ClipData
import android.content.Context
import android.content.ContentValues
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.provider.Settings
import android.webkit.MimeTypeMap
import android.widget.Toast
import androidx.core.app.NotificationCompat
import androidx.core.content.FileProvider
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import org.json.JSONArray
import org.json.JSONObject
import java.io.Closeable
import java.io.File
import java.io.IOException
import java.io.RandomAccessFile
import java.net.HttpURLConnection
import java.net.URL
import java.nio.ByteBuffer
import java.nio.channels.FileChannel
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong

/**
 * Unduhan cepat ke berkas sungguhan, lalu salin ke Download/Zenith.
 *
 * APK (dan aset GitHub) gagal di versi lama karena probe Range bytes=0-0
 * membatalkan seluruh tugas, dan MediaStore menolak MIME paket. Di sini
 * pengalihan diikuti manual dengan header Range tetap terpasang, UA Chrome,
 * tulis paralel ke berkas aplikasi (maks. 4 koneksi, hanya bila server
 * mendukung Range), lalu dipublikasikan. Riwayat disimpan di filesDir.
 */
class ZenithDownloadModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "ZenithDownloads"
        const val EVENT = "ZenithDownloadProgress"
        const val EVENT_PROMPT = "ZenithDownloadPrompt"
        private const val PART_RETRIES = 3
        private const val UA =
            "Mozilla/5.0 (Linux; Android 14; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36"
        private const val MULTI_MIN = 2L * 1048576
    }

    class Job(
        val id: String,
        val url: String,
        var uri: Uri?,
        var file: File?,
        val mime: String,
        val threads: Int,
        val name: String,
    ) {
        val cancel = AtomicBoolean(false)
        val userCancel = AtomicBoolean(false)
        val done = AtomicLong(0)
        @Volatile var total: Long = -1
        @Volatile var speed: Long = 0
        @Volatile var status: String = "connecting"
        @Volatile var error: String? = null
        @Volatile var lastDone: Long = 0
        @Volatile var finishedAt: Long = 0
        @Volatile var fetchUrl: String = url
        @Volatile var cookie: String? = null
        @Volatile var startedAt: Long = 0
        @Volatile var lastByteAt: Long = 0
        @Volatile var liveConn: HttpURLConnection? = null
        val displayName: String get() = name
    }

    private data class Resolved(
        val url: String,
        val code: Int,
        val total: Long,
        val contentType: String?,
    )

    private val jobs = ConcurrentHashMap<String, Job>()
    private val pendingCookies = ConcurrentHashMap<String, String>()
    private val pool = Executors.newCachedThreadPool()
    private val reporter = Executors.newSingleThreadScheduledExecutor()
    private val historyLock = Any()
    private val enqueueLock = Any()
    private val lastNotice = ConcurrentHashMap<String, Long>()
    private var askedNotify = false

    init {
        loadHistory()
        DownloadBus.module = this
        DownloadBus.drainPending()
        reporter.scheduleAtFixedRate(::reportAll, 500, 500, java.util.concurrent.TimeUnit.MILLISECONDS)
    }

    override fun getName(): String = NAME

    @ReactMethod
    fun start(url: String, filename: String?, mime: String?, connections: Int, promise: Promise) {
        try {
            val savedCookie = pendingCookies.remove(url) ?: pendingCookies.remove(url.substringBefore('#').trim())
            promise.resolve(enqueue(url, filename, mime, connections, true, savedCookie))
        } catch (t: Throwable) {
            promise.reject("ZENITH_DL", t.message ?: t.toString(), t)
        }
    }

    @ReactMethod
    fun cancel(id: String, promise: Promise) {
        jobs[id]?.let {
            it.userCancel.set(true)
            it.cancel.set(true)
        }
        promise.resolve(true)
    }

    @ReactMethod
    fun list(promise: Promise) {
        val arr = Arguments.createArray()
        val sorted = jobs.values.sortedWith(
            compareBy<Job> { if (it.status == "connecting" || it.status == "downloading") 0 else 1 }
                .thenByDescending { it.finishedAt },
        )
        for (job in sorted) {
            arr.pushMap(jobToMap(job))
        }
        promise.resolve(arr)
    }

    @ReactMethod
    fun open(id: String, promise: Promise) {
        val job = jobs[id]
        if (job == null || !existsTarget(job)) {
            promise.reject("ZENITH_DL_OPEN", "Berkas tidak ada di perangkat.")
            return
        }
        try {
            openJob(job)
            promise.resolve(true)
        } catch (t: Throwable) {
            promise.reject("ZENITH_DL_OPEN", t.message ?: t.toString(), t)
        }
    }

    @ReactMethod
    fun share(id: String, promise: Promise) {
        val job = jobs[id]
        if (job == null || job.file?.exists() != true) {
            promise.reject("ZENITH_DL_SHARE", "Berkas tidak ada di perangkat.")
            return
        }
        try {
            val uri = fileUri(job.file!!)
            val intent = Intent(Intent.ACTION_SEND).apply {
                type = viewMime(job)
                putExtra(Intent.EXTRA_STREAM, uri)
                clipData = ClipData.newRawUri(job.name, uri)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            grantToMatches(intent, uri)
            reactApplicationContext.startActivity(
                Intent.createChooser(intent, job.name).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            )
            promise.resolve(true)
        } catch (t: Throwable) {
            promise.reject("ZENITH_DL_SHARE", t.message ?: t.toString(), t)
        }
    }

    /** deleteFile=false hanya menghapus baris riwayat; berkas di disk tetap. */
    @ReactMethod
    fun remove(id: String, deleteFile: Boolean, promise: Promise) {
        val job = jobs.remove(id)
        if (job != null) {
            job.userCancel.set(true)
            job.cancel.set(true)
            if (deleteFile) {
                deleteTarget(job)
            }
            persist()
        }
        promise.resolve(true)
    }

    @ReactMethod
    fun setEnabled(enabled: Boolean, promise: Promise) {
        DownloadBus.fastEnabled = enabled
        promise.resolve(true)
    }

    @ReactMethod
    fun addListener(eventName: String) { /* wajib untuk NativeEventEmitter */ }

    @ReactMethod
    fun removeListeners(count: Int) { /* wajib untuk NativeEventEmitter */ }

    fun promptDownload(
        url: String,
        filenameIn: String?,
        mime: String?,
        contentLength: Long,
        cookie: String?,
    ) {
        if (!cookie.isNullOrBlank()) {
            pendingCookies[url] = cookie
            pendingCookies[url.substringBefore('#').trim()] = cookie
        }
        val guessedMime = mime?.takeIf { it.isNotBlank() } ?: "application/octet-stream"
        val name = cleanName(filenameIn, guessedMime, url)
        val params = Arguments.createMap().apply {
            putString("url", url)
            putString("filename", name)
            putString("mime", guessedMime)
            putDouble("total", contentLength.toDouble())
            putString("cookie", cookie ?: "")
        }
        try {
            reactApplicationContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(EVENT_PROMPT, params)
        } catch (_: Throwable) {
            enqueue(url, name, guessedMime, 4, false, cookie)
        }
    }

    fun enqueue(
        url: String,
        filenameIn: String?,
        mime: String?,
        connections: Int,
        force: Boolean = false,
        cookie: String? = null,
    ): String {
        if (!url.startsWith("http://") && !url.startsWith("https://")) {
            notifyUser("Tidak dapat mengunduh", "Tautan ini bukan berkas http. Tidak diulang.")
            return ""
        }
        synchronized(enqueueLock) {
            val guessedMime = mime?.takeIf { it.isNotBlank() } ?: "application/octet-stream"
            val name = cleanName(filenameIn, guessedMime, url)
            val key = url.substringBefore('#').trim()
            val now = System.currentTimeMillis()
            val active = jobs.values.find { job ->
                sameItem(job, key, name) && (job.status == "connecting" || job.status == "downloading")
            }
            if (active != null) {
                notifyUser("Unduhan sudah berjalan", active.name)
                return active.id
            }
            if (!force) {
                val recent = jobs.values.find { job ->
                    sameItem(job, key, name) && job.status == "done" && now - job.finishedAt < 60_000
                }
                if (recent != null) {
                    notifyUser("Sudah diunduh", "${recent.name} baru selesai. Tidak diulang.")
                    return recent.id
                }
                val failed = jobs.values.find { job ->
                    job.url.substringBefore('#') == key && job.status == "error" && now - job.finishedAt < 30_000
                }
                if (failed != null) {
                    notifyUser("Unduhan gagal", failed.error ?: "Tidak diulang otomatis.")
                    return failed.id
                }
            }
            val file = uniqueAppFile(name)
            file.createNewFile()
            val id = System.currentTimeMillis().toString(36) + (0..999).random().toString(36)
            val job = Job(id, url, null, file, guessedMime, connections.coerceIn(1, 4), name)
            job.cookie = cookie
            job.startedAt = now
            job.lastByteAt = now
            jobs[id] = job
            persist()
            emit(job)
            pool.execute { runJob(job) }
            return id
        }
    }

    private fun sameItem(job: Job, key: String, name: String): Boolean {
        if (job.url.substringBefore('#') == key) {
            return true
        }
        val generic = name.equals("download", true) ||
            name.equals("unduhan", true) ||
            name.startsWith("download.", true) ||
            name.startsWith("unduhan.", true)
        return !generic && name.isNotBlank() && job.name.equals(name, true)
    }

    private fun appDir(): File {
        val base = reactApplicationContext.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS)
            ?: reactApplicationContext.filesDir
        return File(base, "Zenith").apply { mkdirs() }
    }

    private fun uniqueAppFile(name: String): File {
        val dir = appDir()
        var f = File(dir, name)
        var i = 1
        val base = f.nameWithoutExtension.ifBlank { "unduhan" }
        val ext = f.extension
        while (f.exists()) {
            f = File(dir, if (ext.isBlank()) "$base ($i)" else "$base ($i).$ext")
            i++
        }
        return f
    }

    private fun cleanName(raw: String?, mime: String, url: String): String {
        var name = (raw ?: "").replace(Regex("[\\\\/:*?\"<>|]"), "_").trim()
        val generic = name.isEmpty() || name.equals("download", true) || name.equals("unknown", true) || name.equals("unduhan", true)
        if (generic) {
            val seg = Uri.parse(url).lastPathSegment
                ?.substringBefore('?')
                ?.replace(Regex("[\\\\/:*?\"<>|]"), "_")
                ?.trim()
            if (!seg.isNullOrBlank()) {
                name = seg
            }
        }
        if (name.isEmpty()) {
            name = "unduhan"
        }
        val hasExt = name.contains('.') && name.substringAfterLast('.').length in 1..8
        if (!hasExt) {
            val urlExt = Uri.parse(url).lastPathSegment
                ?.substringBefore('?')
                ?.substringAfterLast('.', "")
                ?: ""
            val mimeExt = MimeTypeMap.getSingleton().getExtensionFromMimeType(mime)
            val ext = when {
                mime.contains("package-archive") || url.contains(".apk", true) -> "apk"
                urlExt.length in 1..8 && !urlExt.contains('/') -> urlExt
                !mimeExt.isNullOrBlank() -> mimeExt
                else -> ""
            }
            if (ext.isNotEmpty()) {
                name = "$name.$ext"
            }
        }
        if ((mime.contains("package-archive") || url.contains(".apk", true)) && !name.endsWith(".apk", true)) {
            name += ".apk"
        }
        return name.take(160)
    }

    private fun applyHeaders(conn: HttpURLConnection, rangeFrom: Long, rangeTo: Long, cookie: String? = null) {
        conn.connectTimeout = 20000
        conn.readTimeout = 60000
        conn.instanceFollowRedirects = false
        conn.setRequestProperty("User-Agent", UA)
        conn.setRequestProperty("Accept", "*/*")
        conn.setRequestProperty("Accept-Encoding", "identity")
        conn.setRequestProperty("Accept-Language", "id,en;q=0.8")
        val header = cookie ?: try {
            android.webkit.CookieManager.getInstance().getCookie(conn.url?.toString())
        } catch (_: Throwable) {
            null
        }
        if (!header.isNullOrBlank()) {
            conn.setRequestProperty("Cookie", header)
        }
        if (rangeTo >= 0) {
            conn.setRequestProperty("Range", "bytes=$rangeFrom-$rangeTo")
        } else if (rangeFrom > 0) {
            conn.setRequestProperty("Range", "bytes=$rangeFrom-")
        }
    }

    /** Ikuti pengalihan sendiri supaya header Range tidak hilang (bug HttpURLConnection). */
    private fun openConn(url: String, rangeFrom: Long, rangeTo: Long, cookie: String? = null, job: Job? = null): HttpURLConnection {
        var current = url
        var hops = 0
        while (hops < 8) {
            val conn = URL(current).openConnection() as HttpURLConnection
            job?.liveConn = conn
            applyHeaders(conn, rangeFrom, rangeTo, cookie)
            val code = conn.responseCode
            if (code in 300..399) {
                val loc = conn.getHeaderField("Location")
                conn.disconnect()
                if (loc.isNullOrBlank()) {
                    throw IOException("HTTP $code tanpa tujuan")
                }
                current = URL(URL(current), loc).toExternalForm()
                hops++
                continue
            }
            return conn
        }
        throw IOException("terlalu banyak pengalihan")
    }

    /**
     * HEAD saja. GET lalu putus menghabiskan token sekali-pakai dan
     * unduhan sungguhan dapat 0 byte — banner macet di 0.0 MB.
     */
    private fun resolve(job: Job): Resolved {
        var current = job.url
        var hops = 0
        while (hops < 8) {
            val conn = URL(current).openConnection() as HttpURLConnection
            job.liveConn = conn
            try {
                applyHeaders(conn, -1, -1, job.cookie)
                conn.requestMethod = "HEAD"
                conn.connectTimeout = 8000
                val code = conn.responseCode
                if (code in 300..399) {
                    val loc = conn.getHeaderField("Location")
                        ?: return Resolved(current, code, -1, conn.contentType)
                    current = URL(URL(current), loc).toExternalForm()
                    hops++
                    continue
                }
                return Resolved(current, code, conn.contentLengthLong, conn.contentType)
            } finally {
                conn.disconnect()
            }
        }
        return Resolved(current, -1, -1, null)
    }

    private fun confirmRange(url: String, cookie: String?, job: Job): Long {
        val conn = try {
            openConn(url, 0, 1, cookie, job)
        } catch (_: Throwable) {
            return -1
        }
        try {
            if (conn.responseCode != 206) {
                return -1
            }
            val cr = conn.getHeaderField("Content-Range") ?: return -1
            val m = Regex("/(\\d+)\\s*$").find(cr) ?: return -1
            return m.groupValues[1].toLong()
        } catch (_: Throwable) {
            return -1
        } finally {
            conn.disconnect()
        }
    }

    private fun runJob(job: Job) {
        try {
            val resolved = try {
                resolve(job)
            } catch (_: Throwable) {
                null
            }
            // Tetap mulai dari URL asli. Token CDN GitHub sering sekali pakai;
            // tiap koneksi mengikuti pengalihan sendiri. HEAD yang gagal tidak
            // membatalkan unduhan — GET sungguhan yang menentukan.
            job.fetchUrl = job.url
            if (resolved != null && resolved.code in 200..299 && resolved.total > 0) {
                job.total = resolved.total
            }
            val ctype = resolved?.contentType ?: ""
            if (
                job.name.endsWith(".apk", true) &&
                resolved != null &&
                resolved.code in 200..299 &&
                ctype.contains("text/html", true)
            ) {
                throw IOException("Server mengembalikan halaman, bukan APK. Buka halaman rilis, lalu ketuk berkasnya.")
            }

            var rangedTotal = -1L
            if (job.total > MULTI_MIN && job.threads > 1) {
                rangedTotal = confirmRange(job.fetchUrl, job.cookie, job)
                if (rangedTotal > 0) {
                    job.total = rangedTotal
                }
            }
            job.status = "downloading"
            job.lastByteAt = System.currentTimeMillis()
            emit(job)

            val useMulti = rangedTotal > MULTI_MIN && job.threads > 1 && !job.cancel.get()
            if (useMulti) {
                preallocate(job)
                downloadParallel(job)
                val short = job.total > 0 && job.done.get() < job.total - 4096
                if ((short || job.error != null) && !job.userCancel.get()) {
                    job.cancel.set(false)
                    job.error = null
                    job.done.set(0)
                    resetFile(job)
                    downloadPart(job, 0, -1)
                }
            } else if (!job.cancel.get()) {
                downloadPart(job, 0, -1)
            }

            if (jobs[job.id] == null) {
                return
            }
            val len = job.file?.length() ?: 0L
            val incomplete = job.total > 0 && len + 64 < job.total
            if (job.userCancel.get()) {
                job.status = "canceled"
                job.finishedAt = System.currentTimeMillis()
                deleteTarget(job)
            } else if (job.error != null || len <= 0L || incomplete) {
                job.status = "error"
                if (job.error == null) {
                    job.error = if (len <= 0L) "Berkas kosong" else "Unduhan tidak lengkap"
                }
                job.finishedAt = System.currentTimeMillis()
                deleteTarget(job)
            } else {
                job.file?.let { f ->
                    if (job.total < 0) {
                        job.total = f.length()
                    }
                    job.uri = publishPublic(f, job.mime)
                }
                job.status = "done"
                job.speed = 0
                job.done.set(job.file?.length() ?: job.done.get())
                job.finishedAt = System.currentTimeMillis()
            }
            if (job.status == "done") {
                notifyUser("Unduhan selesai", job.name, "job:${job.id}", job)
            } else if (job.status == "error") {
                notifyUser("Unduhan gagal", job.error ?: job.name, "job:${job.id}", job)
            }
            persist()
            emit(job)
        } catch (t: Throwable) {
            if (jobs[job.id] == null) {
                return
            }
            job.status = if (job.userCancel.get()) "canceled" else "error"
            if (job.error == null) {
                job.error = t.message ?: t.toString()
            }
            job.finishedAt = System.currentTimeMillis()
            deleteTarget(job)
            if (job.status == "error") {
                notifyUser("Unduhan gagal", job.error ?: job.name, "job:${job.id}")
            }
            persist()
            emit(job)
        }
    }

    private fun preallocate(job: Job) {
        val f = job.file ?: return
        if (job.total <= 0) {
            return
        }
        try {
            RandomAccessFile(f, "rw").use { it.setLength(job.total) }
        } catch (_: Throwable) {
        }
    }

    private fun resetFile(job: Job) {
        val f = job.file ?: return
        try {
            RandomAccessFile(f, "rw").use { it.setLength(0) }
        } catch (_: Throwable) {
            try {
                f.delete()
            } catch (_: Throwable) {
            }
        }
    }

    private fun downloadParallel(job: Job) {
        val total = job.total
        val n = job.threads.coerceIn(2, 4)
        val slice = total / n
        val workers = (0 until n).map { i ->
            val from = i * slice
            val to = if (i == n - 1) total - 1 else (i + 1) * slice - 1
            Thread({ downloadPart(job, from, to) }, "zenith-dl-$i")
        }
        workers.forEach { it.start() }
        workers.forEach { it.join() }
    }

    private class OutputHandle(val channel: FileChannel) : Closeable {
        override fun close() {
            try {
                channel.close()
            } catch (_: Throwable) {
            }
        }
    }

    private fun downloadPart(job: Job, from: Long, to: Long) {
        var pos = from
        var attempt = 0
        while (attempt < PART_RETRIES && !job.cancel.get() && (to < 0 || pos <= to)) {
            var conn: HttpURLConnection? = null
            try {
                conn = openConn(job.fetchUrl, if (to < 0 && pos == 0L) -1 else pos, to, job.cookie, job)
                job.liveConn = conn
                val code = conn.responseCode
                if (from > 0 && code != 206) {
                    throw IOException("server menolak Range (HTTP $code)")
                }
                if (code !in 200..299) {
                    val err = IOException(httpMessage(code))
                    if (code == 401 || code == 403 || code == 404 || code == 416) {
                        job.error = err.message
                        job.cancel.set(true)
                        return
                    }
                    throw err
                }
                if (from == 0L && code == 200) {
                    val len = conn.contentLengthLong
                    if (len > 0) {
                        job.total = len
                    }
                }
                val file = job.file ?: throw IOException("target unduhan hilang")
                OutputHandle(RandomAccessFile(file, "rw").channel).use { out ->
                    val buf = ByteArray(256 * 1024)
                    val input = conn.inputStream
                    while (!job.cancel.get()) {
                        var read = input.read(buf)
                        if (read < 0) {
                            break
                        }
                        if (to >= 0 && pos + read - 1 > to) {
                            read = (to - pos + 1).toInt()
                        }
                        if (read <= 0) {
                            break
                        }
                        val bb = ByteBuffer.wrap(buf, 0, read)
                        var p = pos
                        while (bb.hasRemaining()) {
                            val w = out.channel.write(bb, p)
                            if (w <= 0) {
                                throw IOException("gagal menulis berkas")
                            }
                            p += w
                        }
                        job.done.addAndGet(read.toLong())
                        pos += read
                        if (to >= 0 && pos > to) {
                            break
                        }
                    }
                }
                return
            } catch (t: Throwable) {
                attempt++
                if (attempt >= PART_RETRIES || job.cancel.get()) {
                    if (!job.cancel.get()) {
                        job.error = t.message ?: t.toString()
                        job.cancel.set(true)
                    }
                    return
                }
                try {
                    Thread.sleep(400L * attempt)
                } catch (_: InterruptedException) {
                    return
                }
            } finally {
                if (job.liveConn === conn) {
                    job.liveConn = null
                }
                conn?.disconnect()
            }
        }
    }

    private fun httpMessage(code: Int): String = when (code) {
        401, 403 -> "Server menolak unduhan (HTTP $code). Buka halaman sumber, lalu unduh lagi."
        404 -> "Berkas tidak ditemukan (HTTP 404)."
        416 -> "Server menolak permintaan Range."
        else -> "HTTP $code"
    }

    private fun publishPublic(file: File, displayMime: String): Uri? {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            return null
        }
        val resolver = reactApplicationContext.contentResolver
        val mimes = LinkedHashSet<String>()
        if (file.name.endsWith(".apk", true) || displayMime.contains("package-archive")) {
            mimes.add("application/vnd.android.package-archive")
            mimes.add("application/octet-stream")
        } else {
            if (displayMime.isNotBlank()) {
                mimes.add(displayMime)
            }
            mimes.add("application/octet-stream")
        }
        for (mime in mimes) {
            var uri: Uri? = null
            try {
                val values = ContentValues().apply {
                    put(MediaStore.MediaColumns.DISPLAY_NAME, file.name)
                    put(MediaStore.MediaColumns.MIME_TYPE, mime)
                    put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Zenith")
                    put(MediaStore.MediaColumns.IS_PENDING, 1)
                }
                uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values) ?: continue
                resolver.openOutputStream(uri)?.use { out ->
                    file.inputStream().use { input -> input.copyTo(out, 256 * 1024) }
                } ?: throw IOException("tidak dapat menulis MediaStore")
                val done = ContentValues().apply {
                    put(MediaStore.MediaColumns.IS_PENDING, 0)
                    put(MediaStore.MediaColumns.SIZE, file.length())
                }
                resolver.update(uri, done, null, null)
                return uri
            } catch (_: Throwable) {
                uri?.let {
                    try {
                        resolver.delete(it, null, null)
                    } catch (_: Throwable) {
                    }
                }
            }
        }
        return null
    }

    private fun fileUri(file: File): Uri =
        FileProvider.getUriForFile(
            reactApplicationContext,
            "${reactApplicationContext.packageName}.zenithprovider",
            file,
        )

    private fun viewMime(job: Job): String {
        if (job.name.endsWith(".apk", true) || job.mime.contains("package-archive")) {
            return "application/vnd.android.package-archive"
        }
        return job.mime.ifBlank { "*/*" }
    }

    private fun isApk(job: Job): Boolean =
        job.name.endsWith(".apk", true) || job.mime.contains("package-archive")

    private fun openJob(job: Job) {
        if (isApk(job) && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val can = reactApplicationContext.packageManager.canRequestPackageInstalls()
            if (!can) {
                val settings = Intent(
                    Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:${reactApplicationContext.packageName}"),
                ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                reactApplicationContext.startActivity(settings)
                throw IOException("Izinkan pemasangan aplikasi dari Zenith, lalu buka APK ini lagi.")
            }
        }
        val file = job.file
        if (file != null && file.exists()) {
            try {
                launchView(fileUri(file), viewMime(job), job.name)
                return
            } catch (t: Throwable) {
                if (job.uri == null) {
                    throw t
                }
            }
        }
        val uri = job.uri ?: throw IOException("Berkas tidak ada di perangkat.")
        launchView(uri, viewMime(job), job.name)
    }

    private fun launchView(uri: Uri, mime: String, title: String) {
        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, mime)
            clipData = ClipData.newRawUri(title, uri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        grantToMatches(intent, uri)
        reactApplicationContext.startActivity(intent)
    }

    private fun grantToMatches(intent: Intent, uri: Uri) {
        try {
            val matches = reactApplicationContext.packageManager.queryIntentActivities(intent, 0)
            for (ri in matches) {
                reactApplicationContext.grantUriPermission(
                    ri.activityInfo.packageName,
                    uri,
                    Intent.FLAG_GRANT_READ_URI_PERMISSION,
                )
            }
        } catch (_: Throwable) {
        }
    }

    private fun existsTarget(job: Job): Boolean =
        job.file?.exists() == true || job.uri != null

    private fun deleteTarget(job: Job) {
        job.uri?.let { uri ->
            try {
                reactApplicationContext.contentResolver.delete(uri, null, null)
            } catch (_: Throwable) {
            }
        }
        job.uri = null
        try {
            job.file?.delete()
        } catch (_: Throwable) {
        }
        job.file = null
    }

    private fun historyFile(): File = File(reactApplicationContext.filesDir, "zenith-downloads.json")

    private fun persist() {
        synchronized(historyLock) {
            val arr = JSONArray()
            for (job in jobs.values) {
                val o = JSONObject()
                o.put("id", job.id)
                o.put("url", job.url)
                o.put("name", job.name)
                o.put("mime", job.mime)
                o.put("status", job.status)
                o.put("total", job.total)
                o.put("done", job.done.get())
                o.put("error", job.error ?: "")
                o.put("finishedAt", job.finishedAt)
                o.put("file", job.file?.absolutePath ?: "")
                o.put("uri", job.uri?.toString() ?: "")
                o.put("threads", job.threads)
                arr.put(o)
            }
            val dest = historyFile()
            val tmp = File(dest.parentFile, "zenith-downloads.json.tmp")
            tmp.writeText(arr.toString())
            if (!tmp.renameTo(dest)) {
                dest.writeText(arr.toString())
                tmp.delete()
            }
        }
    }

    private fun loadHistory() {
        val f = historyFile()
        if (!f.exists()) {
            return
        }
        var dirty = false
        try {
            val arr = JSONArray(f.readText())
            for (i in 0 until arr.length()) {
                val o = arr.getJSONObject(i)
                var status = o.optString("status", "done")
                var error = o.optString("error").ifBlank { null }
                val path = o.optString("file")
                var file = if (path.isNotBlank()) File(path) else null
                if (status == "connecting" || status == "downloading") {
                    status = "error"
                    error = "Terputus saat aplikasi ditutup"
                    try {
                        file?.delete()
                    } catch (_: Throwable) {
                    }
                    file = null
                    dirty = true
                }
                val job = Job(
                    o.getString("id"),
                    o.optString("url"),
                    o.optString("uri").takeIf { it.isNotBlank() }?.let { Uri.parse(it) },
                    file?.takeIf { it.exists() },
                    o.optString("mime"),
                    o.optInt("threads", 1).coerceIn(1, 4),
                    o.optString("name", "unduhan"),
                )
                job.status = status
                job.total = o.optLong("total", -1)
                job.done.set(o.optLong("done", 0))
                job.error = error
                job.finishedAt = o.optLong("finishedAt", 0)
                if (job.finishedAt == 0L && status != "connecting" && status != "downloading") {
                    job.finishedAt = System.currentTimeMillis()
                }
                jobs[job.id] = job
            }
        } catch (_: Throwable) {
        }
        if (dirty) {
            persist()
        }
    }

    private fun reportAll() {
        val now = System.currentTimeMillis()
        for (job in jobs.values) {
            if (job.status != "downloading" && job.status != "connecting") {
                continue
            }
            val d = job.done.get()
            if (job.startedAt == 0L) {
                job.startedAt = now
            }
            if (d > job.lastDone) {
                job.lastByteAt = now
            }
            if (job.lastByteAt == 0L) {
                job.lastByteAt = job.startedAt
            }
            job.speed = ((d - job.lastDone) * 1000) / 500
            job.lastDone = d
            if (job.status == "connecting" && d == 0L && now - job.startedAt > 45_000) {
                stall(job, "Tidak ada data. Unduhan dihentikan agar tidak mengulang.")
                continue
            }
            if (job.status == "downloading" && d == 0L && now - job.lastByteAt > 20_000) {
                stall(job, "Tidak ada data. Unduhan dihentikan agar tidak mengulang.")
                continue
            }
            if (d > 0L && now - job.lastByteAt > 90_000) {
                stall(job, "Unduhan terhenti.")
                continue
            }
            emit(job)
        }
    }

    private fun stall(job: Job, message: String) {
        if (job.status != "connecting" && job.status != "downloading") {
            return
        }
        job.error = message
        job.cancel.set(true)
        job.status = "error"
        job.finishedAt = System.currentTimeMillis()
        try {
            job.liveConn?.disconnect()
        } catch (_: Throwable) {
        }
        notifyUser("Unduhan dihentikan", message, "job:${job.id}")
        persist()
        emit(job)
    }

    fun notifyUser(title: String, text: String, dedupeKey: String = "$title|$text", job: Job? = null) {
        val now = System.currentTimeMillis()
        val key = dedupeKey
        val prev = lastNotice[key] ?: 0L
        if (now - prev < 8_000) {
            return
        }
        lastNotice[key] = now
        val ctx = reactApplicationContext
        android.os.Handler(android.os.Looper.getMainLooper()).post {
            try {
                Toast.makeText(ctx, "$title — $text", Toast.LENGTH_LONG).show()
            } catch (_: Throwable) {
            }
            if (!askedNotify && Build.VERSION.SDK_INT >= 33) {
                askedNotify = true
                val act = ctx.currentActivity
                if (act != null && ctx.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) !=
                    android.content.pm.PackageManager.PERMISSION_GRANTED
                ) {
                    try {
                        act.requestPermissions(arrayOf(android.Manifest.permission.POST_NOTIFICATIONS), 4104)
                    } catch (_: Throwable) {
                    }
                }
            }
            try {
                val canNotify = Build.VERSION.SDK_INT < 33 ||
                    ctx.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) ==
                    android.content.pm.PackageManager.PERMISSION_GRANTED
                val nm = ctx.getSystemService(NotificationManager::class.java)
                if (canNotify && nm != null) {
                    if (Build.VERSION.SDK_INT >= 26) {
                        nm.createNotificationChannel(
                            NotificationChannel("zenith-downloads", "Unduhan", NotificationManager.IMPORTANCE_DEFAULT),
                        )
                    }
                    val pendingIntent = createDownloadPendingIntent(ctx, job)
                    val n = NotificationCompat.Builder(ctx, "zenith-downloads")
                        .setSmallIcon(android.R.drawable.stat_sys_download_done)
                        .setContentTitle(title)
                        .setContentText(text)
                        .setAutoCancel(true)
                        .setContentIntent(pendingIntent)
                        .build()
                    nm.notify(key.hashCode(), n)
                }
            } catch (_: Throwable) {
            }
        }
    }

    private fun createDownloadPendingIntent(ctx: Context, job: Job?): PendingIntent? {
        try {
            val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            } else {
                PendingIntent.FLAG_UPDATE_CURRENT
            }
            if (job != null && job.status == "done" && existsTarget(job)) {
                val file = job.file
                val uri = if (file != null && file.exists()) fileUri(file) else job.uri
                if (uri != null) {
                    val mime = viewMime(job)
                    val viewIntent = Intent(Intent.ACTION_VIEW).apply {
                        setDataAndType(uri, mime)
                        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
                        clipData = ClipData.newRawUri(job.name, uri)
                    }
                    grantToMatches(viewIntent, uri)
                    return PendingIntent.getActivity(ctx, job.id.hashCode(), viewIntent, flags)
                }
            }
            // Default: buka Zenith langsung ke halaman unduhan
            val openAppIntent = Intent(ctx, com.zenith.browser.MainActivity::class.java).apply {
                action = "com.zenith.browser.ACTION_OPEN_DOWNLOADS"
                putExtra("screen", "downloads")
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            }
            return PendingIntent.getActivity(ctx, 4104, openAppIntent, flags)
        } catch (_: Throwable) {
            return null
        }
    }

    private fun fileExists(job: Job): Boolean = job.file?.exists() == true || job.uri != null

    private fun jobToMap(job: Job): WritableMap {
        val m = Arguments.createMap()
        m.putString("id", job.id)
        m.putString("url", job.url)
        m.putString("filename", job.name)
        m.putString("path", job.uri?.toString() ?: job.file?.absolutePath ?: "")
        m.putString("mime", job.mime)
        m.putDouble("total", job.total.toDouble())
        m.putDouble("done", job.done.get().toDouble())
        m.putDouble("speed", job.speed.toDouble())
        m.putDouble("finishedAt", job.finishedAt.toDouble())
        m.putBoolean("fileExists", fileExists(job))
        m.putString("status", job.status)
        job.error?.let { m.putString("error", it) }
        return m
    }

    private fun emit(job: Job) {
        try {
            reactApplicationContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(EVENT, jobToMap(job))
        } catch (_: Throwable) {
        }
    }

    override fun invalidate() {
        DownloadBus.module = null
        super.invalidate()
    }
}
