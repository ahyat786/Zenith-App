package com.zenith.browser.core

import android.app.Activity
import android.os.Build
import android.view.Window
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.facebook.react.uimanager.PixelUtil
import java.lang.ref.WeakReference

/**
 * Bilah sistem + inset keyboard (IME).
 *
 * Rujukan resmi Android:
 *  · System bars (edge-to-edge, warna ikon, kontras navigation bar):
 *    https://developer.android.com/design/ui/mobile/guides/foundations/system-bars
 *  · WindowInsets / IME pada Android 15 (adjustResize tidak lagi bekerja):
 *    https://developer.android.com/develop/ui/views/layout/edge-to-edge
 *
 * Sejak targetSdk 35 jendela digambar dari ujung ke ujung. Tinggi keyboard
 * TIDAK lagi tersedia lewat perubahan ukuran jendela, jadi Zenith menghitungnya
 * dari WindowInsets dan mengirimkannya ke JS (event "ZenithImeInsets").
 */
object ZenithSystemBars {

    const val EVENT_IME = "ZenithImeInsets"

    private var activityRef: WeakReference<Activity>? = null
    private var contextRef: WeakReference<ReactApplicationContext>? = null
    private var tracking = false
    private var savedImePx = 0
    private var lastEmittedDp = -1.0

    fun bind(context: ReactApplicationContext) {
        contextRef = WeakReference(context)
    }

    /** Pasang pemantau inset pada decorView aktivitas (dipanggil saat resume). */
    fun attach(activity: Activity?) {
        val act = activity ?: return
        activityRef = WeakReference(act)
        val decor = act.window?.decorView ?: return
        ViewCompat.setOnApplyWindowInsetsListener(decor) { _, insets ->
            val imePx = insets.getInsets(WindowInsetsCompat.Type.ime()).bottom
            savedImePx = imePx
            maybeEmit(imePx)
            insets
        }
        ViewCompat.requestApplyInsets(decor)
    }

    private fun maybeEmit(imePx: Int) {
        if (!tracking) {
            return
        }
        val context = contextRef?.get() ?: return
        val dp = try {
            PixelUtil.toDIPFromPixel(imePx.toFloat()).toDouble()
        } catch (_: Throwable) {
            (imePx / 2.75)
        }
        if (Math.abs(dp - lastEmittedDp) < 1.0) {
            return
        }
        lastEmittedDp = dp
        try {
            val map = Arguments.createMap()
            map.putDouble("height", dp)
            map.putBoolean("visible", dp > 0)
            context
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(EVENT_IME, map)
        } catch (_: Throwable) {
        }
    }

    fun startTracking() {
        tracking = true
        attach(activityRef?.get())
    }

    fun imeInsetDp(): Double = try {
        PixelUtil.toDIPFromPixel(savedImePx.toFloat()).toDouble()
    } catch (_: Throwable) {
        0.0
    }

    /**
     * Warna ikon bilah sistem mengikuti tema aplikasi.
     * Bila tema terang → ikon gelap; sekaligus mematikan "scrim" kontras
     * navigation bar supaya tampilan edge-to-edge tetap bersih.
     */
    fun applyAppearance(lightStatusBar: Boolean, lightNavBar: Boolean): Boolean {
        val activity = activityRef?.get() ?: return false
        val window: Window = activity.window ?: return false
        return try {
            val controller = WindowCompat.getInsetsController(window, window.decorView)
            controller.isAppearanceLightStatusBars = lightStatusBar
            controller.isAppearanceLightNavigationBars = lightNavBar
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                window.isNavigationBarContrastEnforced = false
                window.isStatusBarContrastEnforced = false
            }
            true
        } catch (_: Throwable) {
            false
        }
    }
}
