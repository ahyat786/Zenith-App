/**
 * Tab yang WebView-nya tetap hidup ("keep-alive").
 *
 * Panduan resmi WebView (developer.android.com/develop/ui/views/layout/
 * webapps/webview → mengelola memori): pakai ulang instance, jangan menahan
 * terlalu banyak WebView sekaligus. Zenith menahan tab aktif + tab terakhir
 * yang dipakai (LRU) hingga batas `KEEP_ALIVE_TABS`, lalu melepas sisanya
 * (native memanggil stopLoading() + onPause() di onDropViewInstance).
 *
 * Fungsi di bawah sengaja murni (tanpa impor) agar bisa diuji oleh
 * `eval/check-v0.7.0.js`.
 */

export const KEEP_ALIVE_TABS = 3;

export interface KeepAliveTab {
  id: string;
  lastActiveAt?: number;
}

/**
 * Daftar id WebView yang dipertahankan.
 *  - tab aktif selalu masuk (wajib),
 *  - tab split ikut (keduanya terlihat),
 *  - sisanya diisi dari yang paling baru dipakai,
 *  - urutan mengikuti prioritas (aktif dulu), bukan urutan tab,
 *  - tidak ada duplikat dan tidak lebih dari `limit`.
 */
export function aliveWebViewIds(
  tabs: KeepAliveTab[],
  activeTabId: string | null | undefined,
  splitIds: string[] = [],
  limit: number = KEEP_ALIVE_TABS,
): string[] {
  const keep: string[] = [];
  const add = (id?: string | null) => {
    if (id && !keep.includes(id)) {
      keep.push(id);
    }
  };
  add(activeTabId);
  splitIds.forEach(add);
  const byRecency = [...tabs].sort((a, b) => (b.lastActiveAt ?? 0) - (a.lastActiveAt ?? 0));
  for (const t of byRecency) {
    if (keep.length >= limit) {
      break;
    }
    add(t.id);
  }
  return keep;
}
