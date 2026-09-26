/**
 * Implementasi fallback murni-TypeScript untuk parser & pencocok pola
 * userscript — dipakai bila libzenith_core.so tidak tersedia.
 * Semantik sama dengan rust/zenith-core/src/{pattern,userscript,extension}.rs
 */

import type { UserScriptMeta } from '../types';

function reEsc(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Glob Greasemonkey: `*` = apa pun. */
export function globToRegExp(glob: string): RegExp | null {
  try {
    return new RegExp('^' + glob.split('*').map(reEsc).join('.*') + '$');
  } catch {
    return null;
  }
}

/** Pola match gaya Chromium: `*://*.example.com/path*`. */
export function chromePatternToRegExp(pattern: string): RegExp | null {
  const m = /^(\*|https?|wss?|file):\/\/([^/]*)(\/.*)?$/.exec(pattern);
  if (!m) {
    return globToRegExp(pattern);
  }
  const [, scheme, host, path = '/'] = m;
  const s = scheme === '*' ? 'https?' : reEsc(scheme);
  let h: string;
  if (host === '*') {
    h = '[^/]*';
  } else if (host.startsWith('*.')) {
    h = `(?:[^/]*\\.)?${reEsc(host.slice(2))}`;
  } else {
    h = reEsc(host);
  }
  const p = (path || '/*').split('*').map(reEsc).join('.*');
  try {
    return new RegExp(`^${s}://${h}${p}$`, 'i');
  } catch {
    return null;
  }
}

export function entryMatches(entry: string, url: string): boolean {
  const e = entry.trim();
  if (!e) {
    return false;
  }
  if (e.length >= 2 && e.startsWith('/') && e.endsWith('/')) {
    try {
      return new RegExp(e.slice(1, -1)).test(url);
    } catch {
      return false;
    }
  }
  const re = chromePatternToRegExp(e);
  return re ? re.test(url) : false;
}

export interface ParsedScript {
  meta: UserScriptMeta;
  body: string;
  hasHeader: boolean;
}

export function parseUserScript(src: string): ParsedScript {
  const meta: UserScriptMeta = {
    runAt: 'document-idle',
    noframes: false,
    matches: [],
    includes: [],
    excludes: [],
    grants: [],
    requires: [],
  };
  const lines = src.split('\n');
  const start = lines.findIndex(
    (l) => l.includes('==UserScript==') && !l.includes('==/UserScript=='),
  );
  const end = lines.findIndex((l) => l.includes('==/UserScript=='));
  let hasHeader = false;
  let bodyFrom = 0;
  if (start >= 0 && end > start) {
    hasHeader = true;
    for (const line of lines.slice(start + 1, end)) {
      const t = line.replace(/^\/+/, '').trim();
      if (!t.startsWith('@')) {
        continue;
      }
      const kv = t.slice(1);
      const sp = kv.search(/\s/);
      const key = (sp < 0 ? kv : kv.slice(0, sp)).trim().toLowerCase();
      const value = sp < 0 ? '' : kv.slice(sp).trim();
      if (!value && key !== 'noframes') {
        continue;
      }
      switch (key) {
        case 'name': meta.name = value; break;
        case 'namespace': meta.namespace = value; break;
        case 'version': meta.version = value; break;
        case 'description': meta.description = value; break;
        case 'author': meta.author = value; break;
        case 'icon': meta.icon = value; break;
        case 'homepage': case 'homepageurl': case 'website': meta.homepageUrl = value; break;
        case 'updateurl': meta.updateUrl = value; break;
        case 'downloadurl': meta.downloadUrl = value; break;
        case 'run-at': case 'runat': meta.runAt = value; break;
        case 'match': meta.matches.push(value); break;
        case 'include': meta.includes.push(value); break;
        case 'exclude': meta.excludes.push(value); break;
        case 'grant': meta.grants.push(value); break;
        case 'require': meta.requires.push(value); break;
        case 'noframes': meta.noframes = true; break;
        default: break;
      }
    }
    bodyFrom = end + 1;
  }
  const body = (bodyFrom > 0 ? lines.slice(bodyFrom).join('\n') : src).trim();
  if (!['document-start', 'document-end', 'document-idle'].includes(meta.runAt)) {
    meta.runAt = 'document-idle';
  }
  return { meta, body, hasHeader };
}

export function matchUserScript(meta: UserScriptMeta | null, url: string): boolean {
  if (!meta) {
    return false;
  }
  if (!/^https?:\/\//i.test(url)) {
    return false;
  }
  for (const ex of meta.excludes) {
    if (entryMatches(ex, url)) {
      return false;
    }
  }
  for (const m of [...meta.matches, ...meta.includes]) {
    if (entryMatches(m, url)) {
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------- ekstensi

interface CsLike {
  matches: string[];
  excludeMatches: string[];
  runAt: string;
}

/** Indeks content_scripts yang cocok (fallback TS). */
export function extensionScriptsMatching(
  ext: { contentScripts: CsLike[] },
  url: string,
  runAt?: string,
): number[] {
  if (!/^https?:\/\//i.test(url)) {
    return [];
  }
  const out: number[] = [];
  ext.contentScripts.forEach((cs, i) => {
    if (runAt && cs.runAt !== runAt) {
      return;
    }
    if (cs.excludeMatches.some((m) => entryMatches(m, url))) {
      return;
    }
    if (cs.matches.some((m) => entryMatches(m, url))) {
      out.push(i);
    }
  });
  return out;
}

// ---------------------------------------------------------------- URL kit

const KNOWN_SCHEMES = [
  'http', 'https', 'about', 'data', 'file', 'javascript', 'mailto',
  'intent', 'ws', 'wss', 'blob', 'content', 'market', 'tel', 'sms', 'geo',
];

function percentEncode(q: string): string {
  let out = '';
  for (const ch of q) {
    const c = ch.codePointAt(0)!;
    if (
      (c >= 0x30 && c <= 0x39) || (c >= 0x41 && c <= 0x5a) ||
      (c >= 0x61 && c <= 0x7a) || c === 0x2d || c === 0x5f || c === 0x2e || c === 0x7e
    ) {
      out += ch;
    } else {
      for (const b of new TextEncoder().encode(ch)) {
        out += '%' + b.toString(16).toUpperCase().padStart(2, '0');
      }
    }
  }
  return out;
}

export function expandSearch(template: string, query: string): string {
  const q = percentEncode(query.trim());
  return template.includes('%s') ? template.replace('%s', q) : template + q;
}

export function normalizeInput(input: string, searchTemplate: string): string {
  const s = input.trim();
  if (!s) {
    return '';
  }
  if (s.startsWith('javascript:')) {
    return s;
  }
  const schemeMatch = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(s);
  if (schemeMatch) {
    const scheme = schemeMatch[1].toLowerCase();
    if (scheme === 'http' || scheme === 'https') {
      return s;
    }
    if (KNOWN_SCHEMES.includes(scheme)) {
      return s;
    }
  }
  if (!/\s/.test(s)) {
    const host = s.split('/')[0].split('?')[0].split('#')[0].split(':')[0];
    const isLocal = host.toLowerCase() === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(host);
    if (host.toLowerCase() === 'localhost' || isLocal || host.includes('.')) {
      return (isLocal ? 'http://' : 'https://') + s;
    }
  }
  return expandSearch(searchTemplate, s);
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}
