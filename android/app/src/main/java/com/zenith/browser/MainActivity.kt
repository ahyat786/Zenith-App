package com.zenith.browser

import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.WebView
import androidx.core.view.WindowCompat
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "Zenith"

  override fun onPause() {
    super.onPause()
    // Update mematikan proses. Kuki yang belum di-flush hilang dari disk.
    try {
      CookieManager.getInstance().flush()
    } catch (_: Throwable) {
    }
  }

  override fun onResume() {
    super.onResume()
    // Setelah lama di latar, timer dan permukaan WebView sering mati.
    // Tanpa onResume halaman tetap putih meski URL tab masih tersimpan.
    window?.decorView?.let { root ->
      forEachWebView(root) { webView ->
        try {
          webView.onResume()
          webView.resumeTimers()
          webView.post { webView.invalidate() }
        } catch (_: Throwable) {
        }
      }
    }
  }

  private fun forEachWebView(view: View, block: (WebView) -> Unit) {
    if (view is WebView) {
      block(view)
      return
    }
    if (view is ViewGroup) {
      for (i in 0 until view.childCount) {
        forEachWebView(view.getChildAt(i), block)
      }
    }
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    // Jangan pulihkan hierarki lama. Setelah proses dibunuh, state Android
    // sering mengembalikan WebView kosong dan React mengira URL sudah termuat.
    super.onCreate(null)
    // Edge-to-edge: pastikan konten digambar dari ujung ke ujung dan inset
    // sistem terlapor benar ke react-native-safe-area-context, sehingga
    // tombol bar bawah tidak tertutup area gestur dan tetap bisa diklik.
    try {
      WindowCompat.setDecorFitsSystemWindows(window, false)
    } catch (_: Throwable) {
      // perangkat lama — biarkan perilaku bawaan
    }
  }

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)
}
