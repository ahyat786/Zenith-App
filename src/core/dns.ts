/**
 * Jaringan & DNS Aman — Shield Guard Zenith (v0.4.0).
 *
 * Padanan konsep Clash/mihomo di Zenith:
 *  - NameServer/FallBack group  → kelompok server utama/cadangan (2+2)
 *  - fallback-filter ipcidr     → deteksi jawaban IP privat/tercadang
 *    (jawaban semacam itu = indikasi pembajakan DNS → cadangan dipakai)
 *  - fallback-filter domain     → domain yang selalu dibandingkan jawaban
 *    utama vs cadangan
 *  - GEOIP ID / Global          → preset Indonesia / Global
 *
 * Uji resolusi memakai DoH wireformat asli (Rust, RFC 8484) sehingga
 * kompatibel dengan semua server: Quad9, AdGuard, Cloudflare, Google,
 * BebasDNS.
 */

import { dohResolve } from './native';

export interface DnsServerDef {
  id: string;
  name: string;
  type: 'DoH' | 'DoT';
  /** DoH: URL endpoint (POST application/dns-message). DoT: hostname untuk DNS Privat. */
  endpoint: string;
  ip?: string;
  port: number;
  note?: string;
}

export interface DnsSettings {
  preset: 'id' | 'global' | 'adguard' | 'custom';
  nameservers: string[]; // 2 id server utama
  fallbacks: string[]; // 2 id server cadangan
}

/** Katalog server DNS (Quad9 + AdGuard + AdGuard Family + Cloudflare + Google + BebasDNS). */
export const DNS_SERVERS: DnsServerDef[] = [
  { id: 'quad9-doh', name: 'Quad9', type: 'DoH', endpoint: 'https://dns.quad9.net/dns-query', port: 443, note: 'Blokir malware, tanpa log' },
  { id: 'quad9-dot', name: 'Quad9 DoT', type: 'DoT', endpoint: 'dns.quad9.net', ip: '9.9.9.9', port: 853, note: 'Terapkan via DNS Privat' },
  { id: 'quad9-dot2', name: 'Quad9 DoT (alt)', type: 'DoT', endpoint: 'dns.quad9.net', ip: '149.112.112.112', port: 853, note: 'Terapkan via DNS Privat' },
  { id: 'adguard-doh', name: 'AdGuard DNS', type: 'DoH', endpoint: 'https://dns.adguard-dns.com/dns-query', port: 443, note: 'Blokir iklan di level DNS' },
  { id: 'adguard-dot', name: 'AdGuard DNS DoT', type: 'DoT', endpoint: 'dns.adguard-dns.com', ip: '94.140.14.14', port: 853, note: 'Terapkan via DNS Privat' },
  { id: 'adguard-family-doh', name: 'AdGuard Family', type: 'DoH', endpoint: 'https://family.adguard-dns.com/dns-query', port: 443, note: 'Iklan + konten dewasa' },
  { id: 'adguard-family-dot', name: 'AdGuard Family DoT', type: 'DoT', endpoint: 'family.adguard-dns.com', ip: '94.140.14.15', port: 853, note: 'Terapkan via DNS Privat' },
  { id: 'cloudflare-doh', name: 'Cloudflare', type: 'DoH', endpoint: 'https://cloudflare-dns.com/dns-query', port: 443, note: 'Cepat, 1.1.1.1' },
  { id: 'cloudflare-dot', name: 'Cloudflare DoT', type: 'DoT', endpoint: '1dot1dot1dot1.cloudflare-dns.com', ip: '1.1.1.1', port: 853, note: 'Terapkan via DNS Privat' },
  { id: 'google-doh', name: 'Google', type: 'DoH', endpoint: 'https://dns.google/dns-query', port: 443 },
  { id: 'google-dot', name: 'Google DoT', type: 'DoT', endpoint: 'dns.google', ip: '8.8.8.8', port: 853, note: 'Terapkan via DNS Privat' },
  { id: 'bebasdns-doh', name: 'BebasDNS 🇮🇩', type: 'DoH', endpoint: 'https://dns.bebasid.com/dns-query', port: 443, note: 'Buka blokir internet positif (ID)' },
];

export function dnsServerById(id: string): DnsServerDef | undefined {
  return DNS_SERVERS.find((s) => s.id === id);
}

/** Preset default — Indonesia & Global (keduanya tersedia). */
export const DNS_PRESETS: Record<'id' | 'global' | 'adguard', { nameservers: string[]; fallbacks: string[] }> = {
  // Indonesia: utama BebasDNS + Quad9; cadangan AdGuard DoH + AdGuard DoT
  id: { nameservers: ['bebasdns-doh', 'quad9-doh'], fallbacks: ['adguard-doh', 'adguard-dot'] },
  // Global / Quad9 — 2 NameServer + 2 FallBack, persis tabel rilis
  // NameServer dns.quad9.net/dns-query HTTPS
  // NameServer 9.9.9.9:853 TLS
  // FallBack  dns.quad9.net/dns-query HTTPS
  // FallBack  149.112.112.112:853 TLS
  global: { nameservers: ['quad9-doh', 'quad9-dot'], fallbacks: ['quad9-doh', 'quad9-dot2'] },
  // AdGuard, selain Quad9 — juga 2+2
  adguard: {
    nameservers: ['adguard-doh', 'adguard-dot'],
    fallbacks: ['adguard-family-doh', 'adguard-family-dot'],
  },
};

export const DEFAULT_DNS_SETTINGS: DnsSettings = {
  preset: 'id',
  nameservers: DNS_PRESETS.id.nameservers,
  fallbacks: DNS_PRESETS.id.fallbacks,
};

// ---------------------------------------------------------- fallback-filter

/**
 * Padanan `fallback-filter.ipcidr` Clash: rentang IP privat/tercadang.
 * Bila server utama menjawab dengan IP dari rentang ini untuk domain publik,
 * jawaban itu dicurigai hasil pembajakan DNS (internet positif).
 */
const PRIVATE_RANGES_V4: [number, number][] = [
  [0x00000000, 0xff000000], // 0.0.0.0/8
  [0x0a000000, 0xff000000], // 10.0.0.0/8
  [0x64400000, 0xffc00000], // 100.64.0.0/10
  [0x7f000000, 0xff000000], // 127.0.0.0/8
  [0xa9fe0000, 0xffff0000], // 169.254.0.0/16
  [0xac100000, 0xfff00000], // 172.16.0.0/12
  [0xc0000000, 0xffffff00], // 192.0.0.0/24
  [0xc0000200, 0xffffff00], // 192.0.2.0/24
  [0xc0586300, 0xffffff00], // 192.88.99.0/24
  [0xc0a80000, 0xffff0000], // 192.168.0.0/16
  [0xc6120000, 0xfffe0000], // 198.18.0.0/15
  [0xc6336400, 0xffffff00], // 198.51.100.0/24
  [0xcb007100, 0xffffff00], // 203.0.113.0/24
  [0xe0000000, 0xf0000000], // 224.0.0.0/4
  [0xf0000000, 0xf0000000], // 240.0.0.0/4
  [0xffffffff, 0xffffffff], // 255.255.255.255/32
];

export function ipToLong(ip: string): number | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip.trim());
  if (!m) {
    return null;
  }
  const parts = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
  if (parts.some((p) => p > 255)) {
    return null;
  }
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

/** Apakah IP masuk rentang privat/tercadang (indikasi jawaban dibajak)? */
export function isPrivateIp(ip: string): boolean {
  if (ip.includes(':')) {
    const v = ip.toLowerCase();
    return (
      v === '::1' ||
      v.startsWith('fc') ||
      v.startsWith('fd') ||
      v.startsWith('fe8') ||
      v.startsWith('fe9') ||
      v.startsWith('fea') ||
      v.startsWith('feb')
    );
  }
  const n = ipToLong(ip);
  if (n === null) {
    return false;
  }
  return PRIVATE_RANGES_V4.some(([net, mask]) => (n & mask) >>> 0 === net);
}

/** Padanan `fallback-filter.domain` Clash — domain yang jawabannya selalu dibandingkan utama vs cadangan. */
/**
 * Padanan Clash `fallback-filter`.
 * `+.*` membuat setiap hostname masuk perbandingan utama/cadangan
 * dan tetap tercatat di log koneksi Shield Guard.
 *
 * fallback-filter:
 *   geoip: true
 *   geoip-code: ID
 *   domain:
 *     +.google.com
 *     +.facebook.com
 *     +.youtube.com
 *     +.githubusercontent.com
 *     +.googlevideo.com
 *     +.msftconnecttest.com
 *     +.msftncsi.com
 *     msftconnecttest.com
 *     msftncsi.com
 *     +.*
 */
export const FALLBACK_FILTER_DOMAINS = [
  '+.google.com',
  '+.facebook.com',
  '+.youtube.com',
  '+.githubusercontent.com',
  '+.googlevideo.com',
  '+.msftconnecttest.com',
  '+.msftncsi.com',
  'msftconnecttest.com',
  'msftncsi.com',
  '+.*',
];

export const FALLBACK_FILTER_GEOIP = true;
export const FALLBACK_FILTER_GEOIP_CODE = 'ID';

export function inFallbackFilterDomain(host: string): boolean {
  const h = host.toLowerCase().replace(/^\.+/, '');
  if (!h) {
    return false;
  }
  return FALLBACK_FILTER_DOMAINS.some((d) => {
    if (d === '+.*' || d === '*') {
      return true;
    }
    const bare = d.replace(/^\+\./, '');
    return h === bare || h.endsWith('.' + bare);
  });
}

// ---------------------------------------------------------- uji resolusi

export interface DnsTestEntry {
  group: 'UTAMA' | 'CADANGAN';
  serverId: string;
  name: string;
  type: 'DoH' | 'DoT';
  ok: boolean;
  ips: string[];
  ms?: number;
  error?: string;
  suspicious?: boolean; // jawaban IP privat → indikasi pembajakan
  note?: string;
}

export interface DnsTestResult {
  entries: DnsTestEntry[];
  answerIp?: string;
  usedFallback: boolean;
  verdict: string;
  hijacked: boolean;
}

function judge(ips: string[]): { good: string[]; suspicious: boolean } {
  const good = ips.filter((ip) => !isPrivateIp(ip));
  return { good, suspicious: ips.length > 0 && good.length !== ips.length };
}

/**
 * Uji resolusi hostname lewat kelompok utama lalu cadangan
 * (urutan Clash: utama → bila gagal/terindikasi dibajak → cadangan).
 */
export async function runDnsTest(cfg: DnsSettings, host: string): Promise<DnsTestResult> {
  const entries: DnsTestEntry[] = [];
  const groups: Array<['UTAMA' | 'CADANGAN', string[]]> = [
    ['UTAMA', cfg.nameservers],
    ['CADANGAN', cfg.fallbacks],
  ];
  let answerIp: string | undefined;
  let usedFallback = false;
  let hijacked = false;

  for (const [group, ids] of groups) {
    let groupAnswered = false;
    for (const id of ids) {
      const def = dnsServerById(id);
      if (!def) {
        continue;
      }
      if (def.type === 'DoT') {
        entries.push({
          group,
          serverId: id,
          name: def.name,
          type: 'DoT',
          ok: false,
          ips: [],
          note: `${def.endpoint}:${def.port} — terapkan lewat Pengaturan DNS Privat (DoT), tak diuji di aplikasi`,
        });
        continue;
      }
      try {
        const parsed = await dohResolve(def.endpoint, host, 4000);
        if (parsed?.ok) {
          const { good, suspicious } = judge(parsed.ips ?? []);
          entries.push({
            group,
            serverId: id,
            name: def.name,
            type: 'DoH',
            ok: true,
            ips: parsed.ips ?? [],
            ms: parsed.ms,
            suspicious,
          });
          if (suspicious) {
            hijacked = true;
          }
          if (good.length > 0 && !groupAnswered) {
            groupAnswered = true;
            if (!answerIp) {
              answerIp = good[0];
            } else if (group === 'CADANGAN') {
              usedFallback = true;
            }
          }
        } else {
          entries.push({
            group,
            serverId: id,
            name: def.name,
            type: 'DoH',
            ok: false,
            ips: [],
            error: parsed?.error ? String(parsed.error).slice(0, 90) : 'gagal',
          });
        }
      } catch (e) {
        entries.push({
          group,
          serverId: id,
          name: def.name,
          type: 'DoH',
          ok: false,
          ips: [],
          error: e instanceof Error ? e.message.slice(0, 90) : 'gagal',
        });
      }
    }
    // UTAMA sehat → cadangan tetap ditanyakan untuk pembanding (domain fallback-filter), jadi loop tetap lanjut.
  }

  const nsOk = entries.some((e) => e.group === 'UTAMA' && e.ok && !e.suspicious && e.ips.length > 0);
  const fbOk = entries.some((e) => e.group === 'CADANGAN' && e.ok && e.ips.length > 0);
  const compare = inFallbackFilterDomain(host);

  let verdict: string;
  if (nsOk) {
    verdict = compare
      ? `Utama sehat. Jawaban dibandingkan cadangan (domain fallback-filter: ${host}).`
      : `Utama menjawab: ${answerIp}`;
  } else if (hijacked && fbOk) {
    verdict = `Jawaban utama berisi IP privat/tercadang (indikasi pembajakan DNS). Cadangan dipakai: ${answerIp ?? '—'}`;
    usedFallback = true;
  } else if (fbOk) {
    verdict = `Utama gagal — cadangan menjawab: ${answerIp ?? '—'}`;
    usedFallback = true;
  } else {
    verdict = 'Semua server gagal — periksa koneksi atau coba preset lain.';
  }

  return { entries, answerIp, usedFallback, verdict, hijacked };
}
