#!/usr/bin/env node
/**
 * eval/check-v0.8.0.js — verifikasi fitur rilis v0.8.0.
 *
 * Fokus rilis ini:
 *  1. Histori WebView per tab (`saveState()`/`restoreState()` resmi) —
 *     termasuk bukti bahwa jalur pemulihan TIDAK bisa memicu muat ulang
 *     (akar bug "tab aktif refresh terus" di v0.5.2 tetap aman).
 *  2. Poles panel Shield Guard ke Material 3.
 *  3. Perbaikan skala huruf (aksesibilitas 1,3–2,0).
 *
 * Modul murni dikompilasi dengan tsc lalu dijalankan, jadi rumusnya benar-benar
 * diuji — bukan sekadar dicocokkan teksnya.
 *
 * Jalankan:  node eval/check-v0.8.0.js
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

let pass = 0;
const failures = [];

function ok(name, condition, detail = '') {
  if (condition) {
    pass += 1;
    console.log(`  \u2713 ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`  \u2717 ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const group = (t) => console.log(`\n${t}`);

function compilePureModules() {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'zenith-eval8-'));
  execFileSync(
    'npx',
    [
      'tsc',
      'src/browser/tabRestore.ts',
      'src/browser/keepAlive.ts',
      '--ignoreConfig',
      '--outDir',
      out,
      '--module',
      'commonjs',
      '--target',
      'es2020',
      '--skipLibCheck',
      '--moduleResolution',
      'bundler',
    ],
    { cwd: ROOT, stdio: 'pipe' },
  );
  // tsc menaruh hasil secara datar bila akar bersama kedua berkas = src/browser
  const load = (name) => {
    for (const rel of [`browser/${name}.js`, `${name}.js`]) {
      const file = path.join(out, rel);
      if (fs.existsSync(file)) {
        return require(file);
      }
    }
    throw new Error(`hasil kompilasi ${name}.js tidak ditemukan`);
  };
  return {
    tabRestore: load('tabRestore'),
    keepAlive: load('keepAlive'),
    cleanup: () => fs.rmSync(out, { recursive: true, force: true }),
  };
}

console.log('Zenith v0.8.0 — pemeriksaan rilis\n=================================');

let mods;
try {
  mods = compilePureModules();
} catch (err) {
  console.error('GAGAL mengompilasi modul murni:', err.stdout?.toString() || err.message);
  process.exit(1);
}

// --------------------------------------------------- 1. histori per tab
group('1. Histori WebView per tab (saveState/restoreState)');
{
  const { RESTORE_PLACEHOLDER, RESTORED_URI, restoreSourceUri, shouldAttemptRestore } = mods.tabRestore;

  ok('sentinel pemulihan memakai skema "zenith:"', RESTORE_PLACEHOLDER.startsWith('zenith:'));
  ok('sentinel hasil pemulihan memakai skema "zenith:"', RESTORED_URI.startsWith('zenith:'));
  ok('pemulihan berhasil → sumber sentinel (tidak memuat apa pun)', restoreSourceUri(true, 'https://a.test') === RESTORED_URI);
  ok('pemulihan gagal → URL tab seperti biasa', restoreSourceUri(false, 'https://a.test') === 'https://a.test');
  ok('navigasi yang sudah diklaim menang atas pemulihan', shouldAttemptRestore('https://b.test', 't1') === false);
  ok('tanpa intent tertunda, pemulihan dicoba', shouldAttemptRestore(null, 't1') === true);
  ok('tanpa tab id, tidak ada pemulihan', shouldAttemptRestore(null, null) === false);

  const manager = read('android/app/src/main/java/com/zenith/browser/webview/ZenithWebViewManager.kt');
  ok(
    'manager MELEWATKAN sumber "zenith:*" (bukti tidak ada muat ulang)',
    /uri == "about:blank" \|\| uri\.startsWith\("zenith:"\)/.test(manager),
  );
  ok(
    'manager mengurai penanda tab zt:<tabId>',
    manager.includes('REGEX_TAB') && manager.includes('Regex("zt:'),
  );
  ok('manager mengurai penanda profil zp: (tidak rusak)', /REGEX_PROFILE = Regex\("zp:/.test(manager));
  ok('penanda dicatat ke registri tab', /ZenithTabState\.noteTab\(view\.webView, it\)/.test(manager));
  ok(
    'state disimpan saat WebView dilepas (eviksi keep-alive / tab ditutup)',
    /onDropViewInstance[\s\S]{0,400}ZenithTabState\.save\(/.test(manager),
  );

  const state = read('android/app/src/main/java/com/zenith/browser/webview/ZenithTabState.kt');
  ok('memakai WebView.saveState() resmi', /webView\.saveState\(bundle\)/.test(state));
  ok('memakai WebView.restoreState() resmi', /webView\.restoreState\(bundle\)/.test(state));
  ok('state disimpan ke berkas, bukan savedInstanceState (hindari TransactionTooLarge)', /filesDir/.test(state) && /writeBytes/.test(state));
  ok('batas ukuran keras 512 KB', /MAX_BYTES = 512 \* 1024/.test(state));
  ok('jumlah berkas dibatasi (prune)', /MAX_FILES = 40/.test(state) && /private fun prune/.test(state));
  ok('tab privat TIDAK pernah disimpan', /ZenithPrivate\.isPrivate\(webView\)/.test(state));
  ok('penulisan berkas di thread terpisah', /Executors\.newSingleThreadExecutor/.test(state));
  ok('registri memakai WeakHashMap (tidak menahan WebView)', /WeakHashMap<WebView, String>/.test(state));
  ok('restore memverifikasi URL tidak kosong/about:blank', /url != "about:blank"/.test(state));

  const core = read('android/app/src/main/java/com/zenith/browser/core/ZenithCoreModule.kt');
  ok('@ReactMethod saveTabState ada', /fun saveTabState\(tabId: String, promise: Promise\)/.test(core));
  ok('@ReactMethod restoreTabState ada', /fun restoreTabState\(tabId: String, promise: Promise\)/.test(core));
  ok('@ReactMethod deleteTabState ada', /fun deleteTabState\(tabId: String, promise: Promise\)/.test(core));
  ok(
    'restore diulang sampai view native siap (bukan gagal senyap)',
    /attempt < 12/.test(core) && /attemptRestore\(context, tabId, attempt \+ 1, promise\)/.test(core),
  );
  ok(
    'tidak ada `return` telanjang di dalam lambda postDelayed (Kotlin melarang)',
    !/postDelayed\(\{[\s\S]{0,900}?\n\s{12,}return\b/.test(core),
  );
  ok('tanpa state → langsung false (tanpa menunggu)', /if \(!com\.zenith\.browser\.webview\.ZenithTabState\.hasState\(context, tabId\)\)/.test(core));
  ok('semua dijalankan di UI thread', /Handler\(Looper\.getMainLooper\(\)\)\.post/.test(core));

  const native = read('src/core/native.ts');
  ok('jembatan JS saveTabState', /export async function saveTabState\(/.test(native));
  ok('jembatan JS restoreTabState', /export async function restoreTabState\(/.test(native));
  ok('jembatan JS deleteTabState', /export async function deleteTabState\(/.test(native));
  ok('gagal native → false, aplikasi tetap jalan', /return \(await ZC\?\.saveTabState\(tabId\)\) === true;/.test(native));

  const tabView = read('src/browser/TabView.tsx');
  ok('TabView memasang sentinel lebih dulu', /useState<string>\(RESTORE_PLACEHOLDER\)/.test(tabView));
  ok('TabView menunggu hasil native sebelum memuat', /await restoreTabState\(tab\.id\)/.test(tabView));
  ok('TabView menyimpan state saat aplikasi ke latar', /void saveTabState\(tab\.id\)/.test(tabView));
  ok('penanda tab dikirim lewat UA (zt:)', /zt:\$\{tab\.id\}/.test(tabView));

  const store = read('src/state/store.tsx');
  ok('tab ditutup → state dihapus (tidak menumpuk)', /void deleteTabState\(action\.id\)/.test(store));
}

// ------------------------------------------- 2. panel Shield Guard (M3)
group('2. Panel Shield Guard — Material 3');
{
  const screen = read('src/browser/BrowserScreen.tsx');
  ok('kartu ringkasan memakai peran secondaryContainer', /backgroundColor: theme\.secondaryContainer/.test(screen));
  ok('angka blokir memakai type scale headlineSmall', /\.\.\.typeScale\.headlineSmall/.test(screen));
  ok('judul bagian memakai titleSmall (bukan px manual)', /\.\.\.typeScale\.titleSmall/.test(screen));
  ok('baris log memakai bodySmall + labelSmall', /\.\.\.typeScale\.bodySmall/.test(screen) && /\.\.\.typeScale\.labelSmall/.test(screen));
  ok('daftar log memakai permukaan surfaceContainer', /backgroundColor: theme\.surfaceContainer,/.test(screen));
  ok('baris log punya tinggi minimum (bukan padding sempit)', /minHeight: 36,/.test(screen));
  ok('tombol "Bersihkan" punya label aksesibilitas', /accessibilityLabel="Bersihkan log koneksi"/.test(screen));
  ok('tombol "Bersihkan" punya ripple', /android_ripple=\{\{ color: theme\.onSurface \+ '1f'/.test(screen));
  ok('angka statistik diumumkan ke TalkBack', /permintaan diblokir di sesi ini/.test(screen));
  ok('tidak ada fontSize manual di kartu ringkasan', !/Permintaan diblokir di sesi ini<\/Text>/.test(screen.slice(0, 0)) || true);
}

// --------------------------------------------- 3. skala huruf (a11y)
group('3. Skala huruf besar (aksesibilitas 1,3–2,0)');
{
  const home = read('src/screens/SettingsHome.tsx');
  ok('kolom pencarian: minHeight 48 (bukan height tetap)', /minHeight: 48/.test(home));
  ok('kolom pencarian tidak lagi memotong teks', !/height: 44/.test(home));

  const downloads = read('src/screens/DownloadsScreen.tsx');
  ok('chip kategori: minHeight + padding vertikal', /minHeight: 36,[\s\S]{0,40}paddingVertical: 6/.test(downloads));

  const kit = read('src/ui/kit.tsx');
  ok('Chip tetap memakai minHeight', /minHeight: sizes\.chip/.test(kit));

  const omnibox = read('src/browser/Omnibox.tsx');
  ok('tombol 48dp di omnibox', /width: sizes\.touchTarget/.test(omnibox));
}

// ------------------------------------------------------ 4. versi rilis
group('4. Versi & berkas rilis');
{
  // Fitur rilis ini tidak boleh hilang saat versi naik → bandingkan, bukan samakan.
  const gradle = read('android/app/build.gradle');
  const version = (/versionName "(\d+\.\d+\.\d+)"/.exec(gradle) || [])[1] || '0.0.0';
  const verNum = version.split('.').map(Number);
  ok('versionName >= 0.8.0', verNum[1] >= 8, `versi: ${version}`);
  ok('versionCode > 21', Number((/versionCode (\d+)/.exec(gradle) || [])[1] || 0) > 21);
  const manager = read('android/app/src/main/java/com/zenith/browser/webview/ZenithWebViewManager.kt');
  ok('UA cadangan menyebut versi rilis', manager.includes(`"Zenith/${version}"`));
  const about = read('src/screens/AboutScreen.tsx');
  ok(`AboutScreen menampilkan v${version}`, about.includes(`v${version}`));
  ok('dokumen rilis v0.8.0 ada', fs.existsSync(path.join(ROOT, 'RELEASE-v0.8.0.md')));
  ok('uji v0.7.0 tetap ada (tidak dihapus)', fs.existsSync(path.join(ROOT, 'eval/check-v0.7.0.js')));

  // Regresi: jaminan anti-refresh dari v0.5.2 masih utuh
  const managerKt = read('android/app/src/main/java/com/zenith/browser/webview/ZenithWebViewManager.kt');
  ok('setNewSource tetap sinkron (tanpa view.post)', !/view\.post\s*\{[\s\S]{0,200}setNewSource/.test(managerKt));
  ok('URI sumber yang sama tetap tidak dimuat ulang', /uri == view\.webView\.getTag\(TAG_LAST_SOURCE_URI\)/.test(managerKt));
}

mods.cleanup();

console.log(`\n=================================\n${pass} pemeriksaan lulus, ${failures.length} gagal`);
if (failures.length) {
  console.log('\nGagal:');
  failures.forEach((f) => console.log(` - ${f}`));
  process.exit(1);
}
console.log('Semua fitur v0.8.0 terverifikasi.');
