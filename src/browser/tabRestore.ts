/**
 * Sumber WebView selama proses pemulihan histori tab.
 *
 * Dua URL sentinel di bawah SENGAJA diawali "zenith:" dan "about:blank"
 * karena `ZenithWebViewManager.setNewSource` melewatkannya tanpa memuat apa
 * pun (lihat catatan kelas di manager). Artinya: memasang sentinel tidak
 * pernah memicu pemuatan, sehingga pemulihan histori tidak bisa berkelahi
 * dengan alur pemuatan normal — akar bug "tab aktif refresh terus" yang
 * sudah diperbaiki di v0.5.2 tetap aman.
 *
 * Fungsi di bawah murni (tanpa impor) supaya bisa diuji `eval/`.
 */

/** Placeholder selama native memulihkan histori (tidak memuat apa pun). */
export const RESTORE_PLACEHOLDER = 'zenith:restoring';

/** Ditahan setelah pemulihan berhasil — halaman hasil pemulihan dibiarkan. */
export const RESTORED_URI = 'zenith:restored';

/**
 * URL sumber yang harus dipasang ke WebView.
 *  - `restored` true  → sentinel (halaman hasil restore tetap hidup),
 *  - `restored` false → URL tab seperti biasa (perilaku lama).
 */
export function restoreSourceUri(restored: boolean, initialUrl: string): string {
  return restored ? RESTORED_URI : initialUrl;
}

/**
 * Perlukah mencoba pemulihan? Tidak, bila pengguna sudah meminta halaman
 * lain (navigasi yang diklaim menang atas pemulihan histori).
 */
export function shouldAttemptRestore(pendingUrl: string | null | undefined, tabId: string | null): boolean {
  if (!tabId) {
    return false;
  }
  return !pendingUrl;
}
