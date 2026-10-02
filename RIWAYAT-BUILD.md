# Riwayat build Zenith — commit merah dan perbaikannya

Catatan ini menjawab pertanyaan yang sering muncul: *"kenapa ada commit yang
CI-nya merah?"* Setiap rilis Zenith punya pola yang sama — **commit fitur merah
di CI, lalu diperbaiki, CI hijau, BARU tag dipasang**. Jadi commit merah itu
commit antara, bukan kode yang dipakai untuk APK rilis.

## Ringkasan

| Rilis | Commit fitur | CI | Penyebab gagal | Commit perbaikan | CI | Tag dipasang di |
| --- | --- | --- | --- | --- | --- | --- |
| v0.6.0 | `2582b02` | ❌ | `ZenithCoreModule.kt`: impor `LifecycleEventListener` salah (`Unresolved reference`, 3× `overrides nothing`) | `5c8719b` | ✅ | `f3d67eb` ✅ |
| v0.7.0 | `61e32c3` | ❌ | `ZenithDynamicColor.kt:81` — `WritableMap` tidak punya `size()` | `ca8a02d` | ✅ | `ca8a02d` ✅ |
| v0.8.0 | `ece4499` | ❌ | `ZenithCoreModule.kt:349` — `return` di dalam lambda `postDelayed` (Kotlin melarang) | `fbf955b` | ✅ | `fbf955b` ✅ |
| v0.9.0 | `ec522ea` | ✅ | — (langsung hijau) | — | ✅ | `ec522ea` ✅ |

Yang penting dibaca dari tabel di atas: **kolom terakhir**. Tag rilis selalu
menunjuk ke commit yang CI-nya hijau, dan APK di halaman Release dibangun dari
commit itu — bukan dari commit merah.

## Rincian v0.7.0 (`61e32c3`) — pertanyaan yang paling sering muncul

```
e: .../core/ZenithDynamicColor.kt:81:24 Unresolved reference 'size'.
```

- **Apa yang salah:** memeriksa apakah map palet terisi memakai `map.size()`.
  Objek itu `WritableMap`, dan antarmuka induknya (`ReadableMap`) tidak punya
  metode `size()`.
- **Akibatnya:** tugas Gradle `:app:compileReleaseKotlin` gagal → langkah
  verifikasi tanda tangan, upload APK, dan pembuatan Release terlewati.
- **Yang TIDAK gagal:** langkah "Typecheck TypeScript" dan "Periksa fitur
  rilis (eval/check-v*.js)" lulus — logika aplikasinya benar, hanya satu
  pemanggilan API Android di sisi native yang salah.
- **Perbaikannya (`ca8a02d`):** ganti `map.size() == 0` dengan penghitung
  `filled` yang diinkremen setiap peran berhasil dibaca.
- **Bukti rilis sehat:** tag `v0.7.0` menunjuk `ca8a02d`; run tag
  (`36955670009`) sukses; Release punya `Zenith-android.apk` 79,4 MB.

## Mengapa commit merah dibiarkan di riwayat

Menghapusnya berarti menulis ulang sejarah `main` (force-push). Itu berbahaya
untuk repo publik — commit hash berubah, klon orang lain rusak, dan jejak
persetujuan ikut hilang. Praktik yang lebih aman: **biarkan terlihat, perbaiki
di commit berikutnya, pasang tag hanya di commit hijau.** Itulah yang dilakukan
di sini.

Kalau pemilik repo ingin `main` bersih dari commit merah, pilihan yang aman:

1. **Revert** commit merah tersebut (`git revert`) — riwayat tetap utuh, ada
   commit baru yang menetralkan; tetapi efeknya nol karena commit perbaikan
   sudah ada di atasnya.
2. **Squash saat merge** ke branch rilis — cocok untuk kerja berikutnya, tidak
   mengubah sejarah lama.
3. **Force-push** — hanya bila repo masih privat dan tidak ada orang lain yang
   mengklon; tidak disarankan untuk repo publik.

## Pengaman agar tidak terulang

Sejak v0.7.0, CI menjalankan `eval/check-v*.js` pada setiap push. Kesalahan
yang masih bisa lolos hanyalah yang **hanya bisa dilihat kompiler Kotlin**
(kedua kegagalan di atas adalah contohnya: API salah nama dan `return` di
dalam lambda). Karena itu aturan kerja yang dipakai sekarang:

- Setiap perubahan Kotlin diperiksa **tiga hal** sebelum push: nama API-nya ada
  (dicek ke dokumentasi/kode sumber), tidak ada `return` di dalam lambda non-inline,
  dan tidak ada pemanggilan metode yang tidak dimiliki tipe antarmukanya.
- Tag **tidak pernah** dipasang sebelum run `main` hijau.
