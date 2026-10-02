# Zenith v0.8.0 — Histori WebView per tab, poles Shield Guard, skala huruf

Melanjutkan `RELEASE-v0.7.0.md` §6 (yang belum dikerjakan).
Tanggal: 2 Oktober 2026 · Basis: v0.7.0 (`ca8a02d`) → **v0.8.0** (versionCode 22)

---

## 1. Ringkasan §6 v0.7.0

| # | Item §6 v0.7.0 | Status v0.8.0 | Bukti |
| --- | --- | --- | --- |
| 1 | `saveState()`/`restoreState()` per tab | ✅ **Diterapkan** (riwayat maju/mundur + posisi halaman bertahan setelah proses dibunuh) | `ZenithTabState.kt`, `ZenithCoreModule.kt`, `src/browser/tabRestore.ts`, `TabView.tsx` |
| 2 | *Shields-sheet polish* | ✅ **Diterapkan** — kartu ringkasan M3 + log koneksi memakai type scale | `BrowserScreen.tsx` |
| 3 | Audit skala huruf penuh (1,3–2,0) | 🟡 **Sebagian** — masalah **struktural** diperbaiki (tinggi tetap pada wadah teks), konversi literal `fontSize` menyeluruh belum | `SettingsHome.tsx`, `DownloadsScreen.tsx`, `kit.tsx`, `Omnibox.tsx` |

---

## 2. Histori WebView per tab (item tersulit dari §7 v0.6.0)

**Panduan:** `developer.android.com/develop/ui/views/layout/webapps/webview` →
*"Mempertahankan riwayat"*: `saveState()` / `restoreState()`, dan peringatan agar
tidak melampaui batas `Bundle` (`TransactionTooLargeException`).

### Tantangan

Dokumen mengandaikan *aplikasi web* dengan satu WebView dan `savedInstanceState`.
Zenith adalah **browser**: banyak tab, WebView-nya dilepas-pasang oleh keep-alive
(v0.7.0), dan react-native-webview 14 tidak punya prop `saveState` sama sekali.

### Cara Zenith menyelesaikannya

1. **Tab id dikirim lewat penanda UA yang sudah ada.** `applicationNameForUserAgent`
   kini berbunyi `Zenith/0.8.0 zp:<profileId> zt:<tabId>`; manager native mengurai
   `zp:`/`zt:` dengan regex dan mencatat WebView → tab id di
   `ZenithTabState` (WeakHashMap, tidak menahan WebView). **Tidak ada API React
   Native baru** yang perlu diandalkan — jalur yang sudah terbukti di rilis lalu.
2. **State ditulis ke berkas, bukan `savedInstanceState`.**
   `saveState(Bundle)` → `Parcel` → Base64 → berkas di penyimpanan internal
   aplikasi. Jadi ancaman `TransactionTooLargeException` yang diperingatkan
   dokumen tidak berlaku: tidak ada Bundle besar yang menyeberang ke sistem.
3. **Batas keras.** State > 512 KB dilewati (bukan dipotong), jumlah berkas
   dibatasi 40 (yang terlama dihapus), dan penulisan berkas di thread terpisah
   supaya UI tidak tersendat.
4. **Tab privat tidak pernah disimpan** — riwayat situs privat tidak menetap.
5. **Dihapus saat tab ditutup** (`deleteTabState`) supaya tidak menumpuk.

### Yang paling penting: tidak membangkitkan bug lama

Bug "tab aktif me-refresh terus" (diperbaiki v0.5.2) lahir dari pemuatan yang
tidak sengaja. Karena itu pemulihan histori dirancang supaya **tidak mungkin**
memicu pemuatan:

- WebView dipasang dengan sumber sentinel `zenith:restoring`. Manager native
  **sudah** melewati sumber `zenith:*`/`about:blank` tanpa memuat apa pun —
  jadi sentinel tidak memicu navigasi.
- Sesudah view native terdaftar, JS meminta native memulihkan histori
  (`attemptRestore` mengulang tiap 60 ms sampai ~720 ms, lalu menyerah).
- Berhasil → sumber tetap sentinel (`zenith:restored`), **halaman hasil
  pemulihan dibiarkan hidup** (tidak ada muat ulang, tidak ada kedipan).
- Gagal / tidak ada state → sumber berganti ke URL tab seperti perilaku lama.
- Navigasi yang sudah diklaim pengguna (`pendingNavigationUrl`) **menang**:
  pemulihan tidak dijalankan sama sekali.
- State juga disimpan saat aplikasi ke latar (`AppState` → `saveTabState`) dan
  otomatis saat WebView dilepas oleh keep-alive (`onDropViewInstance`).

Fungsi keputusan di `src/browser/tabRestore.ts` sengaja murni supaya bisa diuji
langsung oleh `eval/check-v0.8.0.js` — termasuk bukti bahwa sentinel tidak
pernah memuat halaman.

## 3. Poles panel Shield Guard

| Sebelum | Sesudah (M3) |
| --- | --- |
| Kartu ringkasan `accentSoft` + ukuran huruf manual (16/12,5) | `secondaryContainer` + ikon dalam lingkaran 48dp, angka **headlineSmall**, keterangan `bodyMedium`/`labelMedium` |
| Judul bagian 12px `fontWeight 700` manual | `titleSmall` (uppercase + letterSpacing tetap) |
| Baris log 12,5px/11px tanpa target sentuh | `bodySmall`/`labelSmall`, baris `minHeight: 36`, permukaan `surfaceContainer`, sudut `radius.md`, `overflow: hidden` |
| Tombol "Bersihkan" tanpa label aksesibilitas | Label + ripple + tinggi minimum, memakai `labelMedium` |
| Status diblokir memakai emoji "⛔ diblokir" | Kata "diblokir" (TalkBack membacanya dengan benar) |
| Angka statistik tidak dibacakan | `accessibilityLabel`: "N permintaan diblokir di sesi ini" |

## 4. Skala huruf (aksesibilitas)

Yang diperbaiki **struktural** — inilah penyebab teks terpotong, bukan ukuran
hurufnya:

1. `SettingsHome` kolom pencarian: `height: 44` → **`minHeight: 48` + padding
   vertikal** (tetap ramah jari, tapi teks tidak lagi terpotong saat skala 1,5+).
2. `DownloadsScreen` chip kategori: tinggi tetap → `minHeight: 36` + padding.
3. `Chip` (kit) sudah `minHeight` sejak v0.7.0; judul baris daftar boleh 2 baris.
4. Omnibox: tombol hapus teks 48dp.

**Yang belum:** masih ada ±150 literal `fontSize` di layar-layar lama
(`TabSwitcher` 31, `SettingsScreen` 20, `FirefoxMenu` 14, `LibraryScreens` 12, …).
Angka itu bukan kesalahan fatal — teks tetap ikut membesar — tetapi nilainya
belum berasal dari type scale M3, jadi proporsinya bisa terasa kurang rapi pada
skala ekstrem. Ini pekerjaan mekanis yang akan saya cicil, bukan klaim selesai.

## 5. Verifikasi

| Pemeriksaan | Hasil |
| --- | --- |
| `node eval/check-v0.8.0.js` | **59 lulus / 0 gagal** |
| `node eval/check-v0.7.0.js` (regresi) | **64 lulus / 0 gagal** (versi kini dibandingkan `>=`, bukan disamakan) |
| `npx tsc --noEmit` | bersih |
| GitHub Actions | langkah `eval/check-v*.js` menjalankan **semua** skrip uji rilis |

### Uji manual yang disarankan

1. **Histori:** buka situs → klik 2–3 tautan di dalamnya → buka tab lain →
   kembali ke tab pertama → **tombol kembali harus masih membawa ke halaman
   sebelumnya** (dulu riwayatnya hilang dan halaman dimuat ulang dari awal).
2. **Proses dibunuh:** aktifkan "Don't keep activities" (Opsi pengembang) atau
   paksa tutup aplikasi → buka lagi → tab dipulihkan **beserta riwayatnya**.
3. **Tab privat:** buka tab privat, telusuri beberapa halaman, tutup aplikasi →
   setelah dibuka lagi, tab privat tidak boleh punya riwayat tersimpan.
4. **Shield Guard:** buka panel → kartu ringkasan rapi, log koneksi terbaca,
   "Bersihkan" bekerja, dan TalkBack membacakan jumlah blokir.
5. **Huruf besar:** skala huruf 1,5–2,0 → kolom pencarian Pengaturan dan chip
   unduhan tidak terpotong.

## 6. Berkas yang berubah di v0.8.0

| Berkas | Perubahan |
| --- | --- |
| `android/.../webview/ZenithTabState.kt` (baru) | `saveState`/`restoreState` ke berkas, batas ukuran/jumlah, tab privat dikecualikan |
| `android/.../webview/ZenithWebViewManager.kt` | Parser penanda `zp:`/`zt:`, simpan state saat `onDropViewInstance` |
| `android/.../core/ZenithCoreModule.kt` | `saveTabState`, `restoreTabState` (dengan percobaan ulang), `deleteTabState` |
| `src/browser/tabRestore.ts` (baru) | Sentinel + keputusan pemulihan (murni, teruji) |
| `src/browser/TabView.tsx` | Gerbang pemulihan histori, simpan saat ke latar, penanda `zt:` |
| `src/core/native.ts` | Jembatan `saveTabState`/`restoreTabState`/`deleteTabState` |
| `src/state/store.tsx` | `CLOSE_TAB` → hapus state tab |
| `src/browser/BrowserScreen.tsx` | Panel Shield Guard versi M3 |
| `src/screens/SettingsHome.tsx`, `DownloadsScreen.tsx`, `Omnibox.tsx`, `ui/kit.tsx` | Skala huruf & target sentuh |
| `eval/check-v0.8.0.js` (baru), `eval/check-v0.7.0.js` | Uji rilis; versi kini dibandingkan |
| `.github/workflows/android.yml` | Langkah uji menjalankan semua `eval/check-v*.js` |
| `android/app/build.gradle` | versionCode 22 / "0.8.0" |

## 7. Rekomendasi lanjutan (status per v0.9.0)

1. ✅ **Konversi literal `fontSize` ke type scale M3** — 122 titik dikonversi,
   5 dibiarkan dengan alasan (`RELEASE-v0.9.0.md` §3).
2. ✅ **Posisi gulir per tab** — diterapkan (`src/browser/scrollMemory.ts`).
3. **Dialog konfirmasi keluar** untuk "Tutup semua tab" dengan Snackbar
   "Urungkan" (bukan hanya toast).
4. **Uji perangkat** untuk jalur pemulihan histori (daftar di §5) — satu-satunya
   bagian v0.8.0 yang belum pernah dijalankan di perangkat nyata.
