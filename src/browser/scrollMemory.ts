/**
 * Ingatan posisi gulir per URL.
 *
 * Mengapa perlu: WebView sudah mempertahankan gulir saat maju/mundur di dalam
 * riwayatnya sendiri, tetapi TIDAK saat WebView-nya dibangun ulang — misalnya
 * tab yang dilepas oleh keep-alive lalu dibuka lagi, pemulihan setelah proses
 * dibunuh, atau halaman yang dimuat ulang. Di situ pengguna dikembalikan ke
 * awal halaman.
 *
 * Cara kerjanya (dua sisi):
 *  · sisi halaman — BRIDGE_SCRIPT melaporkan posisi gulir (di-throttle: hanya
 *    bila bergeser ≥ 150 px, atau 800 ms sesudah berhenti menggulir) lewat
 *    kanal pesan `zen:scroll` yang sudah ada;
 *  · sisi Zenith — posisi disimpan per URL di memori sesi ini, lalu dipulihkan
 *    sekali saat URL itu dimuat kembali.
 *
 * Semua fungsi di bawah murni (tanpa impor) supaya bisa diuji `eval/`.
 */

/** Batas jumlah URL yang diingat (yang terlama dipakai dibuang). */
export const SCROLL_MAX_ENTRIES = 200;

/** Pergeseran minimum sebelum halaman melapor lagi (px). */
export const SCROLL_MIN_DELTA = 150;

/** Jeda tenang sebelum halaman melapor (ms). */
export const SCROLL_IDLE_MS = 800;

/** Di bawah nilai ini, pemulihan tidak ada gunanya. */
export const SCROLL_RESTORE_MIN = 80;

/** Kunci ingatan: URL seperti adanya (hash ikut, karena SPA memakainya). */
export function scrollKey(url: string): string {
  return (url || '').trim();
}

/**
 * Simpan posisi gulir untuk sebuah URL.
 * Memakai semantik Map (urutan penyisipan) sebagai LRU sederhana.
 */
export function putScroll(memory: Map<string, number>, url: string, y: number, limit = SCROLL_MAX_ENTRIES): void {
  const key = scrollKey(url);
  if (!key || !Number.isFinite(y)) {
    return;
  }
  const value = Math.max(0, Math.round(y));
  if (memory.has(key)) {
    memory.delete(key);
  }
  memory.set(key, value);
  while (memory.size > limit) {
    const oldest = memory.keys().next();
    if (oldest.done) {
      break;
    }
    memory.delete(oldest.value);
  }
}

/** Ambil posisi gulir tersimpan (tanpa menghapus). */
export function getScroll(memory: Map<string, number>, url: string, min = SCROLL_RESTORE_MIN): number {
  const value = memory.get(scrollKey(url));
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }
  return value >= min ? Math.round(value) : 0;
}

/**
 * Apakah pemulihan perlu dilakukan?
 *  - ada posisi tersimpan yang berarti, dan
 *  - halaman memang cukup tinggi untuk bisa digulir (dokumen > viewport).
 */
export function shouldRestoreScroll(
  memory: Map<string, number>,
  url: string,
  documentHeight: number,
  viewportHeight: number,
): boolean {
  const y = getScroll(memory, url);
  if (y <= 0) {
    return false;
  }
  if (!Number.isFinite(documentHeight) || !Number.isFinite(viewportHeight)) {
    return false;
  }
  // Toleransi 8px untuk pembulatan tata letak.
  return documentHeight > viewportHeight + 8;
}

/** Skrip satu kali untuk memulihkan gulir (dijalankan sesudah halaman siap). */
export function restoreScrollScript(y: number): string {
  const target = Math.max(0, Math.round(y));
  return `(function(){try{window.scrollTo(0,${target});}catch(e){}})();true;`;
}

/**
 * Skrip untuk MENANYAKAN posisi gulir sekarang — dipakai sebelum tab dilepas,
 * supaya ingatan tetap segar walau pengguna menggulir lalu langsung berpindah
 * tanpa menunggu jeda 800 ms.
 */
export const REPORT_SCROLL_SCRIPT =
  "(function(){try{var y=window.scrollY||document.documentElement.scrollTop||0;" +
  "if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(" +
  "JSON.stringify({type:'zen:scroll',y:y,url:location.href}));}catch(e){}})();true;";
