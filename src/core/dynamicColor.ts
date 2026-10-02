/**
 * Palet dinamis Material You (Android 12+) untuk Zenith.
 *
 * Rujukan resmi: developer.android.com/develop/ui/views/theming/dynamic-colors
 *  — warna diambil dari wallpaper lewat `DynamicColors` (sisi native:
 *    ZenithDynamicColor.kt), lalu dikirim ke JS sebagai peran Material 3.
 *
 * Kontrak:
 *  · `setDynamicColorEnabled()` — dipanggil AppShell sesuai setelan pengguna.
 *  · `noteScheme()`             — dipanggil `useTheme()` saat mode terang/gelap
 *                                 berubah, supaya palet mode itu ikut diambil.
 *  · `useDynamicRevision()`     — hook kecil agar perubahan palet memicu
 *                                 render ulang komponen yang memakai tema.
 *
 * Zap: bila perangkat tidak mendukung (Android < 12 / tanpa Material You),
 * native mengembalikan null dan Zenith memakai token warnanya sendiri.
 */

import { useState, useEffect } from 'react';
import { dynamicColors } from './native';

/** Peran M3 yang boleh ditimpa wallpaper. Sisanya token Zenith (kontras aman). */
export const DYNAMIC_ROLES = [
  'primary',
  'onPrimary',
  'primaryContainer',
  'onPrimaryContainer',
  'secondary',
  'onSecondary',
  'secondaryContainer',
  'onSecondaryContainer',
  'tertiary',
  'onTertiary',
  'surfaceVariant',
  'onSurfaceVariant',
] as const;

export type DynamicRole = (typeof DYNAMIC_ROLES)[number];
export type DynamicPatch = Partial<Record<DynamicRole, string>> & { inversePrimary?: string };

let enabled = false;
let requested: 'light' | 'dark' | null = null;
let revision = 0;
let unsupported = false;
let inflight: Promise<void> | null = null;
const cache: { light: DynamicPatch | null; dark: DynamicPatch | null } = { light: null, dark: null };
const listeners = new Set<() => void>();

function notify() {
  revision += 1;
  listeners.forEach((fn) => fn());
}

export function subscribeDynamicColor(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function dynamicRevision(): number {
  return revision;
}

/** Hook: angka yang berubah setiap palet baru datang. */
export function useDynamicRevision(): number {
  const [rev, setRev] = useState(revision);
  useEffect(() => subscribeDynamicColor(() => setRev(dynamicRevision())), []);
  return rev;
}

/** Setelan pengguna "Warna dinamis (Material You)". */
export function setDynamicColorEnabled(next: boolean) {
  if (next === enabled) {
    return;
  }
  enabled = next;
  if (!enabled) {
    cache.light = null;
    cache.dark = null;
    notify();
    return;
  }
  void refresh();
}

export function isDynamicColorEnabled(): boolean {
  return enabled;
}

/** Dipanggil useTheme(): pastikan palet untuk mode yang sedang dipakai ada. */
export function noteScheme(mode: 'light' | 'dark') {
  requested = mode;
  if (!enabled || unsupported || cache[mode]) {
    return;
  }
  void refresh();
}

export function dynamicPatch(mode: 'light' | 'dark'): DynamicPatch | null {
  return enabled ? cache[mode] : null;
}

/** Mengambil palet dari native (native yang menghitung, JS yang memetakan). */
export async function refresh(): Promise<void> {
  if (!enabled || inflight) {
    return inflight ?? undefined;
  }
  const modes: ('light' | 'dark')[] = requested ? [requested] : ['light', 'dark'];
  inflight = (async () => {
    let changed = false;
    for (const mode of modes) {
      const raw = await dynamicColors(mode);
      if (!raw) {
        unsupported = true;
        continue;
      }
      const patch: DynamicPatch = {};
      for (const role of DYNAMIC_ROLES) {
        const value = raw[role];
        if (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)) {
          patch[role] = value;
        }
      }
      if (Object.keys(patch).length === 0) {
        unsupported = true;
        continue;
      }
      // inversePrimary = primary skema sebaliknya (definisi M3) — dipakai
      // Snackbar/permukaan terbalik agar kontras tetap benar.
      const other = cache[mode === 'dark' ? 'light' : 'dark'];
      patch.inversePrimary = other?.primary ?? (mode === 'dark' ? '#6750A4' : '#D0BCFF');
      cache[mode] = patch;
      changed = true;
      // Palet mode lain sekalian diambil agar pergantian tema tidak berkedip.
      if (!requested) {
        break;
      }
    }
    if (changed) {
      notify();
    } else if (unsupported) {
      // tidak ada yang berubah, tapi listener tetap perlu tahu (fitur mati)
      cache.light = null;
      cache.dark = null;
    }
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}

/** Untuk pengujian/log: apakah perangkat mendukung warna dinamis. */
export function dynamicColorSupported(): boolean {
  return !unsupported;
}
