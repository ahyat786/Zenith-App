package com.zenith.browser.session

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import com.zenith.browser.MainActivity

/**
 * Menjaga proses Zenith tetap hidup saat aplikasi di latar, dengan notifikasi
 * yang terlihat. Pola yang sama dengan layanan latar KDE Connect, tanpa izin
 * telepon, SMS, kontak, atau lokasi.
 */
class ZenithSessionService : Service() {

    private var wakeLock: PowerManager.WakeLock? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        return try {
            promote()
            if (intent?.hasExtra(EXTRA_BACKGROUND) == true) {
                setBackground(intent.getBooleanExtra(EXTRA_BACKGROUND, false))
            }
            START_STICKY
        } catch (_: Throwable) {
            stopSelf()
            START_NOT_STICKY
        }
    }

    override fun onDestroy() {
        setBackground(false)
        super.onDestroy()
    }

    private fun setBackground(background: Boolean) {
        val lock = wakeLock ?: (getSystemService(POWER_SERVICE) as? PowerManager)
            ?.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "zenith:session")
            ?.also {
                it.setReferenceCounted(false)
                wakeLock = it
            }
        if (lock == null) {
            return
        }
        if (background) {
            if (!lock.isHeld) {
                lock.acquire(6 * 60 * 60 * 1000L)
            }
        } else if (lock.isHeld) {
            lock.release()
        }
    }

    private fun promote() {
        val nm = getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= 26 && nm != null) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Latar belakang",
                NotificationManager.IMPORTANCE_LOW,
            )
            channel.setShowBadge(false)
            channel.description = "Zenith tetap berjalan supaya tab dan unduhan tidak dihentikan."
            nm.createNotificationChannel(channel)
        }
        val open = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_notify_sync)
            .setContentTitle("Zenith berjalan")
            .setContentText("Tab dan unduhan tetap aktif di latar belakang.")
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(open)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .build()
        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(NOTIF_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        } else {
            startForeground(NOTIF_ID, notification)
        }
    }

    companion object {
        private const val CHANNEL_ID = "zenith-session"
        private const val NOTIF_ID = 4107
        private const val EXTRA_BACKGROUND = "background"

        fun setInBackground(context: Context, background: Boolean) {
            val intent = Intent(context, ZenithSessionService::class.java)
                .putExtra(EXTRA_BACKGROUND, background)
            try {
                if (Build.VERSION.SDK_INT >= 26) {
                    context.startForegroundService(intent)
                } else {
                    context.startService(intent)
                }
            } catch (_: Throwable) {
                try {
                    context.startService(intent)
                } catch (_: Throwable) {
                }
            }
        }

        fun start(context: Context) {
            val intent = Intent(context, ZenithSessionService::class.java)
            if (Build.VERSION.SDK_INT >= 26) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }
    }
}
