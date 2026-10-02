/**
 * Bilah sistem (status bar, navigation bar) + inset IME.
 *
 * Rujukan resmi:
 *  - Edge-to-edge & system bars: https://developer.android.com/design/ui/mobile/guides/foundations/system-bars
 *  - Perubahan konfigurasi IME / WindowInsets: https://developer.android.com/develop/ui/views/layout/edge-to-edge
 *
 * Sejak Android 15 (targetSdk 35+) aplikasi WAJIB edge-to-edge dan
 * `windowSoftInputMode="adjustResize"` tidak lagi mengubah ukuran jendela.
 * Karena itu Zenith membaca inset keyboard dari sisi native lalu memakai
 * tingginya untuk mendorong panel/bilah agar tidak tertutup keyboard.
 */

import { DeviceEventEmitter, NativeModules } from 'react-native';
import { useEffect, useState } from 'react';

interface ZenithCoreSystemUi {
  setBarsAppearance(lightStatusBar: boolean, lightNavBar: boolean): Promise<boolean>;
  enableSystemUiTracking(): Promise<boolean>;
  imeInset(): Promise<number>;
  setNightMode(mode: 'dark' | 'light' | 'system'): Promise<boolean>;
}

const ZC = NativeModules.ZenithCore as ZenithCoreSystemUi | undefined;

/** Warna ikon bilah sistem mengikuti tema aplikasi (terang ↔ gelap). */
export function setBarsAppearance(dark: boolean): void {
  try {
    ZC?.setBarsAppearance(!dark, !dark);
  } catch {
    // modul tidak tersedia — StatusBar JS tetap dipakai
  }
}

/**
 * Selaraskan tema Android dengan tema aplikasi.
 * Dibutuhkan agar `prefers-color-scheme` di halaman web mengikuti tema
 * Zenith (bukan hanya setelan sistem).
 */
export function setNightMode(mode: 'dark' | 'light' | 'system'): void {
  try {
    ZC?.setNightMode(mode);
  } catch {
    // abaikan
  }
}

/** Memulai pelacakan inset keyboard (sekali per sesi). */
let tracking = false;
export function enableSystemUiTracking(): void {
  if (tracking) {
    return;
  }
  tracking = true;
  try {
    ZC?.enableSystemUiTracking();
  } catch {
    tracking = false;
  }
}

/** Tinggi keyboard (dp) yang sedang terlihat. */
export function useImeInset(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    enableSystemUiTracking();
    let cancelled = false;
    try {
      ZC?.imeInset().then((h) => {
        if (!cancelled && typeof h === 'number' && h >= 0) {
          setHeight(h);
        }
      });
    } catch {
      // abaikan
    }
    const sub = DeviceEventEmitter.addListener('ZenithImeInsets', (e: { height?: number }) => {
      const h = typeof e?.height === 'number' ? e.height : 0;
      setHeight(h > 0 ? h : 0);
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);
  return height;
}
