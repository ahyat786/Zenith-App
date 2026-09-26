import type { SearchEngine } from '../types';

/** Ambil saran pencarian dari mesin (format JSON [q, [saran]]). */
export async function fetchSuggestions(engine: SearchEngine, query: string): Promise<string[]> {
  const q = query.trim();
  if (!engine.suggestUrl || !q) {
    return [];
  }
  const url = engine.suggestUrl.replace('%s', encodeURIComponent(q));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) {
      return [];
    }
    const data = await res.json();
    if (Array.isArray(data) && Array.isArray(data[1])) {
      return data[1].slice(0, 8).map((x: unknown) => String(x));
    }
    return [];
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

export function fuzzyScore(haystack: string, needle: string): number {
  const h = haystack.toLowerCase();
  const n = needle.toLowerCase();
  if (!n) {
    return 0;
  }
  const idx = h.indexOf(n);
  if (idx < 0) {
    return -1;
  }
  return 100 - idx - (h.length - n.length) * 0.05;
}
