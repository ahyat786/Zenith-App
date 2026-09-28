package com.zenith.browser.session

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Setelah update, cabut notifikasi latar lama. Tidak menjalankan layanan baru. */
class ZenithBootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        if (intent?.action != Intent.ACTION_MY_PACKAGE_REPLACED) {
            return
        }
        try {
            ZenithSessionService.stop(context.applicationContext)
        } catch (_: Throwable) {
        }
    }
}
