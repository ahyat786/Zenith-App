# Zenith v0.7.0 — Rekomendasi lanjutan §7 v0.6.0 dikerjakan

Dokumen ini melanjutkan `DESIGN-v0.6.0.md` §7 ("Rekomendasi lanjutan").
Kelimanya dikerjakan, kecuali satu yang memang belum (dicatat jujur di §6).

Tanggal: 2 Oktober 2026 · Basis: v0.6.0 (`f3d67eb`) → **v0.7.0** (versionCode 21)

---

## 1. Ringkasan status §7 lama

| # | Rekomendasi §7 v0.6.0 | Status v0.7.0 | Bukti |
| --- | --- | --- | --- |
| 1 | Keep-alive 3 tab terakhir (hemat muat ulang, taat batas memori WebView) | ✅ **Diterapkan** | `src/browser/keepAlive.ts`, `BrowserScreen.tsx` |
| 2 | Dynamic color Material You (palet wallpaper → JS) | ✅ **Diterapkan** | `ZenithDynamicColor.kt`, `src/core/dynamicColor.ts`, `src/core/dynamicTheme.ts`, `theme.ts`, `SettingsScreen.tsx` |
| 3 | Snackbar Material 3 dengan aksi (mis. "Urungkan") | ✅ **Diterapkan** | `src/ui/Snackbar.tsx`, `App.tsx`, `FirefoxMenu.tsx`, `SettingsScreen.tsx` |
| 4 | Animasi transisi M3 (emphasized easing) | ✅ **Sebagian** — overlay tab baru + Snackbar sudah emphasized; sheet/dialog masih animasi bawaan `Modal` | `BrowserScreen.tsx` (`NewTabOverlay`), `Snackbar.tsx` |
| 5 | Skala huruf pengguna 1,3–2,0 (aksesibilitas) | ✅ **Perbaikan terarah** — 4 titik rawan diperbaiki; audit penuh belum | `kit.tsx` (Chip, Row), `Omnibox.tsx` |
| 6 | `saveState()`/`restoreState()` per tab | ⛔ **Belum** — butuh penyimpanan state native per tab (lihat §6) | — |
| — | "Shields-sheet polish" (disebut sebagai gap di §7) | ⛔ **Belum** — panel Shield Guard masih memakai ukuran huruf manual, bukan type scale M3 | `BrowserScreen.tsx` |

---

## 2. Keep-alive WebView (maksimum 3 instance)

**Panduan:** `developer.android.com/develop/ui/views/layout/webapps/webview` →
*"Mengelola memori WebView"*: pakai ulang instance, hancurkan dengan benar, jangan
menahan banyak WebView sekaligus.

**Sebelum:** hanya WebView tab aktif yang ter-mount ⇒ tiap pindah tab halaman
dimuat ulang (lambat, posisi gulir hilang).

**Sesudah:** tab aktif + tab split + tab terakhir yang dipakai (LRU) tetap hidup,
maksimum **3**. Sisanya dilepas dari hierarki; native menjalankan
`stopLoading()` + `onPause()` di `onDropViewInstance`, tepat seperti anjuran dokumen.

- Algoritma di `aliveWebViewIds()` (`src/browser/keepAlive.ts`) — murni, tanpa impor,
  sehingga **diuji langsung**: aktif selalu ikut, split ikut, sisanya menurut
  `lastActiveAt` terbaru, tanpa duplikat, tidak melebihi batas.
- Urutan child WebView mengikuti urutan daftar tab (stabil antar render).
- Tab tersembunyi memakai `display:none` di belakang lapisan aktif, jadi tidak
  menerima sentuhan.

## 3. Warna dinamis Material You

**Panduan:** `developer.android.com/develop/ui/views/theming/dynamic-colors`
+ `design/ui/mobile` → *Styles → Color*.

**Alur:** wallpaper → `DynamicColors.isDynamicColorAvailable()` →
`wrapContextIfAvailable(ctx, ThemeOverlay_Material3_DynamicColors_DayNight)` →
`MaterialColors.getColor()` → 12 peran M3 → JS (`dynamicColor.ts`) →
`mergeDynamicTokens()` (`dynamicTheme.ts`) → `useTheme()`.

Detail yang penting:

1. **Mode malam mengikuti tema Zenith**, bukan setelan sistem: `Configuration`
   disalin lalu `UI_MODE_NIGHT` dipaksa **sebelum** konteks dibungkus overlay,
   supaya palet siang/malam yang benar yang dibaca (Zenith punya sakelar
   Gelap/Terang/Sistem sendiri).
2. **Yang ditimpa hanya 12 peran** (primary/secondary/tertiary + container serta
   `surfaceVariant`/`onSurfaceVariant`). Warna netral (`bg`, `surface`, `bar`)
   tetap token Zenith ⇒ identitas aplikasi dan kontras teks tidak ikut berubah
   di wallpaper ekstrem. Ini deviasi yang disengaja dari "semua peran mengikuti
   wallpaper", dicatat di sini.
3. **Alias lama ikut disesuaikan** (`accent`, `onAccent`, `accentSoft`, `subtext`),
   jadi layar lama tidak tertinggal warna. `accentSoft` dihitung ulang dengan
   alfa state-layer M3 (16% gelap / 12% terang).
4. **Identitas objek tema dijaga stabil** (cache per revisi palet) supaya
   `useMemo` di seluruh aplikasi tidak dihitung ulang tiap render.
5. **Aman di perangkat tanpa Material You** (Android < 12 atau vendor tanpa
   dukungan): native mengembalikan `null` → Zenith memakai tokennya sendiri,
   dan pemanggilan native tidak diulang.
6. **Ada sakelarnya**: Pengaturan → Tampilan → *"Warna dinamis (Material You)"*,
   default aktif, bisa dimatikan (perubahan diumumkan lewat Snackbar + "Urungkan").

Dependensi baru: `com.google.android.material:material:1.12.0`
(officially required untuk `DynamicColors`/`MaterialColors`).

## 4. Snackbar Material 3 dengan aksi

**Panduan:** `design/ui/mobile` → *Components → Snackbar*.

- `src/ui/Snackbar.tsx`: permukaan `inverseSurface`, teks `inverseOnSurface`,
  aksi `inversePrimary`, bentuk **4dp**, tinggi ≥48dp, masuk dengan fade + naik
  24dp memakai kurva **emphasized**, `accessibilityLiveRegion="polite"`.
- **Durasi:** 4 s informatif, **7 s** bila ada aksi (pengguna butuh waktu membaca
  lalu memutuskan).
- **Dua mode pakai:** `useSnackbar(theme)` untuk dipasang **di dalam Modal**
  (Android memberi modal jendela sendiri, jadi Snackbar global akan tertutup), dan
  `showSnackbar()` + `<SnackbarHost/>` global untuk layar biasa.
- Dua pemakaian nyata:
  1. Menu halaman → **Situs desktop**: "Mode desktop untuk situs ini — halaman
     dimuat ulang" + **Urungkan** (menggantikan dua `ToastAndroid`).
  2. Pengaturan → **Warna dinamis** dimatikan: + **Urungkan**.

## 5. Gerak & aksesibilitas

- **Transisi M3 (emphasized):** overlay halaman tab baru kini memudar sambil naik
  8dp (`NewTabOverlay`, `useNativeDriver: true`) — sesuai *Styles → Motion*
  (durasi medium2, kurva emphasized).
- **Skala huruf besar:** `Chip` memakai `minHeight` + padding vertikal (bukan
  `height` tetap) sehingga label tidak terpotong pada skala 1,3–2,0; judul baris
  daftar boleh membungkus **2 baris**; tombol hapus teks di omnibox dinaikkan
  40dp → **48dp** (target sentuh minimum Android).

## 6. Yang **belum** dikerjakan (jujur)

1. **`saveState()`/`restoreState()` per tab** — mempertahankan riwayat maju/mundur
   setelah proses aplikasi dibunuh. Butuh API native tambahan (baca/tulis state
   WebView per tab + batas ukuran `Bundle`); belum ada di v0.7.0.
2. **Shields-sheet polish** — panel Shield Guard masih memakai `fontSize` manual
   (11–16px) alih-alih type scale M3, dan statusnya belum diringkas jadi satu
   kartu ringkasan + daftar seperti panduan M3.
3. **Audit skala huruf penuh** — baru 4 titik yang diperbaiki; belum ada
   pemeriksaan menyeluruh pada semua layar (khususnya tabel host di log koneksi).
4. **Verifikasi perangkat** — warna dinamis & keep-alive belum diuji di perangkat
   fisik; keduanya tercakup daftar uji di §8.

## 7. Berkas yang berubah di v0.7.0

| Berkas | Perubahan |
| --- | --- |
| `src/browser/keepAlive.ts` (baru) | `KEEP_ALIVE_TABS`, `aliveWebViewIds()` — murni, teruji |
| `src/core/color.ts` (baru) | `withAlpha()` dipindah ke modul murni (agar bisa diuji) |
| `src/core/dynamicTheme.ts` (baru) | `mergeDynamicTokens()` — penggabungan token + alias, murni |
| `src/core/dynamicColor.ts` (baru) | Jembatan palet wallpaper: enable/skema/cache/revisi |
| `src/ui/Snackbar.tsx` (baru) | Komponen + hook + host global Snackbar M3 |
| `android/.../core/ZenithDynamicColor.kt` (baru) | Baca palet Material You (API resmi DynamicColors) |
| `theme.ts` | `inversePrimary` ditambahkan; `useTheme()` menggabungkan palet + cache identitas |
| `App.tsx` | Aktifkan jembatan palet + pasang `<SnackbarHost/>` |
| `BrowserScreen.tsx` | Keep-alive, `NewTabOverlay` (emphasized), ToastAndroid desktop → Snackbar |
| `FirefoxMenu.tsx` | Snackbar + "Urungkan" untuk situs desktop |
| `SettingsScreen.tsx` | Baris "Warna dinamis (Material You)" + Snackbar |
| `types.ts`, `state/defaults.ts` | `settings.dynamicColor` (default aktif) |
| `core/native.ts`, `ZenithCoreModule.kt` | Metode `dynamicColors(mode)` |
| `ui/kit.tsx`, `Omnibox.tsx`, `ui/Icon.tsx` | Skala huruf, target sentuh 48dp, ikon `palette` |
| `android/app/build.gradle` | Material Components 1.12.0; versionCode 21 / "0.7.0" |
| `.github/workflows/android.yml` | Langkah uji `node eval/check-v0.7.0.js` |
| `eval/check-v0.7.0.js` (baru) | 64 pemeriksaan otomatis untuk fitur rilis ini |

## 8. Verifikasi

| Pemeriksaan | Hasil |
| --- | --- |
| `node eval/check-v0.7.0.js` | **64 lulus / 0 gagal** (uji perilaku + wiring) |
| `npx tsc --noEmit` | bersih |
| `npx eslint src` | 6 error (semuanya sudah ada sebelum perubahan ini), 454 peringatan |
| Build CI (GitHub Actions) | langkah baru ikut berjalan di setiap push/tag |

### Uji manual yang disarankan (perangkat)

1. **Keep-alive:** buka 4 tab, pindah-pindah antar tab → tab yang baru dipakai
   tidak boleh memuat ulang (tidak ada kedipan putih / indikator berputar).
2. **Warna dinamis:** ganti wallpaper (Android 12+), buka Zenith → warna aksen
   ikut berubah; matikan sakelarnya di Pengaturan → Tampilan → kembali ke warna
   Zenith, Snackbar "Urungkan" mengembalikannya.
3. **Snackbar:** menu halaman → Situs desktop → Snackbar muncul di atas menu,
   "Urungkan" mengembalikan mode mobile.
4. **Gerak:** buka tab baru → overlay muncul dengan fade + naik halus.
5. **Aksesibilitas:** setel skala huruf 1,5–2,0 → chip dan baris daftar tidak
   terpotong; TalkBack membacakan Snackbar.
