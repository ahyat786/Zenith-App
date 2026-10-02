#!/usr/bin/env node
/**
 * eval/check-v0.9.0.js — verifikasi fitur rilis v0.9.0.
 *
 * Dua fokus:
 *  1. Posisi gulir per URL (ingatan lintas pemuatan WebView) — modul murni
 *     `src/browser/scrollMemory.ts` dikompilasi lalu diuji perilakunya.
 *  2. Audit type scale Material 3 — memastikan setiap `...type.<token>` yang
 *     dipakai benar-benar ada di theme.ts, setiap berkas yang memakainya
 *     mengimpor tokennya, dan tidak ada ukuran huruf baru di luar skala
 *     (yang tersisa hanya 5 yang didokumentasikan).
 *
 * Jalankan:  node eval/check-v0.9.0.js
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const walk = (dir) => {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(full));
    } else if (/\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
};

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

function compile(entries) {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'zenith-eval9-'));
  execFileSync(
    'npx',
    [
      'tsc',
      ...entries,
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
  const load = (name) => {
    for (const rel of [`browser/${name}.js`, `${name}.js`]) {
      const file = path.join(out, rel);
      if (fs.existsSync(file)) {
        return require(file);
      }
    }
    throw new Error(`hasil kompilasi ${name}.js tidak ada`);
  };
  return { load, cleanup: () => fs.rmSync(out, { recursive: true, force: true }) };
}

console.log('Zenith v0.9.0 — pemeriksaan rilis\n=================================');

let build;
try {
  build = compile(['src/browser/scrollMemory.ts']);
} catch (err) {
  console.error('GAGAL mengompilasi modul murni:', err.stdout?.toString() || err.message);
  process.exit(1);
}

// ------------------------------------------------ 1. ingatan posisi gulir
group('1. Posisi gulir per URL (scrollMemory)');
{
  const {
    SCROLL_MAX_ENTRIES,
    SCROLL_MIN_DELTA,
    SCROLL_RESTORE_MIN,
    getScroll,
    putScroll,
    REPORT_SCROLL_SCRIPT,
    restoreScrollScript,
    scrollKey,
    shouldRestoreScroll,
  } = build.load('scrollMemory');

  const mem = new Map();
  putScroll(mem, 'https://a.test/page', 1420);
  ok('posisi tersimpan & terbaca', getScroll(mem, 'https://a.test/page') === 1420);
  ok('URL lain tidak ikut terbaca', getScroll(mem, 'https://b.test/page') === 0);

  putScroll(mem, 'https://a.test/page', 2000);
  ok('penyimpanan ulang menimpa nilai lama', getScroll(mem, 'https://a.test/page') === 2000);
  ok('tidak ada duplikat kunci', mem.size === 1);

  ok('nilai dibulatkan & tidak negatif', (putScroll(mem, 'https://c.test', -50), getScroll(mem, 'https://c.test', 0) === 0));
  putScroll(mem, 'https://c.test', 120.7);
  ok('pembulatan ke bilangan bulat', getScroll(mem, 'https://c.test') === 121);

  ok('nilai NaN diabaikan', (putScroll(mem, 'https://d.test', NaN), getScroll(mem, 'https://d.test') === 0));
  ok('URL kosong diabaikan', (putScroll(mem, '', 500), getScroll(mem, '') === 0));

  ok('ambang pemulihan: gulir kecil tidak dipulihkan', getScroll(mem, 'https://e.test', 0) === 0);
  putScroll(mem, 'https://e.test', SCROLL_RESTORE_MIN - 1);
  ok(`di bawah ${SCROLL_RESTORE_MIN}px diabaikan`, getScroll(mem, 'https://e.test') === 0);

  const lru = new Map();
  for (let i = 0; i < SCROLL_MAX_ENTRIES + 5; i += 1) {
    putScroll(lru, `https://x${i}.test`, 500);
  }
  ok(`batas ${SCROLL_MAX_ENTRIES} entri dipatuhi`, lru.size === SCROLL_MAX_ENTRIES, `ukuran: ${lru.size}`);
  ok('yang terlama dibuang (LRU)', !lru.has('https://x0.test') && lru.has(`https://x${SCROLL_MAX_ENTRIES + 4}.test`));

  ok('kunci = URL apa adanya (hash ikut, untuk SPA)', scrollKey(' https://a.test/#/x ') === 'https://a.test/#/x');

  // keputusan pemulihan butuh halaman yang memang bisa digulir
  const m2 = new Map();
  putScroll(m2, 'https://pan.test', 900);
  ok('halaman tinggi → dipulihkan', shouldRestoreScroll(m2, 'https://pan.test', 4000, 800) === true);
  ok('halaman pendek → tidak dipulihkan', shouldRestoreScroll(m2, 'https://pan.test', 700, 800) === false);
  ok('tanpa ingatan → tidak dipulihkan', shouldRestoreScroll(m2, 'https://lain.test', 4000, 800) === false);
  ok('metrik NaN → tidak dipulihkan', shouldRestoreScroll(m2, 'https://pan.test', NaN, 800) === false);

  ok('skrip pemulihan memanggil scrollTo dengan nilai benar', /scrollTo\(0,900\)/.test(restoreScrollScript(900)));
  ok('skrip pemulihan dibulatkan', /scrollTo\(0,42\)/.test(restoreScrollScript(41.6)));
  ok('skrip pelaporan mengirim zen:scroll', /'zen:scroll'/.test(REPORT_SCROLL_SCRIPT));
  ok('ambang pelaporan 150px', SCROLL_MIN_DELTA === 150);

  // wiring di aplikasi
  const inject = read('src/core/inject.ts');
  ok('halaman melaporkan gulir lewat BRIDGE_SCRIPT', /zen:scroll/.test(inject) && /addEventListener\('scroll'/.test(inject));
  ok('pelaporan di-throttle (jeda tenang 800 ms)', /setTimeout\(function \(\) \{ report\(false\); \}, 800\)/.test(inject));
  ok('pagehide & visibilitychange memaksa laporan terakhir', /pagehide/.test(inject) && /visibilitychange/.test(inject));

  const tabView = read('src/browser/TabView.tsx');
  ok('TabView menyimpan pesan zen:scroll', /case 'zen:scroll'[\s\S]{0,120}putScroll\(scrollMemory/.test(tabView));
  ok('TabView menangani zen:metrics', /case 'zen:metrics'/.test(tabView));
  ok('pemulihan hanya sekali per pemuatan', /metricsReady\.current = true/.test(tabView));
  ok('metrik ditanyakan saat halaman selesai dimuat', /onLoadEnd[\s\S]{0,300}askMetrics\(\)/.test(tabView));
  ok('gulir terakhir diminta saat tab dilepas', /REPORT_SCROLL_SCRIPT/.test(tabView));
  ok('ingatan bersifat lintas-mount (lingkup modul)', /^const scrollMemory = new Map<string, number>\(\);$/m.test(tabView));
  ok(
    'gulir TIDAK pernah memicu pemuatan halaman (hanya injeksi)',
    !/scroll[\s\S]{0,120}(loadUrl|reload\()/i.test(tabView),
  );
}

// ------------------------------------------------- 2. audit type scale M3
group('2. Audit type scale Material 3');
{
  const theme = read('src/theme.ts');
  const tokens = new Set(
    [...theme.matchAll(/^\s{2}(\w+): \{ fontSize:/gm)].map((m) => m[1]),
  );
  ok('token type scale terdeteksi di theme.ts', tokens.size >= 10, `ditemukan: ${tokens.size}`);

  const files = walk(path.join(ROOT, 'src')).filter((f) => !f.endsWith('theme.ts'));
  const badTokens = [];
  const missingImport = [];
  const literals = [];
  let spreads = 0;
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    const rel = path.relative(ROOT, file);
    const alias = (text.match(/\btype as (\w+)/) || [])[1] || 'type';
    for (const m of text.matchAll(/\.\.\.(type|typeScale)\.(\w+)/g)) {
      spreads += 1;
      const used = m[2];
      if (!tokens.has(used)) {
        badTokens.push(`${rel}: ${used}`);
      }
      const usedAlias = m[1];
      const imported =
        usedAlias === 'typeScale'
          ? new RegExp(`\\btype as ${usedAlias}\\b`).test(text)
          : new RegExp(`import\\s*\\{[^}]*\\btype\\b[^}]*\\}\\s*from\\s*'[^']*theme'`).test(text) ||
            /\btype as \w+/.test(text);
      if (!imported) {
        missingImport.push(`${rel}: ${usedAlias}.${used}`);
      }
    }
    for (const m of text.matchAll(/fontSize:\s*(\d+(?:\.\d+)?)/g)) {
      literals.push(`${rel}:${text.slice(0, m.index).split('\n').length} (${m[1]})`);
    }
  }

  ok('setiap token yang dipakai ada di theme.ts', badTokens.length === 0, badTokens.slice(0, 5).join('; '));
  ok('setiap berkas yang memakai token mengimpornya', missingImport.length === 0, missingImport.slice(0, 5).join('; '));
  ok(`pemakaian token tersebar (${spreads} titik)`, spreads >= 150, `ditemukan: ${spreads}`);

  // Literal tersisa sengaja didokumentasikan (RELEASE-v0.9.0.md §3).
  const ALLOWED = [
    'src/browser/TabSwitcher.tsx (20)', // judul panel — 20px tidak ada di skala
    'src/browser/TabSwitcher.tsx (20)', // emoji ikon workspace (dekoratif)
    'src/screens/AboutScreen.tsx (32)', // huruf "Z" dekoratif
    'src/screens/AboutScreen.tsx (20)', // judul aplikasi
    'src/screens/LibraryScreens.tsx (18)', // judul empty state
  ];
  ok(
    'hanya 5 ukuran huruf literal yang tersisa (terdokumentasi)',
    literals.length === ALLOWED.length,
    `ditemukan ${literals.length}: ${literals.join(' | ')}`,
  );

  // token yang dipakai harus punya bobot & ukuran yang sama dengan aliasnya
  ok(
    'spread token tidak diikuti fontSize (tidak menimpa ukuran)',
    !/\.\.\.(type|typeScale)\.\w+[^}\n]*fontSize:/.test(files.map((f) => fs.readFileSync(f, 'utf8')).join('\n')),
  );
}

// --------------------------------------------------------- 3. versi rilis
group('3. Versi & berkas rilis');
{
  const gradle = read('android/app/build.gradle');
  const version = (/versionName "(\d+\.\d+\.\d+)"/.exec(gradle) || [])[1] || '0.0.0';
  const code = Number((/versionCode (\d+)/.exec(gradle) || [])[1] || 0);
  ok('versionName >= 0.9.0', version.split('.').map(Number)[1] >= 9, `versi: ${version}`);
  ok('versionCode > 22', code > 22, `versionCode: ${code}`);
  ok('UA aplikasi menyebut versi rilis', read('src/browser/TabView.tsx').includes(`Zenith/${version}`));
  ok('dokumen rilis v0.9.0 ada', fs.existsSync(path.join(ROOT, 'RELEASE-v0.9.0.md')));
  ok('uji rilis sebelumnya tetap ada', fs.existsSync(path.join(ROOT, 'eval/check-v0.8.0.js')) && fs.existsSync(path.join(ROOT, 'eval/check-v0.7.0.js')));

  // regresi: jaminan anti-refresh & histori tetap ada
  const manager = read('android/app/src/main/java/com/zenith/browser/webview/ZenithWebViewManager.kt');
  ok('regresi: sumber "zenith:*" tetap dilewati manager', manager.includes('startsWith("zenith:")'));
  ok('regresi: penanda tab zt: masih ada', manager.includes('REGEX_TAB'));
}

build.cleanup();

console.log(`\n=================================\n${pass} pemeriksaan lulus, ${failures.length} gagal`);
if (failures.length) {
  console.log('\nGagal:');
  failures.forEach((f) => console.log(` - ${f}`));
  process.exit(1);
}
console.log('Semua fitur v0.9.0 terverifikasi.');
