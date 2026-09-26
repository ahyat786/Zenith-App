package com.zenith.browser.downloads

import android.content.ContentValues
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
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
 * Unduhan cepat multi-thread (4 koneksi + Range paralel).
 *
 * Tujuan penyimpanan:
 *  - Android 10+ (API 29): folder Download/Zenith PUBLIK via MediaStore
 *    (tanpa izin apa pun — terlihat di aplikasi File / galeri unduhan).
 *  - Android 7–9: folder milik aplikasi (fallback), dibuka via FileProvider.
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
        val uri: Uri?, // target MediaStore (API 29+)
        val file: File?, // target legacy (fallback)
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
        val displayName: String get() = file?.name ?: uri?.lastPathSegment ?: "unduhan"
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
        if (job == null || !existsTarget(job)) {
            promise.resolve(false)
            return
        }
        try {
            val intent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(targetUri(job), job.mime.ifBlank { "*/*" })
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
        if (job == null || !existsTarget(job)) {
            promise.resolve(false)
            return
        }
        try {
            val intent = Intent(Intent.ACTION_SEND).apply {
                type = job.mime.ifBlank { "*/*" }
                putExtra(Intent.EXTRA_STREAM, targetUri(job))
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            reactApplicationContext.startActivity(
                Intent.createChooser(intent, job.displayName).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            )
            promise.resolve(true)
        } catch (t: Throwable) {
            promise.reject("ZENITH_DL_SHARE", t.message ?: t.toString(), t)
        }
    }

    @ReactMethod
    fun remove(id: String, promise: Promise) {
        jobs[id]?.let { job ->
            job.cancel.set(true)
            deleteTarget(job)
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

    // ------------------------------------------------------------ target

    private fun legacyFile(name: String): File {
        val dir = File(
            reactApplicationContext.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS)
                ?: reactApplicationContext.filesDir,
            "Zenith",
        ).apply { mkdirs() }
        var f = File(dir, name)
        var i = 1
        val base = f.nameWithoutExtension
        val ext = f.extension
        while (f.exists()) {
            f = File(dir, if (ext.isBlank()) "${base} ($i)" else "${base} ($i).$ext")
            i++
        }
        return f
    }

    private fun createTarget(name: String, mime: String): Pair<Uri?, File?> {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            try {
                val values = ContentValues().apply {
                    put(MediaStore.MediaColumns.DISPLAY_NAME, name)
                    put(MediaStore.MediaColumns.MIME_TYPE, mime)
                    put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Zenith")
                    put(MediaStore.MediaColumns.IS_PENDING, 1)
                }
                val uri = reactApplicationContext.contentResolver
                    .insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
                if (uri != null) {
                    return uri to null
                }
            } catch (_: Throwable) {
                // jatuh ke legacy
            }
        }
        return null to legacyFile(name)
    }

    private fun targetUri(job: Job): Uri =
        job.uri ?: FileProvider.getUriForFile(
            reactApplicationContext,
            "${reactApplicationContext.packageName}.zenithprovider",
            job.file!!,
        )

    private fun existsTarget(job: Job): Boolean =
        if (job.uri != null) true else (job.file?.exists() == true)

    private fun deleteTarget(job: Job) {
        job.uri?.let { uri ->
            try {
                reactApplicationContext.contentResolver.delete(uri, null, null)
            } catch (_: Throwable) {
            }
        } ?: run {
            job.file?.delete()
        }
    }

    private fun finishTarget(job: Job) {
        job.uri?.let { uri ->
            try {
                val values = ContentValues().apply {
                    put(MediaStore.MediaColumns.IS_PENDING, 0)
                }
                reactApplicationContext.contentResolver.update(uri, values, null, null)
            } catch (_: Throwable) {
            }
        }
    }

    /** Buka target sebagai berkas akses acak (mendukung seek utk multi-thread). */
    private fun openRaf(job: Job): RandomAccessFile {
        job.uri?.let { uri ->
            val pfd = reactApplicationContext.contentResolver.openFileDescriptor(uri, "rw")
                ?: throw IOException("tidak dapat membuka target unduhan")
            return RandomAccessFile(pfd.fileDescriptor, "rw")
        }
        return RandomAccessFile(job.file!!, "rw")
    }

    // ------------------------------------------------------------ inti

    fun enqueue(url: String, filenameIn: String?, mime: String?, connections: Int): String {
        var name = (filenameIn ?: "unduhan").replace(Regex("[\\\\/:*?\"<>|]"), "_").trim()
        if (name.isEmpty()) {
            name = "unduhan"
        }
        val guessedMime = mime?.takeIf { it.isNotBlank() }
            ?: MimeTypeMap.getSingleton().getMimeTypeFromExtension(File(name).extension)
            ?: "application/octet-stream"
        val (uri, file) = createTarget(name, guessedMime)
        val id = System.currentTimeMillis().toString(36) + (0..999).random().toString(36)
        val job = Job(id, url, uri, file, guessedMime, connections.coerceIn(1, 8))
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
        conn.setRequestProperty("User-Agent", "ZenithBrowser/0.3 Mozilla/5.0 (Linux; Android)")
        if (rangeTo >= 0) {
            conn.setRequestProperty("Range", "bytes=$rangeFrom-$rangeTo")
        } else if (rangeFrom > 0) {
            conn.setRequestProperty("Range", "bytes=$rangeFrom-")
        }
        return conn
    }

    private fun runJob(job: Job) {
        try {
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
                downloadPart(job, 0, if (total > 0) total - 1 else -1)
            }

            if (job.cancel.get()) {
                job.status = "canceled"
                deleteTarget(job)
            } else if (job.total > 0 && job.done.get() < job.total) {
                job.status = "error"
                job.error = "unduhan tidak lengkap"
                deleteTarget(job)
            } else {
                job.status = "done"
                job.speed = 0
                finishTarget(job)
            }
            emit(job)
        } catch (t: Throwable) {
            job.status = if (job.cancel.get()) "canceled" else "error"
            if (job.error == null) {
                job.error = t.message ?: t.toString()
            }
            if (job.status == "error") {
                deleteTarget(job)
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
                openRaf(job).use { raf ->
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
                return
            } catch (t: Throwable) {
                attempt++
                if (attempt >= PART_RETRIES) {
                    if (!job.cancel.get()) {
                        job.error = t.message ?: t.toString()
                        job.cancel.set(true)
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
        for (job in jobs.values) {
            if (job.status == "downloading" || job.status == "connecting") {
                val d = job.done.get()
                job.speed = ((d - job.lastDone) * 1000) / 600
                job.lastDone = d
                emit(job)
            }
        }
    }

    private fun jobToMap(job: Job): WritableMap {
        val m = com.facebook.react.bridge.Arguments.createMap()
        m.putString("id", job.id)
        m.putString("url", job.url)
        m.putString("filename", job.displayName)
        m.putString("path", job.uri?.toString() ?: job.file?.absolutePath ?: "")
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
        }
    }

    override fun invalidate() {
        DownloadBus.module = null
        super.invalidate()
    }
}
