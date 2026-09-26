/**
 * Contoh bawaan: userscript (format Via/Greasy Fork) dan ekstensi
 * (manifest Chrome) untuk mencoba fitur tanpa unduhan.
 */

export interface ExampleScript {
  title: string;
  description: string;
  code: string;
}

export const EXAMPLE_SCRIPTS: ExampleScript[] = [
  {
    title: 'Selalu tampilkan scrollbar',
    description: 'Paksa scrollbar selalu terlihat di semua situs.',
    code: `// ==UserScript==
// @name        Selalu tampilkan scrollbar
// @namespace   id.zenith.contoh
// @version     1.0.0
// @description Paksa scrollbar selalu terlihat
// @match       *://*/*
// @run-at      document-start
// @grant       none
// ==/UserScript==
GM_addStyle('::-webkit-scrollbar { -webkit-appearance: none; width: 8px; } ::-webkit-scrollbar-thumb { background: rgba(128,128,160,.7); border-radius: 4px; } html { scrollbar-color: rgba(128,128,160,.7) transparent; }');
`,
  },
  {
    title: 'Tandai tautan eksternal',
    description: 'Tambahkan ikon ↗ pada tautan yang menuju situs lain.',
    code: `// ==UserScript==
// @name        Tandai tautan eksternal
// @namespace   id.zenith.contoh
// @version     1.0.0
// @description Tambah panah kecil pada tautan eksternal
// @match       *://*/*
// @run-at      document-end
// @grant       none
// ==/UserScript==
(function () {
  var host = location.hostname;
  var links = document.querySelectorAll('a[href^="http"]');
  for (var i = 0; i < links.length; i++) {
    try {
      if (new URL(links[i].href).hostname !== host) {
        links[i].insertAdjacentHTML('beforeend', ' <small style="opacity:.55;font-size:.75em">↗</small>');
      }
    } catch (e) {}
  }
})();
`,
  },
  {
    title: 'Pembaca tenang (warna lembut)',
    description: 'Ubah latar teks artikel jadi krem lembut di Wikipedia.',
    code: `// ==UserScript==
// @name        Pembaca tenang untuk Wikipedia
// @namespace   id.zenith.contoh
// @version     1.1.0
// @description Latar krem lembut untuk membaca Wikipedia
// @match       *://*.wikipedia.org/*
// @run-at      document-start
// @grant       none
// ==/UserScript==
GM_addStyle('body { background: #f6efe2 !important; color: #2d2a24 !important; } #content, .mw-body { background: #fbf6ec !important; } a { color: #6b4e2e !important; }');
`,
  },
];

export interface ExampleExtension {
  title: string;
  description: string;
  manifest: string;
  files: Record<string, string>;
}

export const EXAMPLE_EXTENSIONS: ExampleExtension[] = [
  {
    title: 'Darkify Ringan',
    description: 'Ekstensi Chrome MV3 contoh: filter gelap sederhana untuk semua situs.',
    manifest: JSON.stringify(
      {
        manifest_version: 3,
        name: 'Darkify Ringan',
        version: '1.0.0',
        description: 'Filter gelap sederhana (contoh ekstensi Zenith)',
        permissions: ['storage'],
        host_permissions: ['<all_urls>'],
        content_scripts: [
          {
            matches: ['*://*/*'],
            js: ['darkify.js'],
            css: ['darkify.css'],
            run_at: 'document_start',
          },
        ],
      },
      null,
      2,
    ),
    files: {
      'darkify.js':
        '// Darkify Ringan — konten skrip contoh\nconsole.log("[Zenith] Darkify aktif di", location.host);\n',
      'darkify.css':
        'html { filter: invert(0.92) hue-rotate(180deg); background: #101014; }\nimg, video, picture, canvas, svg { filter: invert(1) hue-rotate(180deg); }\n',
    },
  },
];
