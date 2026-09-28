package com.zenith.browser.session

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Setelah boot atau update, coba lanjutkan layanan latar. Gagal diam-diam jika sistem menolak. */
class ZenithBootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        val action = intent?.action ?: return
        if (
            action != Intent.ACTION_BOOT_COMPLETED &&
            action != Intent.ACTION_MY_PACKAGE_REPLACED
        ) {
            return
        }
        try {
            ZenithSessionService.start(context.applicationContext)
        } catch (_: Throwable) {
        }
    }
}
