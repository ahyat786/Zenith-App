package com.zenith.browser.webview

import com.facebook.react.uimanager.ThemedReactContext
import com.reactnativecommunity.webview.RNCWebViewManager
import com.reactnativecommunity.webview.RNCWebViewWrapper

/**
 * Manager WebView Zenith — menggantikan RNCWebViewManager bawaan
 * react-native-webview dengan nama komponen yang sama ("RNCWebView"),
 * tetapi memasang ZenithWebViewClient (pemblokir iklan level jaringan).
 *
 * Semua perilaku react-native-webview lainnya diwarisi apa adanya.
 */
class ZenithWebViewManager : RNCWebViewManager() {

    override fun getName(): String = "RNCWebView"

    override fun addEventEmitters(reactContext: ThemedReactContext, view: RNCWebViewWrapper) {
        super.addEventEmitters(reactContext, view)
        view.webView.setWebViewClient(ZenithWebViewClient())
    }
}
