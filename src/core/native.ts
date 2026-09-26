/**
 * Jembatan ke modul native ZenithCore (Rust via JNI).
 * Bila modul/.so tidak tersedia, semua panggilan otomatis fallback
 * ke implementasi TypeScript (userscriptFallback.ts).
 */

import { NativeModules } from 'react-native';
import type { UserScriptMeta } from '../types';
import {
  extensionScriptsMatching,
  expandSearch as expandSearchTs,
  hostOf as hostOfTs,
  matchUserScript as matchUserScriptTs,
  normalizeInput as normalizeInputTs,
  parseUserScript as parseUserScriptTs,
} from './userscriptFallback';

interface ZenithCoreNative {
  coreVersion(): Promise<string | null>;
  parseUserScript(src: string): Promise<string | null>;
  matchUserScript(metaJson: string, url: string): Promise<boolean>;
  parseExtensionManifest(manifestJson: string): Promise<string | null>;
  extensionScriptsFor(
    extJson: string,
    url: string,
    runAt: string,
  ): Promise<string | null>;
  adblockInit(hosts: string, mode: string): Promise<string | null>;
  adblockSetEnabled(enabled: boolean): Promise<void>;
  adblockAllowHost(host: string, allow: boolean): Promise<void>;
  adblockStats(): Promise<string | null>;
  adblockResetStats(): Promise<void>;
  normalizeInput(input: string, searchTemplate: string): Promise<string | null>;
  expandSearch(template: string, query: string): Promise<string | null>;
  hostOf(url: string): Promise<string | null>;
}

const ZC = NativeModules.ZenithCore as ZenithCoreNative | undefined;
export const nativeAvailable = !!ZC;

export interface ParsedUserScriptResult {
  meta: UserScriptMeta;
  body: string;
  hasHeader: boolean;
  engine: 'rust' | 'js';
}

export async function parseUserScript(src: string): Promise<ParsedUserScriptResult> {
  if (ZC) {
    try {
      const raw = await ZC.parseUserScript(src);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.ok) {
          return { ...parsed, engine: 'rust' };
        }
      }
    } catch {
      // jatuh ke fallback
    }
  }
  const ts = parseUserScriptTs(src);
  return { ...ts, engine: 'js' };
}

export async function matchUserScript(meta: UserScriptMeta | null, url: string): Promise<boolean> {
  if (meta && ZC) {
    try {
      return await ZC.matchUserScript(JSON.stringify(meta), url);
    } catch {
      // jatuh ke fallback
    }
  }
  return matchUserScriptTs(meta, url);
}

export async function parseExtensionManifest(
  manifestJson: string,
): Promise<{ ok: boolean; extension?: any; error?: string; engine: 'rust' | 'js' }> {
  if (ZC) {
    try {
      const raw = await ZC.parseExtensionManifest(manifestJson);
      if (raw) {
        const parsed = JSON.parse(raw);
        return { ...parsed, engine: 'rust' };
      }
    } catch {
      // jatuh ke fallback
    }
  }
  // Fallback minimal: validasi keberadaan name + content_scripts
  try {
    const m = JSON.parse(manifestJson);
    if (!m || !m.name) {
      return { ok: false, error: "manifest tidak memiliki 'name'", engine: 'js' };
    }
    const cs = Array.isArray(m.content_scripts) ? m.content_scripts : [];
    const normCs = cs
      .filter((c: any) => Array.isArray(c.matches) && c.matches.length > 0)
      .map((c: any) => ({
        matches: c.matches,
        excludeMatches: Array.isArray(c.exclude_matches) ? c.exclude_matches : [],
        js: Array.isArray(c.js) ? c.js : [],
        css: Array.isArray(c.css) ? c.css : [],
        runAt:
          c.run_at === 'document_start' ? 'document-start'
          : c.run_at === 'document_end' ? 'document-end'
          : 'document-idle',
        allFrames: !!c.all_frames,
      }));
    return {
      ok: true,
      engine: 'js',
      extension: {
        id: `${String(m.name).toLowerCase().replace(/[^a-z0-9]+/g, '-')}@${m.version || '0'}`,
        name: m.name,
        version: m.version || '0.0',
        description: m.description,
        manifestVersion: m.manifest_version || 2,
        permissions: Array.isArray(m.permissions) ? m.permissions : [],
        hostPermissions: Array.isArray(m.host_permissions) ? m.host_permissions : [],
        contentScripts: normCs,
        hasBackground: !!(m.background && (m.background.service_worker || m.background.scripts)),
        icons: m.icons ? Object.values(m.icons) : [],
      },
    };
  } catch (e: any) {
    return { ok: false, error: `JSON tidak valid: ${e?.message ?? e}`, engine: 'js' };
  }
}

export async function extensionScriptsFor(
  ext: { contentScripts: any[] },
  url: string,
  runAt?: string,
): Promise<number[]> {
  if (ZC) {
    try {
      const raw = await ZC.extensionScriptsFor(
        JSON.stringify(ext),
        url,
        runAt ?? '',
      );
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.ok) {
          return parsed.indices as number[];
        }
      }
    } catch {
      // jatuh ke fallback
    }
  }
  return extensionScriptsMatching(ext, url, runAt);
}

export interface AdblockStats {
  enabled: boolean;
  hosts: number;
  userListLines: number;
  blockedCount: number;
  allowedHosts: string[];
}

export async function adblockStats(): Promise<AdblockStats | null> {
  if (!ZC) {
    return null;
  }
  try {
    const raw = await ZC.adblockStats();
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    return parsed.stats ?? null;
  } catch {
    return null;
  }
}

export async function adblockInit(hosts: string, mode: 'merge' | 'replace'): Promise<void> {
  try {
    await ZC?.adblockInit(hosts, mode);
  } catch {
    // diabaikan — mesin native sudah punya daftar bawaan
  }
}

export async function adblockSetEnabled(enabled: boolean): Promise<void> {
  try {
    await ZC?.adblockSetEnabled(enabled);
  } catch {
    // diabaikan
  }
}

export async function adblockAllowHost(host: string, allow: boolean): Promise<void> {
  try {
    await ZC?.adblockAllowHost(host, allow);
  } catch {
    // diabaikan
  }
}

export async function adblockResetStats(): Promise<void> {
  try {
    await ZC?.adblockResetStats();
  } catch {
    // diabaikan
  }
}

export async function normalizeInput(input: string, searchTemplate: string): Promise<string> {
  if (ZC) {
    try {
      const out = await ZC.normalizeInput(input, searchTemplate);
      if (out != null) {
        return out;
      }
    } catch {
      // jatuh ke fallback
    }
  }
  return normalizeInputTs(input, searchTemplate);
}

export async function expandSearch(template: string, query: string): Promise<string> {
  if (ZC) {
    try {
      const out = await ZC.expandSearch(template, query);
      if (out != null) {
        return out;
      }
    } catch {
      // jatuh ke fallback
    }
  }
  return expandSearchTs(template, query);
}

export async function hostOf(url: string): Promise<string> {
  if (ZC) {
    try {
      const out = await ZC.hostOf(url);
      if (out != null) {
        return out;
      }
    } catch {
      // jatuh ke fallback
    }
  }
  return hostOfTs(url);
}

export async function coreVersion(): Promise<{ version: string; engine: string } | null> {
  try {
    const raw = await ZC?.coreVersion();
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
