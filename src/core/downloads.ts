/**
 * Unduhan cepat — jembatan ke ZenithDownloads (Kotlin).
 * Kecepatan penuh; koneksi paralel hanya bila server mendukung Range, paling banyak 4.
 */

import { NativeEventEmitter, NativeModules } from 'react-native';

interface ZenithDownloadsNative {
  start(url: string, filename: string | null, mime: string | null, connections: number): Promise<string>;
  cancel(id: string): Promise<boolean>;
  list(): Promise<DownloadJob[]>;
  open(id: string): Promise<boolean>;
  share(id: string): Promise<boolean>;
  remove(id: string, deleteFile: boolean): Promise<boolean>;
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
  mime?: string;
  total: number; // -1 bila tidak diketahui
  done: number;
  speed: number; // byte/detik
  finishedAt?: number;
  fileExists?: boolean;
  status: DownloadStatus;
  error?: string;
}

export type DownloadCategory = 'APK' | 'Gambar' | 'Video' | 'Audio' | 'Dokumen' | 'Arsip' | 'Lainnya';

export function downloadCategory(job: DownloadJob): DownloadCategory {
  const name = (job.filename || '').toLowerCase();
  const mime = (job.mime || '').toLowerCase();
  if (name.endsWith('.apk') || mime.includes('package-archive')) {
    return 'APK';
  }
  if (mime.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|heic|svg)$/.test(name)) {
    return 'Gambar';
  }
  if (mime.startsWith('video/') || /\.(mp4|mkv|webm|mov|avi|m4v)$/.test(name)) {
    return 'Video';
  }
  if (mime.startsWith('audio/') || /\.(mp3|m4a|aac|ogg|flac|wav|opus)$/.test(name)) {
    return 'Audio';
  }
  if (
    mime.includes('pdf') ||
    mime.includes('document') ||
    mime.includes('text/') ||
    mime.includes('spreadsheet') ||
    mime.includes('presentation') ||
    /\.(pdf|docx?|xlsx?|pptx?|txt|epub|csv|rtf)$/.test(name)
  ) {
    return 'Dokumen';
  }
  if (mime.includes('zip') || mime.includes('compressed') || mime.includes('archive') || /\.(zip|rar|7z|tar|gz|bz2)$/.test(name)) {
    return 'Arsip';
  }
  return 'Lainnya';
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
  if (!D) {
    throw new Error('Modul unduhan tidak aktif.');
  }
  await D.open(id);
}

export async function shareDownload(id: string): Promise<void> {
  if (!D) {
    throw new Error('Modul unduhan tidak aktif.');
  }
  await D.share(id);
}

export async function removeDownload(id: string, deleteFile = false): Promise<void> {
  try {
    await D?.remove(id, deleteFile);
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
