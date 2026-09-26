package com.zenith.browser

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.zenith.browser.core.ZenithCorePackage
import com.zenith.browser.webview.ZenithWebViewPackage

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    // Ganti paket WebView bawaan dengan ZenithWebViewPackage (ad-block
    // level jaringan) dan daftarkan modul inti Rust (ZenithCore).
    val packages = PackageList(this).packages.map { pkg ->
      if (pkg is com.reactnativecommunity.webview.RNCWebViewPackage) {
        ZenithWebViewPackage()
      } else {
        pkg
      }
    }.toMutableList().apply {
      add(ZenithCorePackage())
    }

    getDefaultReactHost(
      context = applicationContext,
      packageList = packages,
    )
  }

  override fun onCreate() {
    super.onCreate()
    loadReactNative(this)
  }
}
