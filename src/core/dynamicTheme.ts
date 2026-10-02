/**
 * Penggabungan token tema Zenith dengan palet wallpaper Material You.
 *
 * Dipisah dari theme.ts karena murni: tidak menyentuh React Native, sehingga
 * bisa dikompilasi & diuji langsung oleh `eval/check-v0.7.0.js`.
 *
 * Aturan:
 *  1. Peran Material 3 dari wallpaper menimpa nilai dasar (primary, container…).
 *  2. Alias lama ikut disesuaikan — kalau tidak, tombol yang masih memakai
 *     `accent`/`onAccent`/`accentSoft`/`subtext` akan tertinggal warna lama.
 *  3. Warna netral (bg/surface/bar) TIDAK diambil dari wallpaper: identitas
 *     Zenith dan kontras teks tetap terjaga di semua wallpaper.
 */

/** Peran M3 dari native (hanya yang boleh ditimpa wallpaper). */
export interface DynamicTokenPatch {
  [role: string]: string | undefined;
}

export interface BaseTokens {
  dark: boolean;
  accent: string;
  onAccent: string;
  accentSoft: string;
  subtext: string;
}

/** Opasitas state layer Zenith untuk accentSoft (gelap 16%, terang 12%). */
export const ACCENT_SOFT_ALPHA = { dark: 0.16, light: 0.12 };

export function mergeDynamicTokens<T extends BaseTokens>(
  base: T,
  patch: DynamicTokenPatch,
  alpha: (color: string, a: number) => string,
): T {
  const soft = patch.primary
    ? alpha(patch.primary, base.dark ? ACCENT_SOFT_ALPHA.dark : ACCENT_SOFT_ALPHA.light)
    : base.accentSoft;
  return {
    ...base,
    ...(patch as unknown as Partial<T>),
    accent: patch.primary ?? base.accent,
    onAccent: patch.onPrimary ?? base.onAccent,
    accentSoft: soft,
    subtext: patch.onSurfaceVariant ?? base.subtext,
  } as T;
}
