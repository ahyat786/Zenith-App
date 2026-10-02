# Zenith v0.9.0 — Posisi gulir per tab + audit type scale Material 3

Melanjutkan `RELEASE-v0.8.0.md` §7.
Tanggal: 2 Oktober 2026 · Basis: v0.8.0 (`fbf955b`) → **v0.9.0** (versionCode 23)

---

## 1. Ringkasan §7 v0.8.0

| # | Item §7 v0.8.0 | Status v0.9.0 | Bukti |
| --- | --- | --- | --- |
| 1 | Konversi literal `fontSize` ke type scale M3 | ✅ **Dikerjakan** — 122 dari 144 titik dikonversi; 5 sengaja dibiarkan (didokumentasikan) | `src/**` + `eval/check-v0.9.0.js` §2 |
| 2 | Posisi gulir per tab | ✅ **Diterapkan** — ingatan gulir per URL, dipulihkan saat halaman dimuat kembali | `src/browser/scrollMemory.ts`, `src/core/inject.ts`, `TabView.tsx` |
| 3 | Uji perangkat nyata | ⛔ **Belum** — tetap di luar jangkauan saya (butuh perangkat/emulator); langkah ujinya ada di §5 | — |

---

## 2. Posisi gulir per tab

**Masalahnya:** WebView memang mempertahankan gulir saat maju/mundur di dalam
riwayatnya sendiri, tetapi **tidak** saat WebView-nya dibangun ulang — tab yang
dilepas keep-alive (v0.7.0) lalu dibuka lagi, pemulihan setelah proses dibunuh,
atau halaman yang dimuat ulang. Pengguna dikembalikan ke awal halaman.

**Dua sisi:**

1. **Sisi halaman** (`BRIDGE_SCRIPT`, document-start): melaporkan gulir lewat
   kanal pesan `zen:scroll` yang sudah ada. Di-throttle — hanya bila bergeser
   ≥ 150 px atau 800 ms setelah berhenti menggulir — plus laporan paksa saat
   `pagehide` dan saat tab disembunyikan. Jadi trafik pesan tetap kecil.
2. **Sisi Zenith** (`scrollMemory.ts` + `TabView`): ingatan per URL di lingkup
   modul (bertahan lintas mount/unmount WebView), maksimum 200 URL (LRU).
   Pemulihan dijalankan **sekali per pemuatan**, setelah halaman selesai dimuat
   dan hanya bila metrik nyata dari halaman membuktikan dokumen lebih tinggi
   dari viewport.

**Jaminan anti-refresh tetap utuh:** pemulihan hanya menjalankan
`window.scrollTo(...)` lewat `injectJavaScript` — operasi ini tidak pernah
memicu navigasi, jadi ia tidak bisa menghidupkan lagi bug "tab aktif refresh
terus" (v0.5.2). Pemuatan baru selalu menang: kalau pengguna mengetik URL atau
membuka tautan, memori gulir untuk URL tujuan tidak dipakai untuk menimpa
navigasi apa pun.

**Catatan desain:** saat maju/mundur di dalam riwayat, WebView sendiri sudah
memulihkan gulir; ingatan kita hanya ikut bekerja kalau WebView-nya baru.
Itu sebabnya tidak ada "lompatan" ganda.

## 3. Audit type scale Material 3 — 122 titik dikonversi

**Aturan yang dipakai (aman, tanpa menebak):**

| Aturan | Jumlah |
| --- | --- |
| Ukuran **tepat** sama dengan token M3 dan bobot sama → `...type.token` | 74 |
| Ukuran **di luar skala** tetapi selisihnya ≤ 1 px → token terdekat, **bobot asli ditulis ulang secara eksplisit** (`fontWeight: '700'` dst.) | 48 |
| Total titik dikonversi | **122** |
| Sengaja dibiarkan (selisih > 1 px / dekoratif) | **5** |

Pembulatan yang dipakai (≤ 1 px): 10→11, 10,5→11, 11,5→12, 12,5→12, 13→14,
13,5→14, 14,5→14, 15→16, 15,5→16, 16,5→16, 17→16, 21→22, 23→24.
Bobot M3 tidak punya 600/700/800; karena itu bobot tebal **dipertahankan
eksplisit** setelah spread token sehingga penekanan visual tidak hilang.

**Berkas baru/berubah:** `theme.ts` tidak disentuh (definisi token), 15 berkas
layar menerima spread token + impor `type as typeScale` bila belum ada.

**5 literal yang tersisa (disengaja):**

| Berkas | Ukuran | Alasan |
| --- | --- | --- |
| `TabSwitcher.tsx` | 20 (`fontWeight: '800'`) | judul panel — 20 px tidak ada di skala M3 (terdekat 22, selisih 2 px) |
| `TabSwitcher.tsx` | 20 | emoji ikon workspace (dekoratif, bukan teks) |
| `AboutScreen.tsx` | 32 (`900`) | huruf "Z" dekoratif — skala M3 berhenti di 36 (selisih 4 px) |
| `AboutScreen.tsx` | 20 (`800`) | judul aplikasi (selisih 2 px dari 22) |
| `LibraryScreens.tsx` | 18 (`700`) | judul empty state (selisih 2 px dari 16) |

Semuanya terdaftar di `eval/check-v0.9.0.js` §2 sebagai daftar **yang
diizinkan** — menambah literal baru akan membuat uji gagal, jadi skala ini
terjaga dari kemunduran.

**Jujur soal risiko:** 48 titik berubah ukuran 0,5–1 px dan 53 titik kini
mewarisi `lineHeight` token (nilai `lineHeight` eksplisit yang sudah ada tetap
menang, jadi hanya yang tadinya otomatis yang berubah). Tidak ada perubahan
tata letak yang berarti, tetapi ini perubahan visual paling luas di rilis ini —
kalau ada layar yang terasa kurang pas, cukup sebut layarnya dan saya sesuaikan.

## 4. Verifikasi

| Pemeriksaan | Hasil |
| --- | --- |
| `node eval/check-v0.9.0.js` | **44 lulus / 0 gagal** (perilaku ingatan gulir + audit type scale + regresi) |
| `node eval/check-v0.8.0.js` | 60 lulus (versi kini dibandingkan `>=`) |
| `node eval/check-v0.7.0.js` | 64 lulus |
| `npx tsc --noEmit` | bersih (setelah codemod sempat gagal 3 kali — lihat catatan) |
| `npx eslint src` | 6 error (baseline lama), peringatan turun 452 → 440 |
| Babel parse 16 berkas yang disentuh | semua lolos |
| GitHub Actions | menjalankan **semua** `eval/check-v*.js` + build APK |

**Catatan proses (transparansi):** konversi dilakukan codemod, dan codemod itu
sempat menghasilkan tiga kesalahan yang semuanya hanya ketahuan dari `tsc`:
offset string yang basi saat menyusun ulang teks, koma pemisah yang termakan,
dan rentang edit terbalik ketika `fontWeight` ditulis **sebelum** `fontSize`.
Setiap kali berkas dipulihkan dari git lalu codemod diperbaiki — bukan ditambal
setelahnya.

### Uji manual yang disarankan

1. **Gulir lintas pemuatan:** buka artikel panjang, gulir ke tengah, buka tab
   lain, lalu muat ulang tab pertama (satu kali) → posisi gulir harus kembali.
2. **Gulir setelah proses dibunuh:** gulir jauh di sebuah situs → paksa tutup
   aplikasi → buka lagi → halaman yang dipulihkan harus kembali ke posisi itu.
3. **Tidak ada gulir palsu:** buka halaman pendek (tidak bisa digulir) → tidak
   boleh ada lompatan.
4. **Ketik URL setelah gulir:** gulir, lalu ketik URL baru → harus membuka dari
   atas (memori gulir tidak boleh menimpa navigasi yang disengaja).
5. **Type scale:** kelilingi Pengaturan, Tab Switcher, unduhan, riwayat/markah —
   pastikan tidak ada teks terpotong atau bertumpuk setelah pembulatan ukuran.

## 5. Berkas yang berubah di v0.9.0

| Berkas | Perubahan |
| --- | --- |
| `src/browser/scrollMemory.ts` (baru) | Ingatan gulir per URL: LRU 200, ambang, keputusan pemulihan, skrip (murni & teruji) |
| `src/core/inject.ts` | Pelaporan gulir ber-throttle di `BRIDGE_SCRIPT` |
| `src/browser/TabView.tsx` | Tangani `zen:scroll`/`zen:metrics`, pulihkan sekali per pemuatan, lapor saat dilepas |
| 15 berkas UI | 122 konversi literal → type scale M3 (+ impor token bila perlu) |
| `eval/check-v0.9.0.js` (baru) | 44 pemeriksaan: gulir + audit type scale + regresi |
| `eval/check-v0.8.0.js` | Versi dibandingkan `>=` (tidak busuk saat rilis berikutnya) |
| `android/app/build.gradle`, `AboutScreen`, `SettingsScreen`, UA | versionCode 23 / "0.9.0" |

## 6. Rekomendasi lanjutan

1. **Uji perangkat** (item yang sama, masih tertunda sejak v0.7.0) — daftar
   langkahnya di §4; ini satu-satunya cara memastikan warna dinamis, keep-alive,
   pemulihan histori, dan pemulihan gulir benar-benar terasa di HP.
2. **5 literal sisanya** — butuh keputusan desain: menambah token `headlineMedium`
   sudah ada (28), jadi pilihan realistis adalah menurunkan ke 22/16 atau
   membiarkannya sebagai pengecualian dekoratif.
3. **Snapshot gulir untuk riwayat maju/mundur antar-tab** (mis. tab A → tautan
   ke tab B → kembali ke A) — saat ini hanya URL yang diingat per tab.
