import { useColorScheme } from 'react-native';

export interface Theme {
  dark: boolean;
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

export const darkTheme: Theme = {
  dark: true,
  bg: '#0c0e13',
  surface: '#141821',
  surface2: '#1b2130',
  border: '#252c3d',
  text: '#e8ebf2',
  subtext: '#98a2b8',
  accent: '#8b7cf6',
  accentSoft: 'rgba(139,124,246,0.16)',
  onAccent: '#ffffff',
  danger: '#f87171',
  ok: '#4ade80',
  warn: '#fbbf24',
  bar: '#10131b',
  overlay: 'rgba(5,7,10,0.72)',
  pill: '#1a2030',
};

export const lightTheme: Theme = {
  dark: false,
  bg: '#f5f6fa',
  surface: '#ffffff',
  surface2: '#eef0f6',
  border: '#dde1ec',
  text: '#171a23',
  subtext: '#5f6b7c',
  accent: '#6d5ce7',
  accentSoft: 'rgba(109,92,231,0.12)',
  onAccent: '#ffffff',
  danger: '#dc2626',
  ok: '#16a34a',
  warn: '#d97706',
  bar: '#ffffff',
  overlay: 'rgba(20,22,30,0.45)',
  pill: '#e8eaf3',
};

export type ThemePref = 'dark' | 'light' | 'system';

export function useTheme(pref: ThemePref): Theme {
  const scheme = useColorScheme();
  const light = pref === 'light' || (pref === 'system' && scheme === 'light');
  return light ? lightTheme : darkTheme;
}

export const radius = { sm: 10, md: 14, lg: 20, pill: 999 };
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };
