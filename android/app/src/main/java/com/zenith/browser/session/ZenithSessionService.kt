package com.zenith.browser.session

import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder

/**
 * Layanan lama yang menampilkan "Zenith berjalan". Tidak lagi dijalankan.
 * Jika sistem masih membangunkannya setelah update, notifikasi dicabut lalu layanan berhenti.
 */
class ZenithSessionService : Service() {

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        try {
            val nm = getSystemService(NotificationManager::class.java)
            nm?.cancel(NOTIF_ID)
            if (Build.VERSION.SDK_INT >= 24) {
                stopForeground(STOP_FOREGROUND_REMOVE)
            }
        } catch (_: Throwable) {
        }
        stopSelf()
        return START_NOT_STICKY
    }

    companion object {
        private const val NOTIF_ID = 4107

        fun setInBackground(context: Context, background: Boolean) {
            stop(context)
        }

        fun start(context: Context) {
            stop(context)
        }

        fun stop(context: Context) {
            val app = context.applicationContext
            try {
                app.stopService(Intent(app, ZenithSessionService::class.java))
            } catch (_: Throwable) {
            }
            try {
                val nm = app.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
                nm?.cancel(NOTIF_ID)
            } catch (_: Throwable) {
            }
        }
    }
}
