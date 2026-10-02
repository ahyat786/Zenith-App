package com.zenith.browser.core

import android.content.Context
import android.content.res.Configuration
import android.os.Build
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableMap
import com.google.android.material.color.DynamicColors
import com.google.android.material.color.MaterialColors

/**
 * Warna dinamis Material You (Material 3) untuk Zenith.
 *
 * Rujukan resmi:
 *  · developer.android.com/develop/ui/views/theming/dynamic-colors
 *    — "Dynamic color ... tersedia pada Android 12+ (API 31)"; API resminya
 *      `DynamicColors.isDynamicColorAvailable()` +
 *      `DynamicColors.wrapContextIfAvailable(context)`, lalu baca atribut
 *      tema dengan `MaterialColors.getColor()`.
 *  · developer.android.com/design/ui/mobile → Styles → Color (peran M3).
 *
 * Catatan desain yang disengaja: Zenith hanya mengambil keluarga
 * primer/sekunder/tersier + permukaan varian dari wallpaper. Warna netral
 * (bg/surface) tetap memakai token Zenith supaya identitas aplikasi dan
 * kontras teks tetap terjaga di semua wallpaper.
 */
object ZenithDynamicColor {

    /** Peran M3 → atribut Material Components. */
    private val ROLES: List<Pair<String, Int>> = listOf(
        "primary" to com.google.android.material.R.attr.colorPrimary,
        "onPrimary" to com.google.android.material.R.attr.colorOnPrimary,
        "primaryContainer" to com.google.android.material.R.attr.colorPrimaryContainer,
        "onPrimaryContainer" to com.google.android.material.R.attr.colorOnPrimaryContainer,
        "secondary" to com.google.android.material.R.attr.colorSecondary,
        "onSecondary" to com.google.android.material.R.attr.colorOnSecondary,
        "secondaryContainer" to com.google.android.material.R.attr.colorSecondaryContainer,
        "onSecondaryContainer" to com.google.android.material.R.attr.colorOnSecondaryContainer,
        "tertiary" to com.google.android.material.R.attr.colorTertiary,
        "onTertiary" to com.google.android.material.R.attr.colorOnTertiary,
        "surfaceVariant" to com.google.android.material.R.attr.colorSurfaceContainerHighest,
        "onSurfaceVariant" to com.google.android.material.R.attr.colorOnSurfaceVariant,
    )

    /** Palet dari wallpaper untuk mode tertentu, atau null bila tak didukung. */
    fun palette(context: Context, dark: Boolean): WritableMap? {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            return null
        }
        if (!DynamicColors.isDynamicColorAvailable()) {
            return null
        }
        // Mode malam mengikuti tema Zenith, bukan setelan sistem: konfigurasi
        // disalin lalu UI_MODE_NIGHT dipaksa sesuai tema aplikasi, BARU sesudah
        // itu dibungkus overlay dinamis Material 3 agar palet siang/malam yang
        // benar yang dibaca.
        val config = Configuration(context.resources.configuration)
        config.uiMode = (config.uiMode and Configuration.UI_MODE_NIGHT_MASK.inv()) or
            (if (dark) Configuration.UI_MODE_NIGHT_YES else Configuration.UI_MODE_NIGHT_NO)
        val scoped = context.createConfigurationContext(config)
        val themed = try {
            DynamicColors.wrapContextIfAvailable(
                scoped,
                com.google.android.material.R.style.ThemeOverlay_Material3_DynamicColors_DayNight,
            )
        } catch (t: Throwable) {
            return null
        }
        val map = Arguments.createMap()
        // ReadableMap tidak punya size(); hitung sendiri supaya tahu apakah
        // palet benar-benar terisi (kalau kosong → JS pakai token Zenith).
        var filled = 0
        for ((name, attr) in ROLES) {
            val argb = try {
                MaterialColors.getColor(scoped, attr, 0)
            } catch (t: Throwable) {
                continue
            }
            if (argb == 0) {
                continue
            }
            map.putString(name, String.format("#%06X", 0xFFFFFF and argb))
            filled += 1
        }
        return if (filled == 0) null else map
    }
}
