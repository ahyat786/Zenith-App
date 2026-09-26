/**
 * Unduhan cepat — jembatan ke ZenithDownloads (Kotlin).
 * Multi-thread (4 koneksi paralel + Range requests) untuk unduhan
 * secepat mungkin; jatuh mulus bila modul native tidak tersedia.
 */

import { NativeEventEmitter, NativeModules } from 'react-native';

interface ZenithDownloadsNative {
  start(url: string, filename: string | null, mime: string | null, connections: number): Promise<string>;
  cancel(id: string): Promise<boolean>;
  list(): Promise<DownloadJob[]>;
  open(id: string): Promise<boolean>;
  share(id: string): Promise<boolean>;
  remove(id: string): Promise<boolean>;
  setEnabled(enabled: boolean): Promise<void>;
  addListener(event: string): void;
  removeListeners(count: number): void;
}

const D = NativeModules.ZenithDownloads as ZenithDownloadsNative | undefined;
export const downloadsAvailable = !!D;

export type DownloadStatus = 'connecting' | 'downloading' | 'done' | 'canceled' | 'error';

export interface DownloadJob {
  id: string;
  url: string;
  filename: string;
  path: string;
  total: number; // -1 bila tidak diketahui
  done: number;
  speed: number; // byte/detik
  status: DownloadStatus;
  error?: string;
}

export async function startDownload(
  url: string,
  filename?: string,
  mime?: string,
  connections = 4,
): Promise<string | null> {
  if (!D) {
    return null;
  }
  try {
    return await D.start(url, filename ?? null, mime ?? null, connections);
  } catch {
    return null;
  }
}

export async function cancelDownload(id: string): Promise<void> {
  try {
    await D?.cancel(id);
  } catch {
    // diabaikan
  }
}

export async function listDownloads(): Promise<DownloadJob[]> {
  if (!D) {
    return [];
  }
  try {
    return await D.list();
  } catch {
    return [];
  }
}

export async function openDownload(id: string): Promise<void> {
  try {
    await D?.open(id);
  } catch {
    // diabaikan
  }
}

export async function shareDownload(id: string): Promise<void> {
  try {
    await D?.share(id);
  } catch {
    // diabaikan
  }
}

export async function removeDownload(id: string): Promise<void> {
  try {
    await D?.remove(id);
  } catch {
    // diabaikan
  }
}

export async function setFastDownloadsEnabled(enabled: boolean): Promise<void> {
  try {
    await D?.setEnabled(enabled);
  } catch {
    // diabaikan
  }
}

type DownloadListener = (job: DownloadJob) => void;

export function subscribeDownloads(cb: DownloadListener): () => void {
  if (!D) {
    return () => {};
  }
  const emitter = new NativeEventEmitter(D as any);
  const sub = emitter.addListener('ZenithDownloadProgress', cb as any);
  return () => sub.remove();
}
