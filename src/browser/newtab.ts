/** URL internal laman tab baru. Bukan halaman web — tidak dimuat di WebView. */
export const NEW_TAB_URL = 'zenith://newtab';

export function isNewTabUrl(url?: string | null): boolean {
  if (!url) {
    return true;
  }
  return url === NEW_TAB_URL || url === 'about:blank' || url === 'about:newtab';
}
