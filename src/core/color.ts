/**
 * Utilitas warna kecil — murni (tanpa React Native) supaya bisa diuji
 * langsung oleh skrip `eval/`.
 */

/** Warna peran apa pun dengan opasitas alfa (0–1). */
export function withAlpha(color: string, alpha: number): string {
  const hex = color.trim();
  if (!/^#[0-9a-f]{6}$/i.test(hex)) {
    return color;
  }
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${a}`;
}
