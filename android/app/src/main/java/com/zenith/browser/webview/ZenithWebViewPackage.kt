package com.zenith.browser.webview

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager
import com.reactnativecommunity.webview.RNCWebViewPackage

/**
 * Paket pengganti RNCWebViewPackage: modul RNCWebViewModule tetap dari
 * react-native-webview (diwarisi), tetapi ViewManager-nya diganti
 * ZenithWebViewManager agar WebView memakai ZenithWebViewClient.
 */
class ZenithWebViewPackage : RNCWebViewPackage() {

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> =
        listOf(ZenithWebViewManager())
}
