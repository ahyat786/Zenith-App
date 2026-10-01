# Audit & Perbaikan Zenith — v0.5.2

**Tanggal:** 1 Oktober 2026
**Ruang lingkup:** seluruh riwayat commit `main` (v0.2.0 → e031ce0), fokus pada bug
"tab aktif me-refresh terus menerus", lalu audit bug lain di WebView, tab,
profil/kuki, dan unduhan.

---

## 1. Akar masalah: tab aktif refresh terus menerus

Gejala: halaman yang sudah terbuka tiba-tiba memuat ulang sendiri tanpa henti;
tombol refresh berputar terus; URL tab lain kadang muncul di tab yang salah;
halaman yang sedang di-scroll melompat ke atas (kembali ke awal).

### 1.1 `source` WebView ikut berubah setiap navigasi — **PENYEBAB UTAMA**

`src/browser/TabView.tsx` mengirim:

```tsx
const sourceUrl = pendingNavigationUrl(tab.id) || tab.url;
...
<Wv source={{ uri: sourceUrl }} />
```

Prop `source` react-native-webview memanggil `loadUrl` **setiap kali objeknya
berubah**. Karena `sourceUrl` mengikuti `tab.url` (dan objeknya dibuat ulang
setiap render), maka:

- pengalihan (redirect) → `tab.url` berubah → `source` berubah → muat ulang;
- navigasi SPA (`pushState`) → `tab.url` berubah → muat ulang;
- re-render karena state lain (statistik shields, banner unduhan, dsb.)
  → objek `source` baru → RN mengirim prop lagi → muat ulang.

Muat ulang itu memicu `onNavigationStateChange` lagi → URL berubah lagi → muat
ulang lagi. Itulah loop tanpa akhir yang terlihat sebagai "refresh terus menerus".

**Perbaikan:** URL awal dibekukan per-WebView (`useRef`), jadi prop `source`
tidak pernah berubah setelah mount. Navigasi yang disengaja hanya lewat
`claimWebViewLoad()` + `forceWebViewLoad()` (omnibox, tautan, pemulihan halaman
putih).

### 1.2 `setNewSource` Kotlin ditunda di dalam `view.post { }` — **PENYEBAB KEDUA**

`RNCWebViewManager` (react-native-webview) menyimpan `mPendingSource`,
`mUserAgent`, dan `mUserAgentWithApplicationName` pada **satu objek impl
bersama**, lalu memprosesnya **sinkron** di `onAfterUpdateTransaction(view)`.

Versi lama menulis:

```kotlin
override fun setNewSource(view: RNCWebViewWrapper, source: ReadableMap?) {
    view.webView.post {           // ← ditunda satu putaran UI
        ZenithPrivate.ensureBeforeLoad(view.webView)
        loadSource(view, source)  // ← memanggil super.setNewSource(view, mPendingSource)
    }
}
```

Karena penundaan itu, `mPendingSource` milik **WebView A** masih tertinggal saat
transaksi milik **WebView B** (view daur ulang antar tab / re-render) selesai —
`onAfterUpdateTransaction` milik B lalu memproses sumber milik A. Hasilnya:
`loadUrl` dipanggil berulang, halaman memuat ulang, dan URL antar tab saling
tertukar. Untuk itu beberapa commit sebelumnya menambal dengan
`FORCED_URI`/`CORRECTED`/`reloadExpected`, yang justru menambah pemuatan ulang.

**Perbaikan:** seluruh proses dijalankan **sinkron dan idempoten** per view:

```kotlin
// tidak ada view.post; tag per-view mencegah muat ulang URI awal yang sama
override fun setNewSource(view: RNCWebViewWrapper, source: ReadableMap?) {
    if (!uri.isNullOrBlank() && uri == view.webView.getTag(TAG_LAST_SOURCE_URI)) return
    ...
    super.setNewSource(view, source)
}
```

UA (mode desktop per-situs) juga disimpan **per-view** lewat tag, bukan di field
bersama impl, sehingga tab lain tidak mewarisi UA tab sebelumnya.

### 1.3 `key={navigationEpoch(tab.id)}` me-remount WebView

`commitNavigation()` menaikkan epoch setiap navigasi yang disengaja, dan epoch
itu dipakai sebagai `key` komponen WebView → React menghancurkan lalu membuat
ulang WebView (halaman dimuat dari nol lagi). Dihapus; epoch kini selalu `0`.

### 1.4 Pemuatan ulang otomatis oleh "pemulihan halaman kosong"

`probeBlankWebView()` dipasang pada mount dan setiap kembali ke depan, lalu
timer 2,2 detik memanggil `forceWebViewLoad()` **meskipun halaman sekadar
lambat**. Ditambah `reloadExpected()` (maks. 4 kali) dan deteksi "foreign URL"
yang memaksa muat ulang saat URL berbeda dari `tab.url` — tepat saat pengalihan
sedang berjalan. Semua pemuatan ulang otomatis dihapus:

- probe hanya dijalankan saat aplikasi kembali ke depan (`AppState: active`);
- hanya memuat ulang bila renderer **benar-benar mati** (`location.href` kosong
  dan `document.body` kosong);
- jeda 15 detik antar pemulihan agar tidak pernah berulang;
- tidak ada lagi `stopLoading()` otomatis.

### 1.5 Kunci URL global menahan alamat yang diketik

`lockTabUrls()` mengunci **semua** tab setiap kali tombol `+` ditekan, dan
`UPDATE_TAB` menolak setiap perubahan URL pada tab terkunci. Akibatnya alamat
yang diketik di omnibox tidak pernah pindah, pengguna mengira halaman "macet",
lalu menekan refresh — ikut menyumbang gejala refresh berulang. Kunci global
dinonaktifkan (`tabUrlLocked()` selalu `false`); perlindungan sekarang
per-peristiwa lewat intent navigasi.

### 1.6 Klausa "URL sama dengan tab lain" di reducer

`UPDATE_TAB` menolak perubahan URL jika URL itu sudah dipakai tab lain. Dua tab
memang boleh membuka halaman yang sama, dan pengalihan ke URL yang sudah dibuka
tab lain itu normal. Klausa ini membuat URL tab aktif membeku di alamat lama
saat terjadi pengalihan. Dihapus.

### 1.7 `setPageHold()` menyembunyikan & menghentikan **semua** WebView

Setiap tab baru → `NativeModules.ZenithCore.setPageHold(true)` menelusuri
seluruh pohon view dan menjalankan `stopLoading()`, `onPause()`,
`visibility = GONE` pada **semua** WebView (termasuk tab aktif lain). Tab yang
kena tidak punya jalan pulih selain dimuat ulang — persis terlihat seperti
"tab refresh sendiri". Kini `setPageHold` adalah no-op; visibilitas tab diatur
kontainer React Native (`display: 'none' | 'flex'`).

---

## 2. Bug lain yang ditemukan & diperbaiki

| # | Bug | Dampak | Perbaikan |
|---|-----|--------|-----------|
| 2.1 | `ZenithPrivate.kt` tidak pernah dijalankan `SnapshotCookies`/state bersih | — | (tidak diubah) |
| 2.2 | Kuki unduhan hilang saat konfirmasi unduhan | Situs ber-login (GitHub, forum) menolak berkas → unduhan 403/HTML, terlihat seperti unduhan "mengulang" | `promptDownload()` menyimpan cookie per URL; `start()` JS memakainya sebagai header `Cookie` |
| 2.3 | Indikator "loading" bisa macet selamanya | Tombol refresh tetap berputar tanpa ada pemuatan | Batas aman 15 detik hanya mematikan **indikator**, tidak memutus pemuatan |
| 2.4 | `cancelBlankProbe` tidak dipanggil saat tab ditutup pada jalur baru | Kebocoran timer kecil | cleanup tetap dipertahankan di `TabView` |
| 2.5 | Riwayat ganda pada pengalihan | Dua entri untuk satu kunjungan | Riwayat hanya dicatat saat `nav.url !== lastHistoryUrl.current` |
| 2.6 | Versi tidak konsisten (0.5.1 di gradle, 0.4.x di About/UA) | Bingung saat memeriksa build | Diseragamkan ke **0.5.2** (gradle, `AboutScreen`, `SettingsScreen`, UA `Zenith/0.5.2`) |

---

## 3. Yang **tidak** diubah (sengaja)

- Arsitektur store/profil/workspace dan format state tetap sama supaya tab,
  markah, riwayat, dan sesi pengguna tidak hilang setelah update.
- `ZenithPrivate` (profil kuki terpisah) tetap seperti semula; kuki profil
  utama tetap di toples bawaan WebView.
- Blokir iklan Rust, DNS/DoH, userscript, ekstensi — tidak disentuh.
- Tidak ada izin Android baru, tidak ada layanan latar baru (hemat baterai).

---

## 4. Rekomendasi lanjutan (belum diubah, sengaja)

Perubahan pada v0.5.2 sengaja dibatasi agar tidak menambah risiko baru yang
tidak bisa diuji tanpa perangkat. Dua hal berikut disarankan untuk rilis
berikutnya:

1. **Tab yang tidak aktif masih di-unmount** (`mountTabs` di `BrowserScreen.tsx`
   hanya me-mount tab aktif). Artinya berpindah tab memuat halaman sekali lagi
   — bukan loop, tetapi bukan perilaku browser ideal. Setelah akar masalah
   `setNewSource` dibereskan, WebView beberapa tab bisa dibiarkan hidup
   (mis. maksimal 3 tab terakhir, sisanya `display: none`).
2. **`ZenithPrivate` (profil kuki)** masih memakai `ProfileStore` bila didukung
   WebView perangkat. Di perangkat yang tidak mendukungnya, tab "privat" hanya
   memisahkan cache/riwayat, bukan kuki.

## 5. Verifikasi

- `npx tsc --noEmit` — bersih.
- `cargo test` (Rust core) — dijalankan di GitHub Actions.
- `./gradlew assembleRelease` (Rust `.so` + Hermes + Gradle) — dijalankan di
  GitHub Actions (workflow `.github/workflows/android.yml`).
- Uji manual yang perlu dilakukan pengguna:
  1. Buka situs dengan pengalihan (mis. `http://` → `https://`) → halaman
     selesai memuat sekali, tidak berulang.
  2. Buka tautan lintas-domain → URL di bilah alamat ikut berpindah.
  3. Ketik alamat baru di omnibox saat halaman lain sedang memuat → alamat
     yang diketik yang menang, tidak ditimpa halaman lama.
  4. Tab baru (`+`) → tab lama tetap hidup, kembali tanpa memuat ulang.
  5. Aplikasi ke latar ±5 menit lalu dibuka lagi → halaman tampil, bukan putih;
     tidak memuat ulang bila halaman masih hidup.
