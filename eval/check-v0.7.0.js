#!/usr/bin/env node
/**
 * eval/check-v0.7.0.js — verifikasi mandiri fitur rilis v0.7.0.
 *
 * Dua lapis pemeriksaan:
 *  1. UJI PERILAKU — modul murni (`src/core/dynamicTheme.ts`,
 *     `src/browser/keepAlive.ts`, `src/core/color.ts`) dikompilasi dengan
 *     `tsc` lalu dijalankan di Node, sehingga rumusnya benar-benar diuji
 *     (bukan hanya dicocokkan teksnya).
 *  2. UJI WIRING — memastikan modul itu benar-benar dipakai di aplikasi
 *     (BrowserScreen, Theme, SettingsScreen, FirefoxMenu, jembatan native).
 *
 * Jalankan:  node eval/check-v0.7.0.js
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

function group(title) {
  console.log(`\n${title}`);
}

// ---------------------------------------------------------------- kompilasi
function compilePureModules() {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'zenith-eval-'));
  execFileSync(
    'npx',
    [
      'tsc',
      'src/core/color.ts',
      'src/core/dynamicTheme.ts',
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
  const load = (rel) => require(path.join(out, rel));
  return {
    color: load('core/color.js'),
    dynamicTheme: load('core/dynamicTheme.js'),
    keepAlive: load('browser/keepAlive.js'),
    cleanup: () => fs.rmSync(out, { recursive: true, force: true }),
  };
}

console.log('Zenith v0.7.0 — pemeriksaan rilis\n=================================');

let mods;
try {
  mods = compilePureModules();
} catch (err) {
  console.error('GAGAL mengompilasi modul murni:', err.stdout?.toString() || err.message);
  process.exit(1);
}

// ------------------------------------------------------------ 1. keep-alive
group('1. Keep-alive WebView (panduan memori WebView)');
{
  const { aliveWebViewIds, KEEP_ALIVE_TABS } = mods.keepAlive;
  const t = (id, lastActiveAt) => ({ id, lastActiveAt });

  ok('batas keep-alive = 3 (aktif + 2 terakhir)', KEEP_ALIVE_TABS === 3);

  const tabs = [t('a', 100), t('b', 500), t('c', 300), t('d', 900), t('e', 200)];
  const ids = aliveWebViewIds(tabs, 'c', []);
  ok('tab aktif selalu ikut', ids[0] === 'c', `hasil: ${ids.join(',')}`);
  ok('jumlah tidak melebihi batas', ids.length === KEEP_ALIVE_TABS, `hasil: ${ids.length}`);
  ok(
    'sisanya diambil dari yang terbaru (LRU)',
    ids.includes('d') && ids.includes('b') && !ids.includes('a') && !ids.includes('e'),
    `hasil: ${ids.join(',')}`,
  );

  const split = aliveWebViewIds(tabs, 'e', ['a', 'b']);
  ok(
    'tab split ikut dipertahankan (keduanya terlihat)',
    split.includes('a') && split.includes('b') && split.includes('e') && split.length === 3,
    `hasil: ${split.join(',')}`,
  );

  ok('tanpa duplikat', new Set(split).size === split.length);
  ok('tab aktif null tidak membuat entri kosong', !aliveWebViewIds(tabs, null, []).includes(''));

  const screen = read('src/browser/BrowserScreen.tsx');
  ok('BrowserScreen memakai aliveWebViewIds()', /aliveWebViewIds\(/.test(screen));
  ok(
    'sisa tab dilepas dari hierarki (mountTabs memfilter)',
    /return mine\.filter\(\(t\) => mountedIds\.includes\(t\.id\)\)/.test(screen),
  );
  ok(
    'tidak ada lagi "hanya satu WebView" yang memaksa muat ulang tiap pindah tab',
    !/return mine\.filter\(\(t\) => t\.id === state\.activeTabId/.test(screen),
  );
}

// ------------------------------------------------- 2. warna dinamis (M3)
group('2. Warna dinamis Material You (DynamicColors → JS)');
{
  const { mergeDynamicTokens } = mods.dynamicTheme;
  const { withAlpha } = mods.color;

  const base = {
    dark: true,
    primary: '#D0BCFF',
    onPrimary: '#381E72',
    accent: '#D0BCFF',
    onAccent: '#381E72',
    accentSoft: 'rgba(208,188,255,0.16)',
    subtext: '#CAC4D0',
    bg: '#141218',
    surfaceVariant: '#49454F',
  };

  const patch = {
    primary: '#8ab4f8',
    onPrimary: '#00315f',
    onSurfaceVariant: '#c2c7cf',
    secondaryContainer: '#3f4757',
  };
  const merged = mergeDynamicTokens(base, patch, withAlpha);

  ok('peran primary dari wallpaper menimpa token dasar', merged.primary === '#8ab4f8');
  ok('peran baru ikut masuk (secondaryContainer)', merged.secondaryContainer === '#3f4757');
  ok('alias lama `accent` ikut berubah', merged.accent === '#8ab4f8', `accent: ${merged.accent}`);
  ok('alias lama `onAccent` ikut berubah', merged.onAccent === '#00315f');
  ok('alias lama `subtext` ikut berubah', merged.subtext === '#c2c7cf');
  ok(
    'accentSoft dihitung ulang dari primary + alfa 0.16 (gelap)',
    merged.accentSoft === withAlpha('#8ab4f8', 0.16),
    `accentSoft: ${merged.accentSoft}`,
  );
  ok('warna netral TIDAK diambil wallpaper (identitas & kontras)', merged.bg === '#141218');
  ok('objek dasar tidak diubah (immutability)', base.primary === '#D0BCFF');

  const light = mergeDynamicTokens({ ...base, dark: false }, patch, withAlpha);
  ok('alfa accentSoft berbeda untuk tema terang (0.12)', light.accentSoft === withAlpha('#8ab4f8', 0.12));
  ok('tanpa patch, tema tidak berubah bentuk', mergeDynamicTokens(base, {}, withAlpha).primary === '#D0BCFF');

  ok('withAlpha menambah 2 digit heksa', withAlpha('#8ab4f8', 0.5) === '#8ab4f8' + '80');
  ok('withAlpha menolak warna non-heksa (tidak rusak)', withAlpha('rgba(0,0,0,0.5)', 0.5) === 'rgba(0,0,0,0.5)');

  const kotlin = read('android/app/src/main/java/com/zenith/browser/core/ZenithDynamicColor.kt');
  ok('native memakai DynamicColors.isDynamicColorAvailable()', /DynamicColors\.isDynamicColorAvailable\(\)/.test(kotlin));
  ok('native memakai wrapContextIfAvailable + overlay M3', /wrapContextIfAvailable\([\s\S]{0,220}ThemeOverlay_Material3_DynamicColors_DayNight/.test(kotlin));
  ok('warna dibaca lewat MaterialColors.getColor()', /MaterialColors\.getColor\(/.test(kotlin));
  ok('mode malam dipaksa mengikuti tema Zenith', /UI_MODE_NIGHT_YES/.test(kotlin));
  ok('dibatasi Android 12+ (S)', /Build\.VERSION_CODES\.S/.test(kotlin));

  const gradle = read('android/app/build.gradle');
  ok('dependensi Material Components ditambahkan', /com\.google\.android\.material:material:/.test(gradle));

  const core = read('android/app/src/main/java/com/zenith/browser/core/ZenithCoreModule.kt');
  ok('@ReactMethod dynamicColors tersedia', /fun dynamicColors\(mode: String, promise: Promise\)/.test(core));
  ok('LifecycleEventListener memakai impor yang benar', /import com\.facebook\.react\.bridge\.LifecycleEventListener/.test(core));
  ok('setNightMode tetap ada (prefers-color-scheme)', /fun setNightMode\(mode: String, promise: Promise\)/.test(core));

  const native = read('src/core/native.ts');
  ok('jembatan JS dynamicColors() ada', /export async function dynamicColors\(/.test(native));

  const theme = read('src/theme.ts');
  ok('useTheme menggabungkan palet (mergeDynamicTokens)', /mergeDynamicTokens\(base, patch, withAlpha\)/.test(theme));
  ok('useTheme memakai cache identitas tema', /mergedCache/.test(theme));
  ok('setelan theme → catatan skema palet', /noteScheme\(mode\)/.test(theme));

  const dc = read('src/core/dynamicColor.ts');
  ok('peran terbatas (tidak menimpa warna netral)', /DYNAMIC_ROLES/.test(dc) && !/'bg'/.test(dc));
  ok('fallback aman bila perangkat tidak mendukung', /unsupported/.test(dc));

  const defaults = read('src/state/defaults.ts');
  ok('setelan default dynamicColor: true', /dynamicColor: true/.test(defaults));
  const types = read('src/types.ts');
  ok('Settings.dynamicColor dideklarasikan', /dynamicColor: boolean/.test(types));
  const app = read('App.tsx');
  ok('AppShell mengaktifkan jembatan palet', /setDynamicColorEnabled\(/.test(app));
  ok('Snackbar global dipasang di akar aplikasi', /<SnackbarHost theme=\{theme\} \/>/.test(app));
}

// ------------------------------------------------------- 3. Snackbar M3
group('3. Snackbar Material 3 + aksi "Urungkan"');
{
  const snack = read('src/ui/Snackbar.tsx');
  ok('permukaan terbalik M3 (inverseSurface/inverseOnSurface)', /inverseSurface/.test(snack) && /inverseOnSurface/.test(snack));
  ok('aksi memakai inversePrimary (kontras benar)', /inversePrimary/.test(snack));
  ok('bentuk 4dp sesuai spesifikasi M3', /radius\.xs/.test(snack));
  ok('durasi 4 s / 7 s (dengan aksi lebih lama)', /DURATION_INFO = 4000/.test(snack) && /DURATION_ACTION = 7000/.test(snack));
  ok('gerak masuk memakai kurva emphasized', /motion\.easing\.emphasized/.test(snack));
  ok('diumumkan ke pembaca layar (live region)', /accessibilityLiveRegion="polite"/.test(snack));

  const settings = read('src/screens/SettingsScreen.tsx');
  ok('baris setelan "Warna dinamis" ada', /Warna dinamis \(Material You\)/.test(settings));
  ok('toggle memakai snapshot setelan terbaru (s.dynamicColor)', /value=\{s\.dynamicColor !== false\}/.test(settings));
  ok('aksi "Urungkan" mengembalikan setelan', /actionLabel: 'Urungkan'/.test(settings));

  const menu = read('src/browser/FirefoxMenu.tsx');
  ok('menu memakai hook Snackbar', /useSnackbar\(theme\)/.test(menu));
  ok('"Urungkan" pada mode desktop/mobile', /actionLabel: 'Urungkan'[\s\S]{0,80}onToggleDesktop/.test(menu));
  ok('host Snackbar berada DI DALAM Modal menu', /<\/View>\s*\{snack\.host\}\s*<\/Modal>/.test(menu));

  const screen = read('src/browser/BrowserScreen.tsx');
  ok('ToastAndroid mode desktop diganti Snackbar', !/Mode desktop — memuat ulang/.test(screen));
}

// ---------------------------------------------------- 4. transisi & a11y
group('4. Gerak Material 3 & aksesibilitas');
{
  const screen = read('src/browser/BrowserScreen.tsx');
  ok('overlay tab baru dianimasikan (emphasized)', /NewTabOverlay/.test(screen) && /motion\.easing\.emphasized/.test(screen));
  ok('transisi memakai native driver (hemat JS thread)', /useNativeDriver: true/.test(screen));

  const kit = read('src/ui/kit.tsx');
  ok('Chip memakai minHeight (tahan skala huruf besar)', /minHeight: sizes\.chip/.test(kit));
  ok('judul baris boleh 2 baris saat huruf diperbesar', /numberOfLines=\{2\} style=\{\{ color: danger/.test(kit));

  const omnibox = read('src/browser/Omnibox.tsx');
  ok('tombol hapus teks 48dp (target sentuh)', /width: sizes\.touchTarget,\s*\n\s*height: sizes\.touchTarget/.test(omnibox));
}

// ------------------------------------------------------- 5. versi rilis
group('5. Versi & berkas rilis');
{
  const gradle = read('android/app/build.gradle');
  ok('versionName 0.7.0', /versionName "0\.7\.0"/.test(gradle));
  ok('versionCode 21 (naik dari 20)', /versionCode 21/.test(gradle));
  const about = read('src/screens/AboutScreen.tsx');
  ok('AboutScreen menampilkan v0.7.0', /v0\.7\.0/.test(about));
  const ua = read('src/browser/TabView.tsx');
  ok('UA aplikasi menyebut Zenith/0.7.0', /Zenith\/0\.7\.0 zp:/.test(ua));
  ok('dokumen rilis v0.7.0 ada', fs.existsSync(path.join(ROOT, 'RELEASE-v0.7.0.md')));
}

mods.cleanup();

console.log(`\n=================================\n${pass} pemeriksaan lulus, ${failures.length} gagal`);
if (failures.length) {
  console.log('\nGagal:');
  failures.forEach((f) => console.log(` - ${f}`));
  process.exit(1);
}
console.log('Semua fitur v0.7.0 terverifikasi.');
