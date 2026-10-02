# Zenith v0.6.0 — Pemeriksaan silang panduan resmi Android (UI/UX + WebView)

Dokumen ini menjawab permintaan: **cross-check** lima halaman resmi Android Developers,
lalu **memperbarui dan memperbaiki** Zenith-App agar sesuai panduan tersebut.

Tanggal pemeriksaan: 2 Oktober 2026 · Basis kode: v0.5.2 (`6204583`) → **v0.6.0**

---

## 1. Sumber yang diperiksa

| # | Halaman resmi | Fokus yang diambil |
| --- | --- | --- |
| 1 | [UI Design → Gallery](https://developer.android.com/design/ui/gallery?hl=id) | Pola UX per kategori (produktivitas, media, membaca, sosial) + pola adaptif multi-panel/tarik-lepas, contoh aplikasi yang layak ditiru untuk tata letak browser |
| 2 | [UI Design → Mobile](https://developer.android.com/design/ui/mobile?hl=id) | Dasar (system bars, aksesibilitas), **Gaya** (warna/jenis huruf/gerakan/tema), **Tata letak & konten**, **Perilaku & pola** (kembali prediktif, setelan), **Komponen** (Material 3), Layar utama (notifikasi) |
| 3 | [Membangun aplikasi web di WebView](https://developer.android.com/develop/ui/views/layout/webapps/webview?hl=id) | Jetpack Webkit, penambahan WebView, JavaScript, `shouldOverrideUrlLoading`, URL kustom, histori (`goBack`/`goForward`, `saveState`/`restoreState`), perubahan konfigurasi, **kelola jendela/pop-up**, memori & performa |
| 4 | [Develop → Core areas](https://developer.android.com/develop?hl=id#core-areas) | Peta area inti (UI, arsitektur, privasi, keamanan, performa) sebagai daftar periksa |
| 5 | [Develop → UI](https://developer.android.com/develop/ui?hl=id) | Praktik implementasi UI (View/Compose, insets, aksesibilitas, tema) |

Ringkasan ketentuan yang **berdampak langsung** ke Zenith: *Material 3 (warna peran, type scale, bentuk, elevation)*,
*edge-to-edge + inset sistem/IME*, *target sentuh ≥ 48dp*, *ripple sebagai state layer*, *sheet/dialog berukuran M3*,
*ikon adaptif + ikon bertema (monokrom)*, *splash screen Android 12+*, *label aksesibilitas*, *layout adaptif untuk tablet/lipat*,
serta pada sisi WebView: *Jetpack Webkit*, *mode gelap konten*, *kelola pop-up*, *histori*, *memori*.

---

## 2. Yang sudah sesuai sebelum v0.6.0 (dipertahankan)

- **Edge-to-edge teknis**: `WindowCompat.setDecorFitsSystemWindows(window, false)` sudah dipasang di `MainActivity`, dan inset dipakai lewat `react-native-safe-area-context`.
- **JavaScript & jembatan**: Zenith memakai `injectedJavaScriptBeforeContentLoaded` + `onMessage` (kanal pesan), **bukan** `addJavascriptInterface`. Ini pilihan yang lebih aman daripada contoh di dokumen WebView, karena interface Java tidak diekspos ke JavaScript halaman web.
- **`mixedContentMode="never"`**, `thirdPartyCookiesEnabled={false}` pada tab privat, dan pemblokiran sub-sumber daya lewat `shouldInterceptRequest` (mesin Rust) — sejalan dengan bagian keamanan.
- **Pop-up**: `onOpenWindow` → tab baru (lihat §4, deviasi terdokumentasi).
- **Anti-loop tab aktif**: penyebab "tab terus me-refresh" sudah dibereskan di v0.5.2 (URL awal dibekukan per WebView; `setNewSource` sinkron & idempoten).

---

## 3. Perubahan UI/UX v0.6.0 (Material 3)

| Ketentuan resmi | Sebelum | Sesudah (v0.6.0) | Berkas |
| --- | --- | --- | --- |
| **Warna = peran** (primary, onPrimary, primaryContainer, surfaceContainer…), bukan nilai acak | Palet kustom `#8b7cf6`, kartu `#211F26`-an | Token M3 lengkap: peran M3 + alias lama (agar layar lama tidak perlu ditulis ulang). Gelap & terang dari *baseline palette* M3 | `src/theme.ts` |
| **Bidang permukaan bertingkat** (surface container lowest→highest) | `surface`, `surface2` saja | `surfaceContainerLowest…Highest` + `elevation` level 0–5, kartu/sheet/dialog/FAB | `src/theme.ts` |
| **Type scale M3** (titleMedium, bodyLarge, labelLarge…) | Ukuran manual 12–22px, bobot campur | `type` (display→label) dipakai di top app bar, baris daftar, kartu, omnibox, dialog | `src/theme.ts`, `kit.tsx`, `ScreenShell.tsx`, `NewTabPage.tsx`, `Omnibox.tsx`, `TabSwitcher.tsx` |
| **Bentuk M3**: 4 · 8 · 12 · 16 · 28 | radius 10/14/20 | `radius.xs…xl` (28 untuk sheet & dialog) | `src/theme.ts` |
| **Target sentuh ≥ 48dp** | Tombol ikon 34–46dp | Semua `IconButton` 48×48; tombol tutup kartu 32dp + `hitSlop` 12; FAB 56dp | `kit.tsx`, `BrowserScreen.tsx`, `TabSwitcher.tsx` |
| **Ripple (state layer) pada semua permukaan interaktif** | Sebagian tanpa ripple | `android_ripple` di baris, chip, kartu tab, pintasan, banner unduhan, tombol dialog | `kit.tsx` dan pemakainya |
| **Bottom sheet M3**: sudut atas 28dp, gagang tarik, scrim | Sudut 20dp, tanpa gagang | `Sheet` baru: gagang 32×4, radius 28, scrim `theme.scrim`, `statusBarTranslucent` + `navigationBarTranslucent`, tinggi keyboard diperhitungkan | `kit.tsx` |
| **Dialog M3**: radius 28, aksi teks di kanan | Modal khusus berwarna gelap hardcoded (`#1E1B24`) → rusak di tema terang | Komponen `Dialog` bertema + dipakai untuk konfirmasi unduhan | `kit.tsx`, `BrowserScreen.tsx` |
| **Switch M3** (track `primary`, thumb `onPrimary`/`outline`) | thumb putih selalu | `ToggleRow` memakai warna peran M3 | `kit.tsx` |
| **Chip filter M3** 32dp | Pill tinggi 26–30dp | Komponen `Chip` (workspace, mesin pencari) | `kit.tsx`, `BrowserScreen.tsx`, `Omnibox.tsx` |
| **Progress indikator** 4dp membulat + track | 2,5dp tanpa track | 4dp, berujung bulat, jalur `surfaceVariant`, label aksesibilitas | `BrowserScreen.tsx` |
| **Tata letak adaptif** (kelas ukuran jendela) | Grid pintasan 4 kolom tetap, kartu tab 47% (2 kolom) | `useAdaptiveLayout`: compact <600dp, medium 600–839, expanded ≥840 → pintasan 4/6/8 kolom, kartu tab 2/3/4 kolom, konten dibatasi 720–840dp dan dipusatkan | `src/design/adaptive.ts`, `NewTabPage.tsx`, `TabSwitcher.tsx`, `ScreenShell.tsx` |
| **Edge-to-edge & system bars** | Status bar dibiarkan bawaan; inset bawah dipakai | Status bar transparan; **warna ikon status/navigation bar mengikuti tema** lewat modul native; `isNavigationBarContrastEnforced=false` | `ZenithSystemBars.kt`, `ZenithCoreModule.kt`, `src/core/systemUi.ts`, `BrowserScreen.tsx` |
| **Inset IME (Android 15+: `adjustResize` tidak lagi bekerja)** | Panel/daftar bisa tertutup keyboard | Tinggi keyboard dibaca dari `WindowInsets.Type.ime()` dan dikirim ke JS (`ZenithImeInsets`); sheet naik, bilah alat bawah disembunyikan saat mengetik | `ZenithSystemBars.kt`, `src/core/systemUi.ts`, `kit.tsx`, `Omnibox.tsx`, `BrowserScreen.tsx` |
| **Splash screen Android 12+** | Latar putih sekilas saat membuka aplikasi | `windowSplashScreenBackground`/`AnimatedIcon` + `windowBackground` warna permukaan Zenith | `res/values/styles.xml`, `res/values-v31/styles.xml`, `res/values/colors.xml`, `res/drawable/ic_splash_logo.xml` |
| **Ikon adaptif + ikon bertema (monokrom)** | Adaptive icon tanpa lapisan monokrom | `<monochrome>` ditambahkan (ikon ikut warna wallpaper di Android 13+) | `res/mipmap-anydpi-v26/ic_launcher.xml`, `ic_launcher_round.xml`, `res/drawable/ic_launcher_monochrome.xml` |
| **Aksesibilitas** (label untuk pembaca layar, status terpilih/nonaktif) | Banyak tombol ikon tanpa label | `accessibilityRole`/`accessibilityLabel`/`accessibilityState` pada tombol ikon, baris, chip, kartu tab, pintasan, progress | `kit.tsx` + pemakainya |
| **Navigasi kembali prediktif** (Android 13+) | Sudah ditangani RN 0.87 | Dinyatakan eksplisit di manifes (`enableOnBackInvokedCallback=true`); perilaku kembali dijelaskan di §4 | `AndroidManifest.xml` |

---

## 4. Pemeriksaan silang khusus halaman WebView

Sumber: <https://developer.android.com/develop/ui/views/layout/webapps/webview?hl=id>

| Ketentuan dokumen | Status di Zenith v0.6.0 | Bukti/berkas |
| --- | --- | --- |
| Tambahkan **Jetpack Webkit** (`androidx.webkit:webkit`) agar API WebView baru bisa dipakai aman di perangkat lama | **Diterapkan**: dependensi eksplisit `androidx.webkit:webkit:1.11.0` (versi lebih baru dari bawaan react-native-webview) | `android/app/build.gradle` |
| Aktifkan JavaScript lewat `WebSettings` | Sudah (per situs: `javascriptEnabled`) | `TabView.tsx`, `SiteSettingsScreen` |
| Ikat JavaScript ↔ Android; untuk API modern gunakan JSBridge yang aman, bukan `addJavascriptInterface` | Zenith memakai `injectedJavaScriptBeforeContentLoaded` + `onMessage` (tanpa mengekspos objek Java ke halaman) | `src/core/inject.ts`, `TabView.tsx` |
| Tangani `shouldOverrideUrlLoading`: muat di WebView, atau luncurkan Intent untuk tautan luar | `onShouldStartLoadWithRequest`: skema eksternal (`mailto:`, `tel:`, `sms:`, `geo:`, `market:`, `intent:`) → aplikasi lain; sisanya di WebView | `TabView.tsx` |
| **URL kustom**: skema non-hierarkis tanpa garis miring akhir | Zenith membuka skema eksternal lewat `Linking.openURL` (tidak meneruskan URL tak valid ke WebView), dan memaksa HTTPS untuk frame utama (host lokal dikecualikan) | `TabView.tsx` |
| Histori: `goBack()`/`goForward()`, cek `canGoBack()`/`canGoForward()` | Sudah, tombol dinonaktifkan sesuai `canGoBack`/`canGoForward`; beralih tab tidak memuat ulang | `TabView.tsx`, `BrowserScreen.tsx` |
| Pertahankan histori setelah pembuatan ulang aktivitas / proses dibunuh: `saveState()` + `restoreState()`; jaga ukuran Bundle (`TransactionTooLargeException`) | **Belum diterapkan** (jujur dicatat): Zenith menyimpan URL tab, bukan riwayat WebView. Butuh penyimpanan state di native + pemulihan per tab → rekomendasi lanjutan §7 | — |
| Perubahan konfigurasi (rotasi, IME) | Aktivitas menangani sendiri `orientation|screenSize|keyboard|uiMode`, jadi WebView tidak dibangun ulang; inset IME dibaca manual (Android 15) | `AndroidManifest.xml`, `ZenithSystemBars.kt` |
| **Kelola jendela**: hindari pop-up; bila memakai `setSupportMultipleWindows`, jangan melewati `onCreateWindow` | **Deviasi terdokumentasi**: Zenith adalah *browser*, jadi `target="_blank"`/`window.open` **dibuka sebagai tab baru**, bukan diblokir — dan tab baru itu melewati jalur navigasi normal Zenith (validasi URL, perisai, profil). react-native-webview memasang `setSupportMultipleWindows(true)`; Zenith memasang `onOpenWindow` sehingga jendela baru tidak pernah menjadi WebView yatim | `TabView.tsx`, `ZenithWebViewManager.kt` |
| **Mode gelap konten web** | **Diterapkan**: `forceDarkOn` mengikuti tema aplikasi; di Android 13+ memakai *algorithmic darkening* Jetpack Webkit (bawaan react-native-webview masih memakai `setForceDark` yang usang — no-op sejak targetSdk 33). Tema Android juga diselaraskan (`AppCompatDelegate.setDefaultNightMode`) agar media query `prefers-color-scheme` cocok dengan tema Zenith | `TabView.tsx`, `ZenithWebViewManager.kt`, `ZenithCoreModule.kt`, `src/core/systemUi.ts` |
| Keamanan: **Safe Browsing** | **Diterapkan**: `WebSettingsCompat.setSafeBrowsingEnabled(true)` bila didukung | `ZenithWebViewManager.kt` |
| Video layar penuh (`onShowCustomView`) | **Diterapkan**: properti `allowsFullscreenVideo` aktif, sehingga pemutar HTML5 bisa layar penuh | `TabView.tsx` |
| Memori & performa: pakai ulang instance, hancurkan dengan benar, jangan menahan banyak WebView | Tab tidak aktif **dilepas** dari hierarki (`display:none`/unmount) dan `onDropViewInstance` memanggil `stopLoading()` + `onPause()` sebelum dibuang. Rekomendasi keep-alive 3 tab ada di §7 | `ZenithWebViewManager.kt`, `BrowserScreen.tsx` |

### Deviasi yang disengaja (dengan alasan)

1. **Pop-up dibuka sebagai tab baru.** Dokumen menyarankan mencegah pop-up demi keamanan aplikasi web biasa. Zenith adalah browser: pengguna memang mengharapkan `target="_blank"` membuka tab. Perlindungan tetap ada — URL divalidasi, tab baru masuk ke sistem profil/perisai Zenith, dan tidak ada WebView "yatim" yang menavigasi sendiri.
2. **Tombol kembali tidak menutup aplikasi.** Menurut UX Chrome/Firefox di Android, kembali = mundur di histori; setelah habis, aplikasi pindah ke latar (`moveTaskToBack`) agar tab, sesi, dan akun tetap hidup. Ini tetap kompatibel dengan kembali prediktif (callback RN 0.87 → `invokeDefaultOnBackPressed`).
3. **Tab privat memakai jalur kuki sendiri** (`ZenithPrivate`) alih-alih `CookieManager.removeAllCookies()` milik react-native-webview, supaya kuki tab normal tidak terhapus.

---

## 5. Dampak yang bisa dirasakan pengguna

1. Antarmuka mengikuti Material 3: warna peran (bukan warna acak), jenis huruf berjenjang, bentuk 12/16/28, ripple di semua yang bisa disentuh.
2. Semua tombol bisa dijangkau jari (≥ 48dp) dan terdengar oleh TalkBack ("Kembali", "Muat ulang halaman", "Tab terbuka: 3", dst.).
3. Tema terang **benar-benar terang**: dulu dialog unduhan tetap gelap; sekarang seluruh komponen, termasuk dialog dan lembar, ikut tema.
4. Ponsel lipat/tablet tidak lagi memaksa 4 kolom — pintasan dan kartu tab menyesuaikan kelas ukuran jendela.
5. Keyboard tidak lagi menutupi kolom pencarian di lembar (Android 15 ke atas), dan bilah alat bawah menyisih saat mengetik.
6. Aplikasi terasa "satu keluarga" dengan Android: splash berlogo, ikon bertema, status/navigation bar yang ikut tema.
7. Konten web gelap mengikuti tema aplikasi (Android 13+ pakai algorithmic darkening resmi), dan Safe Browsing aktif.

---

## 6. Verifikasi

| Pemeriksaan | Hasil |
| --- | --- |
| `npx tsc --noEmit` | bersih (0 error) |
| `npx eslint src` | 6 error (semuanya sudah ada sebelum perubahan; turun dari 12) |
| Build CI | GitHub Actions: `Rust core + Gradle APK` pada push `main` dan tag `v0.6.0` |

### Uji manual yang disarankan (perangkat)

1. **Tema**: Pengaturan → Terang/Gelap/Sistem; periksa status bar, sheet, dialog unduhan, halaman web.
2. **Keyboard**: buka omnibox, ketik; lalu buka lembar (Perisai) dan ketik di kolom pencarian — konten harus naik, bukan tertutup.
3. **Splash**: tutup aplikasi sepenuhnya, buka kembali — latar gelap + logo, tidak ada kedipan putih.
4. **Ikon bertema**: tahan ikon Zenith di launcher (Android 13+) → ikon bertema harus tersedia.
5. **Tablet/lipat**: putar ke lanskap; kisi pintasan dan kartu tab harus menambah kolom.
6. **Video layar penuh**: buka video HTML5 (mis. di YouTube web) → tombol layar penuh harus bekerja.
7. **Pop-up**: buka situs dengan `target="_blank"` → tab baru, bukan jendela yatim.
8. **Kembali**: mundur di histori → kembali antar lapisan UI → pindah ke latar (tidak menutup tab).

---

## 7. Rekomendasi lanjutan (status per v0.7.0)

Dikerjakan di rilis berikutnya — rinciannya di `RELEASE-v0.7.0.md`:

1. ✅ **Keep-alive 3 tab terakhir** — diterapkan (`src/browser/keepAlive.ts`).
2. ✅ **Dynamic color Material You** — diterapkan (`ZenithDynamicColor.kt` + `src/core/dynamicColor.ts`), dengan sakelar di Pengaturan.
3. ✅ **Snackbar dengan aksi** (Material 3) — diterapkan (`src/ui/Snackbar.tsx`), dipakai pada "Situs desktop" dan "Warna dinamis" dengan aksi "Urungkan".
4. ✅ **Animasi transisi M3** (emphasized) — overlay tab baru + Snackbar; sheet/dialog masih memakai animasi bawaan `Modal`.
5. ✅ **Skala huruf pengguna 1,3–2,0** — perbaikan terarah pada Chip, judul baris daftar, dan tombol hapus omnibox (audit penuh belum).
6. ⛔ **`saveState()`/`restoreState()` per tab** — belum; butuh penyimpanan state native per tab (batas `Bundle`/`TransactionTooLargeException`).
7. ⛔ **Shields-sheet polish** — panel Shield Guard masih memakai ukuran huruf manual, belum type scale M3.
