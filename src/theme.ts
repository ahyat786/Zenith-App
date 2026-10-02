/**
 * Zenith — Token desain Material 3 (Material Design 3 / Material You).
 *
 * Rujukan resmi:
 *  - Android Design → UI Design → Styles (warna, jenis huruf, gerakan, tema)
 *    https://developer.android.com/design/ui/mobile/guides/styles/themes
 *  - Material 3 color roles / tone palette (primary, surface, surface container…)
 *  - Material 3 type scale, shape scale, elevation levels, state layers, motion
 *
 * Aturan yang dipakai Zenith:
 *  1. Warna memakai PERAN (role), bukan nilai acak. Nama lama (bg, surface,
 *     surface2, accent, …) tetap ada agar layar lama tidak perlu ditulis ulang,
 *     tetapi nilainya sekarang diambil dari peran Material 3.
 *  2. Bidang permukaan naik bertingkat: bg → surface → surface2 (surface
 *     container low → high). Bayangan hanya untuk elemen yang benar-benar
 *     mengapung (elevation token).
 *  3. Jarak selalu kelipatan 4dp; margin layar 16–24dp; target sentuh ≥ 48dp.
 *  4. Teks memakai type scale M3 (titleMedium untuk judul baris, bodyMedium
 *     untuk isi, labelLarge untuk tombol).
 */

import { useColorScheme } from 'react-native';

export interface Theme {
  dark: boolean;

  /* ---------- Peran Material 3 (dipakai komponen baru) ---------- */
  primary: string;
  onPrimary: string;
  primaryContainer: string;
  onPrimaryContainer: string;
  secondary: string;
  onSecondary: string;
  secondaryContainer: string;
  onSecondaryContainer: string;
  tertiary: string;
  onTertiary: string;
  errorContainer: string;
  onErrorContainer: string;
  /** permukaan halaman (scaffold) */
  surfaceContainerLowest: string;
  surfaceContainerLow: string;
  surfaceContainer: string;
  surfaceContainerHigh: string;
  surfaceContainerHighest: string;
  surfaceVariant: string;
  onSurface: string;
  onSurfaceVariant: string;
  outline: string;
  outlineVariant: string;
  scrim: string;
  inverseSurface: string;
  inverseOnSurface: string;

  /* ---------- Nama lama (dipetakan ke peran di atas) ---------- */
  bg: string;
  surface: string;
  surface2: string;
  border: string;
  text: string;
  subtext: string;
  accent: string;
  accentSoft: string;
  onAccent: string;
  danger: string;
  ok: string;
  warn: string;
  bar: string;
  overlay: string;
  pill: string;
}

/** Material 3 baseline — skema gelap. */
export const darkTheme: Theme = {
  dark: true,

  primary: '#D0BCFF',
  onPrimary: '#381E72',
  primaryContainer: '#4F378B',
  onPrimaryContainer: '#EADDFF',
  secondary: '#CCC2DC',
  onSecondary: '#332D41',
  secondaryContainer: '#4A4458',
  onSecondaryContainer: '#E8DEF8',
  tertiary: '#EFB8C8',
  onTertiary: '#492532',
  errorContainer: '#8C1D18',
  onErrorContainer: '#F9DEDC',
  surfaceContainerLowest: '#0F0D13',
  surfaceContainerLow: '#1D1B20',
  surfaceContainer: '#211F26',
  surfaceContainerHigh: '#2B2930',
  surfaceContainerHighest: '#36343B',
  surfaceVariant: '#49454F',
  onSurface: '#E6E0E9',
  onSurfaceVariant: '#CAC4D0',
  outline: '#938F99',
  outlineVariant: '#49454F',
  scrim: 'rgba(0,0,0,0.60)',
  inverseSurface: '#E6E0E9',
  inverseOnSurface: '#322F35',

  bg: '#141218',
  surface: '#211F26',
  surface2: '#2B2930',
  border: '#49454F',
  text: '#E6E0E9',
  subtext: '#CAC4D0',
  accent: '#D0BCFF',
  accentSoft: 'rgba(208,188,255,0.16)',
  onAccent: '#381E72',
  danger: '#F2B8B5',
  ok: '#7BD88F',
  warn: '#F5C06B',
  bar: '#1D1B20',
  overlay: 'rgba(0,0,0,0.60)',
  pill: '#2B2930',
};

/** Material 3 baseline — skema terang. */
export const lightTheme: Theme = {
  dark: false,

  primary: '#6750A4',
  onPrimary: '#FFFFFF',
  primaryContainer: '#EADDFF',
  onPrimaryContainer: '#21005D',
  secondary: '#625B71',
  onSecondary: '#FFFFFF',
  secondaryContainer: '#E8DEF8',
  onSecondaryContainer: '#1D192B',
  tertiary: '#7D5260',
  onTertiary: '#FFFFFF',
  errorContainer: '#F9DEDC',
  onErrorContainer: '#410E0B',
  surfaceContainerLowest: '#FFFFFF',
  surfaceContainerLow: '#F7F2FA',
  surfaceContainer: '#F3EDF7',
  surfaceContainerHigh: '#ECE6F0',
  surfaceContainerHighest: '#E6E0E9',
  surfaceVariant: '#E7E0EC',
  onSurface: '#1D1B20',
  onSurfaceVariant: '#49454F',
  outline: '#79747E',
  outlineVariant: '#CAC4D0',
  scrim: 'rgba(0,0,0,0.32)',
  inverseSurface: '#322F35',
  inverseOnSurface: '#F5EFF7',

  bg: '#FEF7FF',
  surface: '#F3EDF7',
  surface2: '#E6E0E9',
  border: '#CAC4D0',
  text: '#1D1B20',
  subtext: '#49454F',
  accent: '#6750A4',
  accentSoft: 'rgba(103,80,164,0.12)',
  onAccent: '#FFFFFF',
  danger: '#B3261E',
  ok: '#146C2E',
  warn: '#8A5A00',
  bar: '#F7F2FA',
  overlay: 'rgba(0,0,0,0.32)',
  pill: '#E7E0EC',
};

export type ThemePref = 'dark' | 'light' | 'system';

export function useTheme(pref: ThemePref): Theme {
  const scheme = useColorScheme();
  const light = pref === 'light' || (pref === 'system' && scheme === 'light');
  return light ? lightTheme : darkTheme;
}

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

/**
 * Lapisan status Material 3 — dipakai untuk ripple/tekanan.
 * hover 0.08 · focus 0.10 · pressed 0.10 (0.16 untuk permukaan terang)
 */
export const stateLayer = {
  hover: 0.08,
  focus: 0.1,
  pressed: 0.1,
  pressedStrong: 0.16,
  dragged: 0.16,
};

/** Elevation Material 3 (level → elevasi Android dalam dp). */
export const elevation = {
  level0: 0,
  level1: 1,
  level2: 3,
  level3: 6,
  level4: 8,
  level5: 12,
  /** alias lama */
  card: 1,
  sheet: 3,
  dialog: 6,
  fab: 6,
};

/** Bentuk Material 3: 4 · 8 · 12 · 16 · 28 · penuh. */
export const radius = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 28,
  pill: 999,
};

/** Jarak pada kisi 4dp Material. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

/** Target sentuh minimum Android (48dp) dan tinggi komponen standar. */
export const sizes = {
  touchTarget: 48,
  iconButton: 48,
  listItem: 56,
  textField: 56,
  chip: 32,
  appBar: 64,
  bottomBar: 56,
  fab: 56,
};

/** Jenis huruf Material 3 (type scale) untuk Android/Roboto. */
export const type = {
  displaySmall: { fontSize: 36, lineHeight: 44, fontWeight: '400' as const },
  headlineSmall: { fontSize: 24, lineHeight: 32, fontWeight: '400' as const },
  headlineMedium: { fontSize: 28, lineHeight: 36, fontWeight: '400' as const },
  titleLarge: { fontSize: 22, lineHeight: 28, fontWeight: '500' as const },
  titleMedium: { fontSize: 16, lineHeight: 24, letterSpacing: 0.15, fontWeight: '500' as const },
  titleSmall: { fontSize: 14, lineHeight: 20, letterSpacing: 0.1, fontWeight: '500' as const },
  bodyLarge: { fontSize: 16, lineHeight: 24, letterSpacing: 0.5, fontWeight: '400' as const },
  bodyMedium: { fontSize: 14, lineHeight: 20, letterSpacing: 0.25, fontWeight: '400' as const },
  bodySmall: { fontSize: 12, lineHeight: 16, letterSpacing: 0.4, fontWeight: '400' as const },
  labelLarge: { fontSize: 14, lineHeight: 20, letterSpacing: 0.1, fontWeight: '500' as const },
  labelMedium: { fontSize: 12, lineHeight: 16, letterSpacing: 0.5, fontWeight: '500' as const },
  labelSmall: { fontSize: 11, lineHeight: 16, letterSpacing: 0.5, fontWeight: '500' as const },
};

/** Gerakan Material 3 (durasi milidetik + kurva bezier). */
export const motion = {
  duration: {
    short1: 50,
    short2: 100,
    short3: 150,
    short4: 200,
    medium1: 250,
    medium2: 300,
    long1: 450,
    long2: 500,
  },
  easing: {
    standard: [0.2, 0, 0, 1] as const,
    decelerate: [0, 0, 0, 1] as const,
    accelerate: [0.3, 0, 1, 1] as const,
    emphasized: [0.2, 0, 0, 1] as const,
  },
};
