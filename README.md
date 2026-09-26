<div align="center">

# 🅧 Zenith Browser

**Browser Android ringan bergaya [Zen](https://github.com/zen-browser/docs) — dengan skrip ala [Via](https://github.com/tuyafeng/Via), ekstensi ala [Kiwi](https://github.com/kiwibrowser/src.next), dan shields ala [Brave](https://github.com/brave/brave-browser) — dibangun dengan Rust + React Native.**

`Rust Core (JNI)` · `React Native UI` · `WebView Android` · `Android 7.0 → 16+`

**Built with 🩷 Pistis Litae**

</div>

---

## ✨ Tentang Zenith

Zenith menggabungkan tiga filosofi browser ke satu aplikasi Android native yang ringan:

| Sumber | Yang diambil | Implementasi di Zenith |
| --- | --- | --- |
| **Zen Browser** (docs) | Workspaces, Compact Mode, Split View, Glance, omnibox mengambang tanpa NTP, mesin pencari kustom `%s` | Workspaces berikon, mode kompak, split 2 panel, pratinjau cepat (Glance) via tekan-lama tautan, omnibox mengambang, pengelola mesin pencari |
| **Via Browser** (tuyafeng) | Userscript `// ==UserScript==` format Greasy Fork, pengaturan per-situs (JS/UA/iklan), filosofi "ringan & tanpa iklan" | Manajer skrip (tempel/impor URL/urutan jalan), parser metadata di Rust, pengaturan per-situs, pemblokir iklan level jaringan |
| **Kiwi Browser** (src.next) | Dukungan ekstensi Chrome (MV2/MV3) | **Subset kompatibel**: impor `.zip` ekstensi, parsing manifest, injeksi `content_scripts` (js/css + `matches` + `run_at`), shim `chrome.storage`/`chrome.runtime` mini |

**Tanpa telemetri. Tanpa iklan. Semua data lokal.**

## 🏗️ Arsitektur

```
┌────────────────────────────────────────────────────────┐
│  UI — React Native (TypeScript)                        │
│  BrowserScreen · Omnibox · TabSwitcher · Glance ·       │
│  Workspaces · Settings · Scripts · Extensions           │
└───────────────┬────────────────────────────────────────┘
                │  NativeModules.ZenithCore (Promise/JSON)
┌───────────────▼────────────────────────────────────────┐
│  Zenith Core — Rust (libzenith_core.so, 4 ABI)          │
│  • userscript.rs : parser @match/@include/@exclude      │
│  • extension.rs  : parser manifest MV2/MV3              │
│  • pattern.rs    : match-pattern Chromium + glob GM     │
│  • adblock.rs    : mesin blokir hosts + allowlist       │
│  • urlkit.rs     : normalisasi omnibox & %s             │
└───────────────┬────────────────────────────────────────┘
                │  JNI (com.zenith.browser.core.ZenithCoreJNI)
┌───────────────▼────────────────────────────────────────┐
│  Kotlin — ZenithWebViewClient                           │
│  shouldInterceptRequest → blokir iklan di level jaringan│
│  react-native-webview + inject script/ekstensi/CSS      │
└────────────────────────────────────────────────────────┘
```

**Alur injeksi skrip (bebas race):**
1. `BRIDGE_SCRIPT` statis disuntik di `document-start` (via `injectedJavaScriptBeforeContentLoaded`).
2. Jembatan mengirim sinyal `zen:docstart` / `zen:docend` / `zen:docidle` (dan `zen:urlchange` untuk SPA).
3. Setiap sinyal → pola dicocokkan di **Rust** → payload skrip/ekstensi/CSS disuntik idempoten (guard per skrip).
4. Bila `libzenith_core.so` tidak ada, semua otomatis fallback ke implementasi TypeScript.

## 📱 Fitur

- **Omnibox mengambang (Zen)** — tombol `+` membuka URL bar di atas tab saat ini; tanpa halaman tab baru khusus. Saran dari mesin pencari + riwayat + bookmark + tab terbuka.
- **Workspaces (Zen)** — kelompokkan tab per aktivitas (emoji + nama), pindah tab antar workspace.
- **Compact mode (Zen)** — sembunyikan semua bar untuk browsing penuh.
- **Split view (Zen)** — dua tab berdampingan (tahan card tab → *Split dengan tab ini*).
- **Glance (Zen)** — tekan-lama tautan → *Pratinjau cepat*: pratinjau melayang tanpa meninggalkan halaman, bisa di-expand ke tab baru atau di-split.
- **Skrip (format Via)** — userscript format Greasy Fork: `@name`, `@match`, `@include`/`@exclude` (glob/regex), `@run-at`, `@grant`; impor dari URL atau tempel kode; aktif/mati + urutan jalan; shim `GM_*` (`GM_addStyle`, `GM_get/set/Value`, `GM_listValues`, `unsafeWindow`).
- **Ekstensi (subset Kiwi)** — impor ZIP ber-`manifest.json` (MV2/MV3); `content_scripts` disuntik sesuai `matches`/`exclude_matches`/`run_at`; shim `chrome.storage.local` & `chrome.runtime.sendMessage`. ⚠️ *Service worker/background tidak dijalankan (batas WebView).*
- **Pemblokir iklan level jaringan** — daftar hosts bawaan (aman, terkurasi) + impor daftar besar (StevenBlack/adAway) dari URL; allowlist per situs; statistik jumlah blokir; diblokir di `shouldInterceptRequest` (Kotlin→Rust) — bukan sekadar CSS.
- **Pengaturan situs (Via)** — per host: matikan JavaScript, matikan pemblokir, UA desktop/kustom, CSS kustom (userstyle).
- **Mesin pencari kustom (Zen)** — URL templat `%s` + URL saran; Google/DuckDuckGo/Bing/Wikipedia ID bawaan.
- **Unduhan cepat multi-thread** — mesin unduhan **multi-thread (4 koneksi + Range paralel)** di Kotlin: banner progres + kecepatan langsung di browser, layar Unduhan (mulai dari URL, batal, buka, bagikan, hapus), fallback opsional ke DownloadManager sistem.
- **Shields (Brave)** — tombol perisai dengan **penghitung blokir real-time**, panel per-situs (blokir iklan, JavaScript, HTTPS), **upgrade HTTPS otomatis** (http → https), dan mesin pencari **Brave Search** bawaan.
- **Tab privat** 🕶, bookmark, riwayat (500 entri), pencarian terakhir di omnibox, sesi dipulihkan otomatis, tema gelap/terang/sistem, bar bawah atau atas.
- **Android 7.0 (API 24) → Android 16/17 (API 36/37)** — satu APK universal 4 ABI.

## 📂 Struktur proyek

```
Zenith/
├── App.tsx                     # Root + router layar
├── index.js                    # Registrasi AppRegistry
├── src/
│   ├── browser/                # BrowserScreen, TabView (WebView+injeksi),
│   │                           # Omnibox, TabSwitcher, GlanceView, refs
│   ├── screens/                # Settings, Scripts, Extensions,
│   │                           # SiteSettings, About
│   ├── core/                   # native.ts (JNI), plan.ts (perencana injeksi),
│   │                           # inject.ts (bridge/shim JS), userscriptFallback.ts,
│   │                           # suggest.ts, examples.ts
│   ├── state/                  # store.tsx (Context+Reducer+AsyncStorage), defaults
│   ├── ui/                     # Icon (SVG), kit (Row/Sheet/…), ScreenShell, theme
│   └── types.ts
├── android/
│   └── app/src/main/java/com/zenith/browser/
│       ├── core/               # ZenithCoreJNI (JNI), ZenithCoreModule (RN), Package
│       ├── webview/            # ZenithWebViewManager/Client/Package (ad-block jaringan)
│       ├── MainActivity.kt · MainApplication.kt
│   └── app/build.gradle        # task buildRustCore (cargo-ndk → jniLibs)
├── rust/
│   ├── build-android.sh        # cargo-ndk 4 ABI → libzenith_core.so
│   └── zenith-core/src/        # pattern, userscript, extension, adblock, urlkit, jni
└── .github/workflows/android.yml  # CI build APK
```

## 📦 Rilis

Unduh APK langsung dari **[GitHub Releases](https://github.com/ahyat786/Zenith-App/releases)** — dikompilasi otomatis oleh GitHub Actions:

| Properti | Nilai |
| --- | --- |
| Rilis terkini | [v0.2.0](https://github.com/ahyat786/Zenith-App/releases/latest) (`Zenith-v0.2.0-android.apk`, universal, ±70 MB) |
| Paket | `com.zenith.browser` v0.2.0 (versionCode 3) |
| Kompatibilitas | **Android 7.0 (API 24) → Android 16/17 (API 36/37)** |
| ABI | arm64-v8a, armeabi-v7a, x86, x86_64 |
| Engine JS | Hermes |
| Inti Rust | `libzenith_core.so` (1.3–2.2 MB per ABI) |
| Tanda tangan | **Kunci rilis** (dari GitHub Secrets, diverifikasi `apksigner` di CI) |

**Instal:** unduh APK → buka → izinkan "instal dari sumber tidak dikenal" → selesai.
Atau via ADB: `adb install Zenith-v0.1.1-android.apk`

> Ingin APK lebih kecil (~30 MB)? Batasi ABI di `android/gradle.properties`:
> `reactNativeArchitectures=arm64-v8a,armeabi-v7a` lalu build ulang.

## 🔐 Keamanan & penandatanganan

**Tidak ada kunci, token, atau password yang di-commit ke repo ini.**

Penandatanganan rilis memakai 4 [GitHub Secrets](https://docs.github.com/en/actions/security-guides/using-secrets-in-github-actions) (terenkripsi, *write-only*):

| Secret | Isi |
| --- | --- |
| `ZENITH_KEYSTORE_BASE64` | Keystore PKCS12 (base64) — kunci rilis RSA-4096 |
| `ZENITH_KEYSTORE_PASSWORD` | Password keystore |
| `ZENITH_KEYSTORE_ALIAS` | Alias kunci (`zenith`) |
| `ZENITH_KEY_PASSWORD` | Password kunci |

Alurnya: CI me-decode secret → file sementara → Gradle menandatangani via env `ZENITH_KEYSTORE_*` →
`apksigner verify` mencetak sertifikat di log sebagai bukti. Build lokal tanpa env tersebut
otomatis fallback ke debug key (pengembangan).

**Rotasi kunci / ganti keystore:** jalankan `scripts/generate-release-keystore.sh`, lalu perbarui
keempat secret di GitHub (Settings → Secrets and variables → Actions). Simpan keystore +
password di password manager — GitHub Secrets tidak bisa dibaca ulang setelah disimpan.

**Hygiene token:** jangan pernah menaruh token akses di kode/perintah git. Jika token sempat
terpapar, segera *revoke* di GitHub → Settings → Developer settings → Fine-grained tokens.

## 🔨 Build

### Prasyarat
- Node ≥ 22, JDK 17, Android SDK (platform 37, build-tools 37), NDK 27.1
- Rust stable + `cargo-ndk` + 4 target Android:
  ```bash
  rustup target add aarch64-linux-android armv7-linux-androideabi \
                   x86_64-linux-android i686-linux-android
  cargo install cargo-ndk
  ```

### Langkah
```bash
npm install                 # dependensi JS
# Inti Rust dikompilasi otomatis oleh Gradle (task buildRustCore).
cd android
./gradlew assembleRelease   # APK → app/build/outputs/apk/release/
# Lewati build Rust (pakai .so yang ada):
# ./gradlew assembleRelease -Pzenith.skipRust=1
```

APK debug: `./gradlew assembleDebug`. Jalankan di emulator: `npm run android`.

> **Inti Rust saja** (uji unit di host): `cd rust && cargo test` — 21 test.

### Ringan
- `.so` Rust hanya 1–2 MB per ABI (`opt-level=z`, LTO, strip).
- Depedensi native minimal: webview, safe-area, async-storage, svg.
- APK bisa diperkecil dengan membatasi ABI di `android/gradle.properties`:
  `reactNativeArchitectures=arm64-v8a,armeabi-v7a`

## ⚠️ Batasan (jujur)

| Batas | Penjelasan |
| --- | --- |
| Mesin render = WebView | Sama seperti Via. Kecepatan & dukungan standar web mengikuti Android System WebView di perangkat. |
| Ekstensi = subset content scripts | Background/service worker, `webRequest`, `declarativeNetRequest` milik ekstensi tidak bisa berjalan di WebView. Kiwi (fork Chromium) bisa; Zenith tidak. |
| Tab privat | Cookie tetap milik profil WebView bersama (batas Android < API 28); yang privat: tidak dicatat ke riwayat/saran/penyimpanan aplikasi. |
| `@run-at document-start` | Best-effort: injeksi terjadi beberapa ms setelah sinyal document-start (via bridge), bukan sebelum skrip halaman pertama. |
| Match pattern | `*://`, `http(s)`, `*.host`, glob `*`, regex `/.../`; `file://` dan `.tld` tidak didukung. |

## 🧪 Kualitas

- `cargo test` — **21/21 lulus** (pattern, userscript, extension manifest, adblock, urlkit, JNI JSON).
- `tsc --noEmit` — 0 error.
- `react-native bundle` (Hermes, release) — lulus.

## 🙏 Credit sumber

Zenith berdiri di atas bahu tiga proyek open-source berikut — **semua kredit untuk para pembuatnya**:

| Proyek sumber | Repo | Kontribusi pada Zenith |
| --- | --- | --- |
| 🌙 **Zen Browser** (docs) | [github.com/zen-browser/docs](https://github.com/zen-browser/docs) | Konsep & desain UX: workspaces, compact mode, split view, glance, omnibox mengambang, pengelola mesin pencari |
| ⚡ **Via Browser** | [github.com/tuyafeng/Via](https://github.com/tuyafeng/Via) | Format userscript (Greasy Fork), pengaturan per-situs, filosofi browser ringan tanpa iklan |
| 🥝 **Kiwi Browser** (src.next) | [github.com/kiwibrowser/src.next](https://github.com/kiwibrowser/src.next) | Model dukungan ekstensi Chrome (parsing manifest MV2/MV3 + content scripts) |
| 🦁 **Brave Browser** | [github.com/brave/brave-browser](https://github.com/brave/brave-browser) | Shields per-situs, penghitung blokir, upgrade HTTPS, Brave Search |

**Built with 🩷 [Pistis Litae](https://github.com/ahyat786)** — penggabungan ketiganya dalam Rust + React Native.

- [Zen Browser docs](https://github.com/zen-browser/docs) — docs berlisensi repo masing-masing.
- [Via Browser](https://github.com/tuyafeng/Via) © Yafeng Tu.
- [Kiwi Browser src.next](https://github.com/kiwibrowser/src.next).
- [Brave Browser](https://github.com/brave/brave-browser) — Shields & HTTPS-upgrade.
- Kode Zenith: **MIT** (lihat [LICENSE](./LICENSE)).

Zenith adalah proyek independen dan bukan produk resmi Zen/Via/Kiwi.

## 🗺️ Roadmap

- [ ] Sinkronisasi pengaturan (opsional, end-to-end encrypted)
- [ ] Panel konsol untuk debug skrip (log `zen:error`)
- [ ] `@require` dukungan pustaka eksternal
- [ ] Isolasi profil WebView penuh untuk tab privat (API 28+)
- [ ] Bookmark folder + impor/ekspor HTML
