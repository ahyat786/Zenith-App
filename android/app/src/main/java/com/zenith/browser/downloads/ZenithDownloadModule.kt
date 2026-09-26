package com.zenith.browser.downloads

import android.content.Intent
import android.net.Uri
import android.os.Environment
import android.webkit.MimeTypeMap
import androidx.core.content.FileProvider
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.File
import java.io.IOException
import java.io.RandomAccessFile
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong

/**
 * Unduhan cepat ala Via: multi-thread (4 koneksi + Range request paralel).
 *
 * - Tidak butuh izin penyimpanan (folder eksternal milik aplikasi).
 * - Progres/kecepatan dikirim ke JS lewat event "ZenithDownloadProgress".
 * - Bila "fast" dimatikan dari pengaturan → fallback ke DownloadManager sistem.
 */
class ZenithDownloadModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "ZenithDownloads"
        const val EVENT = "ZenithDownloadProgress"
        private const val PART_RETRIES = 4
    }

    class Job(
        val id: String,
        val url: String,
        val file: File,
        val mime: String,
        val threads: Int,
    ) {
        val cancel = AtomicBoolean(false)
        val done = AtomicLong(0)
        @Volatile var total: Long = -1
        @Volatile var speed: Long = 0
        @Volatile var status: String = "connecting"
        @Volatile var error: String? = null
        @Volatile var lastDone: Long = 0
    }

    private val jobs = ConcurrentHashMap<String, Job>()
    private val pool = Executors.newCachedThreadPool()
    private val reporter = Executors.newSingleThreadScheduledExecutor()

    init {
        DownloadBus.module = this
        DownloadBus.drainPending()
        reporter.scheduleAtFixedRate(::reportAll, 600, 600, java.util.concurrent.TimeUnit.MILLISECONDS)
    }

    override fun getName(): String = NAME

    // ------------------------------------------------------------ API RN

    @ReactMethod
    fun start(url: String, filename: String?, mime: String?, connections: Int, promise: Promise) {
        try {
            val id = enqueue(url, filename, mime, connections)
            promise.resolve(id)
        } catch (t: Throwable) {
            promise.reject("ZENITH_DL", t.message ?: t.toString(), t)
        }
    }

    @ReactMethod
    fun cancel(id: String, promise: Promise) {
        jobs[id]?.let { it.cancel.set(true) }
        promise.resolve(true)
    }

    @ReactMethod
    fun list(promise: Promise) {
        val arr = com.facebook.react.bridge.Arguments.createArray()
        for (job in jobs.values) {
            arr.pushMap(jobToMap(job))
        }
        promise.resolve(arr)
    }

    @ReactMethod
    fun open(id: String, promise: Promise) {
        val job = jobs[id]
        if (job == null || !job.file.exists()) {
            promise.resolve(false)
            return
        }
        try {
            val uri = FileProvider.getUriForFile(
                reactApplicationContext, "${reactApplicationContext.packageName}.zenithprovider", job.file)
            val intent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(uri, job.mime.ifBlank { "*/*" })
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            reactApplicationContext.startActivity(intent)
            promise.resolve(true)
        } catch (t: Throwable) {
            promise.reject("ZENITH_DL_OPEN", t.message ?: t.toString(), t)
        }
    }

    @ReactMethod
    fun share(id: String, promise: Promise) {
        val job = jobs[id]
        if (job == null || !job.file.exists()) {
            promise.resolve(false)
            return
        }
        try {
            val uri = FileProvider.getUriForFile(
                reactApplicationContext, "${reactApplicationContext.packageName}.zenithprovider", job.file)
            val intent = Intent(Intent.ACTION_SEND).apply {
                type = job.mime.ifBlank { "*/*" }
                putExtra(Intent.EXTRA_STREAM, uri)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            reactApplicationContext.startActivity(Intent.createChooser(intent, job.file.name).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            promise.resolve(true)
        } catch (t: Throwable) {
            promise.reject("ZENITH_DL_SHARE", t.message ?: t.toString(), t)
        }
    }

    @ReactMethod
    fun remove(id: String, promise: Promise) {
        jobs[id]?.let { job ->
            job.cancel.set(true)
            job.file.delete()
            jobs.remove(id)
        }
        promise.resolve(true)
    }

    /** fast=false → WebView memakai DownloadManager sistem. */
    @ReactMethod
    fun setEnabled(enabled: Boolean, promise: Promise) {
        DownloadBus.fastEnabled = enabled
        promise.resolve(true)
    }

    @ReactMethod
    fun addListener(eventName: String) { /* wajib ada utk NativeEventEmitter */ }

    @ReactMethod
    fun removeListeners(count: Int) { /* wajib ada utk NativeEventEmitter */ }

    // ------------------------------------------------------------ inti

    fun enqueue(url: String, filenameIn: String?, mime: String?, connections: Int): String {
        var name = (filenameIn ?: "unduhan").replace(Regex("[\\\\/:*?\"<>|]"), "_").trim()
        if (name.isEmpty()) {
            name = "unduhan"
        }
        val dir = File(
            reactApplicationContext.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS)
                ?: reactApplicationContext.filesDir,
            "Zenith",
        ).apply { mkdirs() }
        var file = File(dir, name)
        var n = 1
        val base = file.nameWithoutExtension
        val ext = file.extension
        while (file.exists()) {
            file = File(dir, if (ext.isBlank()) "${base} (${n})" else "${base} (${n}).$ext")
            n++
        }
        val id = System.currentTimeMillis().toString(36) + (0..999).random().toString(36)
        val guessedMime = mime?.takeIf { it.isNotBlank() }
            ?: MimeTypeMap.getSingleton().getMimeTypeFromExtension(file.extension)
            ?: "application/octet-stream"
        val job = Job(id, url, file, guessedMime, connections.coerceIn(1, 8))
        jobs[id] = job
        emit(job)
        pool.execute { runJob(job) }
        return id
    }

    private fun openConn(url: String, rangeFrom: Long, rangeTo: Long): HttpURLConnection {
        val conn = URL(url).openConnection() as HttpURLConnection
        conn.connectTimeout = 15000
        conn.readTimeout = 20000
        conn.instanceFollowRedirects = true
        conn.setRequestProperty("User-Agent", "ZenithBrowser/0.2 Mozilla/5.0 (Linux; Android)")
        if (rangeTo >= 0) {
            conn.setRequestProperty("Range", "bytes=$rangeFrom-$rangeTo")
        } else if (rangeFrom > 0) {
            conn.setRequestProperty("Range", "bytes=$rangeFrom-")
        }
        return conn
    }

    private fun runJob(job: Job) {
        try {
            // probe: HEAD-like via Range 0-0 untuk deteksi dukungan range + ukuran
            val probe = openConn(job.url, 0, 0)
            val probeCode = probe.responseCode
            val contentRange = probe.getHeaderField("Content-Range") // bytes 0-0/TOTAL
            var total = probe.contentLengthLong
            if (contentRange != null) {
                val m = Regex("/(\\d+)\\s*$").find(contentRange)
                if (m != null) {
                    total = m.groupValues[1].toLong()
                }
            }
            probe.disconnect()
            if (probeCode !in 200..299) {
                throw IOException("HTTP $probeCode")
            }
            job.total = total
            job.status = "downloading"
            emit(job)

            if (total > 4 * 1048576 && probeCode == 206) {
                // multi-thread: bagi menjadi N bagian
                val n = job.threads
                val slice = total / n
                val workers = (0 until n).map { i ->
                    val from = i * slice
                    val to = if (i == n - 1) total - 1 else (i + 1) * slice - 1
                    Thread { downloadPart(job, from, to) }
                }
                workers.forEach { it.start() }
                workers.forEach { it.join() }
            } else {
                // satu aliran (ukuran kecil / server tanpa Range)
                downloadPart(job, 0, if (total > 0) total - 1 else -1)
            }

            if (job.cancel.get()) {
                job.status = "canceled"
                job.file.delete()
            } else if (job.total > 0 && job.done.get() < job.total) {
                job.status = "error"
                job.error = "unduhan tidak lengkap"
            } else {
                job.status = "done"
                job.speed = 0
            }
            emit(job)
        } catch (t: Throwable) {
            job.status = if (job.cancel.get()) "canceled" else "error"
            if (job.error == null) {
                job.error = t.message ?: t.toString()
            }
            emit(job)
        }
    }

    private fun downloadPart(job: Job, from: Long, to: Long) {
        var pos = from
        var attempt = 0
        while (attempt < PART_RETRIES && !job.cancel.get() && (to < 0 || pos <= to)) {
            var conn: HttpURLConnection? = null
            try {
                conn = openConn(job.url, pos, to)
                val code = conn.responseCode
                if (code !in 200..299) {
                    throw IOException("HTTP $code")
                }
                RandomAccessFile(job.file, "rw").use { raf ->
                    raf.seek(pos)
                    val buf = ByteArray(64 * 1024)
                    val input = conn.inputStream
                    while (!job.cancel.get()) {
                        val read = input.read(buf)
                        if (read < 0) {
                            break
                        }
                        raf.write(buf, 0, read)
                        job.done.addAndGet(read.toLong())
                        pos += read
                    }
                }
                return // bagian selesai
            } catch (t: Throwable) {
                attempt++
                if (attempt >= PART_RETRIES) {
                    if (!job.cancel.get()) {
                        job.error = t.message ?: t.toString()
                        job.cancel.set(true) // hentikan pekerja lain
                    }
                    return
                }
                try {
                    Thread.sleep(700L * attempt)
                } catch (_: InterruptedException) {
                    return
                }
            } finally {
                conn?.disconnect()
            }
        }
    }

    private fun reportAll() {
        var active = false
        for (job in jobs.values) {
            if (job.status == "downloading" || job.status == "connecting") {
                active = true
                val d = job.done.get()
                job.speed = ((d - job.lastDone) * 1000) / 600
                job.lastDone = d
                emit(job)
            }
        }
        if (!active) {
            // tidak ada yang aktif — tidak perlu emit
        }
    }

    private fun jobToMap(job: Job): WritableMap {
        val m = com.facebook.react.bridge.Arguments.createMap()
        m.putString("id", job.id)
        m.putString("url", job.url)
        m.putString("filename", job.file.name)
        m.putString("path", job.file.absolutePath)
        m.putDouble("total", job.total.toDouble())
        m.putDouble("done", job.done.get().toDouble())
        m.putDouble("speed", job.speed.toDouble())
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
            // konteks mungkin sudah mati
        }
    }

    override fun invalidate() {
        DownloadBus.module = null
        super.invalidate()
    }
}
