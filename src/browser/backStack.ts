/**
 * Tumpukan tombol kembali Android.
 * Layar dan sheet mendaftar di sini supaya BackHandler di BrowserScreen
 * menutup UI Zenith dulu, bukan tab.
 */

import { useEffect } from 'react';

type Handler = () => boolean;

const stack: Handler[] = [];
let handledAt = 0;

/** Menu/sheet sudah menutup back ini. Jangan biarkan peristiwa kedua menutup aplikasi. */
export function noteBackHandled(): void {
  handledAt = Date.now();
}

export function wasBackJustHandled(windowMs = 700): boolean {
  return Date.now() - handledAt < windowMs;
}

export function consumeHardwareBack(): boolean {
  for (let i = stack.length - 1; i >= 0; i--) {
    try {
      if (stack[i]()) {
        noteBackHandled();
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
