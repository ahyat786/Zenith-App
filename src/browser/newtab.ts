/** URL internal laman tab baru. Bukan halaman web — tidak dimuat di WebView. */
export const NEW_TAB_URL = 'zenith://newtab';

export function isNewTabUrl(url?: string | null): boolean {
  if (!url) {
    return true;
  }
  return url === NEW_TAB_URL || url === 'about:blank' || url === 'about:newtab';
}

/** Halaman mati yang tidak boleh menimpa URL tab yang tersimpan. */
export function isBlankWebUrl(url?: string | null): boolean {
  if (!url) {
    return true;
  }
  const u = url.trim().toLowerCase();
  return (
    !u ||
    u === 'about:blank' ||
    u.startsWith('about:') ||
    u.startsWith('chrome-error:') ||
    u.startsWith('chrome://') ||
    u === 'data:,' ||
    u.startsWith('data:text/html,')
  );
}
