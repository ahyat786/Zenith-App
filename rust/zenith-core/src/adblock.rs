//! Mesin pemblokir iklan/_tracker berbasis hosts.
//! Dipakai oleh `ZenithWebViewClient.shouldInterceptRequest` (Kotlin)
//! sehingga pemblokiran terjadi pada level jaringan — bukan sekadar CSS.

use once_cell::sync::Lazy;
use std::collections::HashSet;
use std::collections::VecDeque;
use std::sync::Mutex;
use url::Url;

/// Daftar blokir bawaan (kurasi ringan, aman) — digabung saat startup.
const DEFAULT_HOSTS: &str = include_str!("default_blocklist.txt");

/// Batas ukuran log koneksi (Shield Guard) — entri terbaru dipertahankan.
const LOG_CAP: usize = 500;

/// Satu entri log koneksi (hostname + keputusan blokir).
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnLogEntry {
    pub host: String,
    pub blocked: bool,
    pub main: bool,
    pub at: u64,
}

#[derive(Debug)]
pub struct Engine {
    pub enabled: bool,
    blocked: HashSet<String>,
    allowed: HashSet<String>,
    pub blocked_count: u64,
    pub user_list_lines: usize,
    conn_log: VecDeque<ConnLogEntry>,
}

impl Engine {
    fn new() -> Self {
        let mut e = Engine {
            enabled: true,
            blocked: HashSet::new(),
            allowed: HashSet::new(),
            blocked_count: 0,
            user_list_lines: 0,
            conn_log: VecDeque::new(),
        };
        e.load_default();
        e
    }

    fn load_default(&mut self) {
        let n = Self::insert_hosts(&mut self.blocked, DEFAULT_HOSTS);
        self.user_list_lines = 0;
        let _ = n;
    }

    fn insert_hosts(set: &mut HashSet<String>, data: &str) -> usize {
        let mut n = 0;
        for line in data.lines() {
            if let Some(host) = parse_hosts_line(line) {
                if set.insert(host) {
                    n += 1;
                }
            }
        }
        n
    }

    /// Muat daftar pengguna. Mode "replace" mengganti daftar bawaan+pengguna,
    /// mode "merge" menambah. Selalu mengembalikan jumlah total host aktif.
    pub fn load_user_list(&mut self, data: &str, mode: &str) -> usize {
        if mode == "replace" {
            self.blocked.clear();
            self.load_default();
        }
        let n = Self::insert_hosts(&mut self.blocked, data);
        self.user_list_lines = n;
        self.blocked.len()
    }

    pub fn clear_user_list(&mut self) -> usize {
        self.blocked.clear();
        self.load_default();
        self.blocked.len()
    }

    pub fn set_allow(&mut self, host: &str, allow: bool) {
        let h = host.trim().to_ascii_lowercase();
        if h.is_empty() {
            return;
        }
        if allow {
            self.allowed.insert(h);
        } else {
            self.allowed.remove(&h);
        }
    }

    pub fn is_allowed(&self, host: &str) -> bool {
        self.allowed.contains(host)
    }

    /// Host terblokir juga memblokir semua subdomainnya (pencocokan sufiks).
    /// Allowlist juga berlaku per-sufiks dan selalu menang.
    pub fn should_block_host(&self, host: &str) -> bool {
        let mut a: &str = host;
        loop {
            if self.allowed.contains(a) {
                return false;
            }
            match a.find('.') {
                Some(i) => a = &a[i + 1..],
                None => break,
            }
        }
        if self.blocked.contains(host) {
            return true;
        }
        let mut h: &str = host;
        while let Some(idx) = h.find('.') {
            h = &h[idx + 1..];
            if self.blocked.contains(h) {
                return true;
            }
        }
        false
    }

    pub fn should_block(&mut self, url_str: &str) -> bool {
        let Some((host, path_q)) = split_host_path(url_str) else {
            return false;
        };
        let blocked = self.enabled && (self.should_block_host(&host) || bait_path(&host, &path_q));
        if blocked {
            self.blocked_count += 1;
        }
        self.log_conn(&host, blocked, false);
        blocked
    }

    /// Catat permintaan frame utama (halaman itu sendiri) — hanya untuk log.
    pub fn note_request(&mut self, url_str: &str) {
        if let Ok(url) = Url::parse(url_str) {
            if let Some(host) = url.host_str() {
                let host = host.to_ascii_lowercase();
                self.log_conn(&host, false, true);
            }
        }
    }

    fn log_conn(&mut self, host: &str, blocked: bool, main: bool) {
        if host.is_empty() {
            return;
        }
        if self.conn_log.len() >= LOG_CAP {
            self.conn_log.pop_front();
        }
        self.conn_log.push_back(ConnLogEntry {
            host: host.to_string(),
            blocked,
            main,
            at: now_ms(),
        });
    }

    /// Log koneksi terbaru lebih dulu.
    pub fn connection_log(&self) -> Vec<ConnLogEntry> {
        self.conn_log.iter().rev().cloned().collect()
    }

    pub fn clear_connection_log(&mut self) {
        self.conn_log.clear();
    }

    pub fn stats(&self) -> EngineStats {
        EngineStats {
            enabled: self.enabled,
            hosts: self.blocked.len(),
            user_list_lines: self.user_list_lines,
            blocked_count: self.blocked_count,
            allowed_hosts: self.allowed.iter().cloned().collect(),
        }
    }
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineStats {
    pub enabled: bool,
    pub hosts: usize,
    pub user_list_lines: usize,
    pub blocked_count: u64,
    pub allowed_hosts: Vec<String>,
}

/// Parse satu baris berformat hosts: `0.0.0.0 domain`, `127.0.0.1 domain # komentar`, atau `domain`.
pub fn parse_hosts_line(line: &str) -> Option<String> {
    let l = line.split('#').next().unwrap_or("").trim();
    if l.is_empty() {
        return None;
    }
    let mut it = l.split_whitespace();
    let first = it.next()?;
    if let Some(second) = it.next() {
        // "IP domain" → host adalah token kedua
        if is_domain(second) {
            return Some(second.to_ascii_lowercase());
        }
        None
    } else if is_domain(first) {
        Some(first.to_ascii_lowercase())
    } else {
        None
    }
}

fn is_domain(s: &str) -> bool {
    !s.is_empty()
        && s.contains('.')
        && !s.contains('/')
        && !s.contains(':')
        && !s.starts_with('.')
        && !s.ends_with('.')
        && s.parse::<std::net::IpAddr>().is_err()
}

/// Host + path?query, huruf kecil. Menerima URL absolut.
fn split_host_path(url_str: &str) -> Option<(String, String)> {
    let url = Url::parse(url_str).ok()?;
    let host = url.host_str()?.to_ascii_lowercase();
    if host.is_empty() {
        return None;
    }
    let mut path_q = url.path().to_ascii_lowercase();
    if let Some(q) = url.query() {
        path_q.push('?');
        path_q.push_str(&q.to_ascii_lowercase());
    }
    Some((host, path_q))
}

/// Umpan skrip/jalur yang dipakai halaman uji (bukan sekadar hostname).
/// `vk.com` sendiri tidak diblokir — hanya `/rtrg`.
fn bait_path(host: &str, path_q: &str) -> bool {
    const SCRIPT_BAIT: &[&str] = &[
        "/ads.js",
        "/pagead.js",
        "/adsbygoogle.js",
        "/advertisement.js",
        "/partner.ads.js",
        "/widget/ads.js",
    ];
    if SCRIPT_BAIT.iter().any(|s| path_q.contains(s)) {
        return true;
    }
    if path_q.contains("ad_box_") {
        return true;
    }
    if path_q.contains("/gampad/ads") || path_q.contains("/pagead/ads") || path_q.contains("/pagead/js/") {
        return true;
    }
    if host == "vk.com" && path_q.contains("/rtrg") {
        return true;
    }
    if (host == "www.google-analytics.com" || host.ends_with(".google-analytics.com"))
        && path_q.contains("/g/collect")
    {
        return true;
    }
    false
}

pub static ENGINE: Lazy<Mutex<Engine>> = Lazy::new(|| Mutex::new(Engine::new()));

pub fn with_engine<T>(f: impl FnOnce(&mut Engine) -> T) -> T {
    let mut e = ENGINE.lock().unwrap_or_else(|p| p.into_inner());
    f(&mut e)
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_lines() {
        assert_eq!(parse_hosts_line("0.0.0.0 ads.example.com"), Some("ads.example.com".into()));
        assert_eq!(parse_hosts_line("127.0.0.0.1 doubleclick.net # iklan"), Some("doubleclick.net".into()));
        assert_eq!(parse_hosts_line("tracker.example.org"), Some("tracker.example.org".into()));
        assert_eq!(parse_hosts_line("# komentar"), None);
        assert_eq!(parse_hosts_line(""), None);
        assert_eq!(parse_hosts_line("0.0.0.0 localhost"), None); // bukan domain ber-titik
    }

    #[test]
    fn blocking_semantics_and_user_lists() {
        // CATATAN: semua kasus adblock digabung dalam satu test agar tidak
        // berlomba-lomba memodifikasi state global ENGINE secara paralel.
        with_engine(|e| {
            e.enabled = true;
            e.allowed.clear();
            e.load_user_list("", "replace");
            assert!(e.blocked.len() > 50);

            assert!(e.should_block("https://ad.doubleclick.net/x"));
            assert!(e.should_block("https://sub.doubleclick.net/x"), "sufiks ikut");
            assert!(!e.should_block("https://example.com/"));
            assert!(!e.should_block("mailto:x@y")); // bukan http

            // allowlist menang (per sufiks juga)
            e.set_allow("doubleclick.net", true);
            assert!(!e.should_block("https://ad.doubleclick.net/x"));
            e.set_allow("doubleclick.net", false);
            assert!(e.should_block("https://ad.doubleclick.net/x"));

            // saklar mati
            e.enabled = false;
            assert!(!e.should_block("https://ad.doubleclick.net/x"));
            e.enabled = true;

            // penghitung bertambah
            let before = e.stats().blocked_count;
            assert!(e.should_block("https://ad.doubleclick.net/y"));
            assert_eq!(e.stats().blocked_count, before + 1);

            // daftar pengguna: merge lalu replace
            e.allowed.clear();
            e.load_user_list("0.0.0.0 ku.blocked.id\nexample.test", "merge");
            assert!(e.should_block_host("ku.blocked.id"));
            assert!(e.should_block_host("a.ku.blocked.id"));
            e.load_user_list("0.0.0.0 ku.blocked.id", "replace");
            assert!(e.should_block_host("ku.blocked.id"));
            assert!(!e.should_block_host("only.example.test"), "replace membuang merge sebelumnya");
            assert!(e.should_block_host("doubleclick.net"), "bawaan tetap ada");

            // umpan skrip & jalur halaman uji — fetch harus ditolak, bukan 204
            assert!(e.should_block("https://adblock.turtlecute.org/js/widget/ads.js"));
            assert!(e.should_block("https://adblock.turtlecute.org/js/pagead.js"));
            assert!(e.should_block("https://d3ward.github.io/toolz/partner.ads.js"));
            assert!(e.should_block("https://raymondhill.net/ublock/ad.html?something&ad_box_"));
            assert!(e.should_block("https://vk.com/rtrg?id=1"));
            assert!(!e.should_block("https://vk.com/"), "vk.com sendiri bukan iklan");
            assert!(!e.should_block("https://gstatic.com/webp/gallery3/1.png?ads=1"));
            assert!(!e.should_block("https://prism-break.org/en/"));
            assert!(e.should_block("https://widgets.outbrain.com/images/widgetIcons/ob_logo_16x16.png"));

            // host uji yang ditambahkan daftar bawaan
            for host in include_str!("shield_probe_extra.txt").lines() {
                let host = host.trim();
                if host.is_empty() || host.starts_with('#') {
                    continue;
                }
                assert!(
                    e.should_block_host(host),
                    "host uji tidak terblokir: {host}"
                );
            }

            // kembalikan keadaan bersih untuk test lain
            e.load_user_list("", "replace");
            e.blocked_count = 0;
        });
    }
}
