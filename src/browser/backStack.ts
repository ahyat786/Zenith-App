/**
 * Tumpukan tombol kembali Android.
 * Layar dan sheet mendaftar di sini supaya BackHandler di BrowserScreen
 * menutup UI Zenith dulu, bukan tab.
 */

import { useEffect } from 'react';

type Handler = () => boolean;

const stack: Handler[] = [];

export function consumeHardwareBack(): boolean {
  for (let i = stack.length - 1; i >= 0; i--) {
    try {
      if (stack[i]()) {
        return true;
      }
    } catch {
      // handler yang gagal tidak boleh menjatuhkan tab
    }
  }
  return false;
}

export function pushHardwareBack(handler: Handler): () => void {
  stack.push(handler);
  return () => {
    const i = stack.lastIndexOf(handler);
    if (i >= 0) {
      stack.splice(i, 1);
    }
  };
}

/** `enabled` false melepas handler. Handler baru tiap render tetap aman. */
export function useHardwareBack(enabled: boolean, handler: Handler) {
  useEffect(() => {
    if (!enabled) {
      return;
    }
    return pushHardwareBack(handler);
  }, [enabled, handler]);
}
