//! Pola pencocokan URL gaya Chromium match-pattern (untuk `@match` dan
//! `matches` pada manifest ekstensi) + glob Greasemonkey (untuk
//! `@include`/`@exclude` ala Via/Greasy Fork).

use once_cell::sync::OnceCell;
use regex::Regex;
use url::Url;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum HostPattern {
    /// `*` — host apa pun
    Any,
    /// `*.example.com` — example.com dan semua subdomainnya (semantik Chrome)
    Wildcard(String),
    /// host persis
    Exact(String),
}

#[derive(Debug, Clone)]
pub struct MatchPattern {
    pub scheme: Option<String>,
    pub host: HostPattern,
    pub path_re: OnceCell<Regex>,
    pub raw: String,
    path_source: String,
}

impl MatchPattern {
    /// Parse pola `<scheme>://<host><path>`.
    /// Contoh: `*://*/*`, `https://example.com/*`, `https://*.example.com/foo*`.
    pub fn parse(pattern: &str) -> Result<Self, String> {
        let raw = pattern.trim().to_string();
        if raw.is_empty() {
            return Err("pola kosong".into());
        }
        let (scheme, rest) = match raw.split_once("://") {
            Some((s, r)) => (Some(s.to_ascii_lowercase()), r),
            None => return Err(format!("pola harus mengandung '://' : {raw}")),
        };
        if let Some(s) = &scheme {
            if !matches!(s.as_str(), "*" | "http" | "https" | "ws" | "wss" | "file") {
                return Err(format!("skema tidak didukung: {s}"));
            }
        }
        let (host_part, path_part) = match rest.split_once('/') {
            Some((h, p)) => (h.to_string(), format!("/{p}")),
            None => (rest.to_string(), "/".to_string()),
        };
        if host_part.is_empty() {
            return Err(format!("host kosong pada pola: {raw}"));
        }
        let path_source = if path_part.is_empty() { "/".into() } else { path_part };
        let host = if host_part == "*" {
            HostPattern::Any
        } else if let Some(base) = host_part.strip_prefix("*.") {
            HostPattern::Wildcard(base.trim_start_matches('.').to_ascii_lowercase())
        } else {
            HostPattern::Exact(host_part.to_ascii_lowercase())
        };
        Ok(Self {
            scheme,
            host,
            path_re: OnceCell::new(),
            raw,
            path_source,
        })
    }

    fn path_regex(&self) -> &Regex {
        self.path_re.get_or_init(|| glob_to_regex(&self.path_source).expect("path glob valid"))
    }

    pub fn matches_url(&self, url: &Url) -> bool {
        let scheme = url.scheme();
        if scheme != "http" && scheme != "https" {
            return false;
        }
        match self.scheme.as_deref() {
            None | Some("*") => {}
            Some(s) if s == scheme => {}
            _ => return false,
        }
        let Some(host) = url.host_str() else { return false };
        let host = host.to_ascii_lowercase();
        let ok_host = match &self.host {
            HostPattern::Any => true,
            HostPattern::Exact(e) => e == &host,
            HostPattern::Wildcard(base) => host == *base || host.ends_with(&format!(".{base}")),
        };
        if !ok_host {
            return false;
        }
        self.path_regex().is_match(url.path())
    }
}

impl PartialEq for MatchPattern {
    fn eq(&self, other: &Self) -> bool {
        self.raw == other.raw
    }
}
impl Eq for MatchPattern {}

/// Ubah glob (`*` = apa pun) menjadi Regex berjangkar penuh.
/// Dipakai untuk `@include`/`@exclude` gaya Greasemonkey/Via.
pub fn glob_to_regex(glob: &str) -> Option<Regex> {
    let mut re = String::from("^");
    for ch in glob.chars() {
        match ch {
            '*' => re.push_str(".*"),
            _ => re.push_str(&regex::escape(&ch.to_string())),
        }
    }
    re.push('$');
    Regex::new(&re).ok()
}

/// `@include /regex/` — pola regex literal Greasemonkey.
pub fn regex_include(pattern: &str) -> Option<Regex> {
    let p = pattern.trim();
    if p.len() >= 2 && p.starts_with('/') && p.ends_with('/') {
        Regex::new(&p[1..p.len() - 1]).ok()
    } else {
        None
    }
}

/// Cocokkan satu entri pola (strict/glob/regex) terhadap URL teks.
pub fn entry_matches(entry: &str, url: &Url, url_str: &str) -> bool {
    if entry.trim().is_empty() {
        return false;
    }
    if let Some(re) = regex_include(entry) {
        return re.is_match(url_str);
    }
    if let Ok(p) = MatchPattern::parse(entry) {
        if p.matches_url(url) {
            return true;
        }
    }
    if let Some(re) = glob_to_regex(entry) {
        return re.is_match(url_str);
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    fn m(p: &str) -> MatchPattern {
        MatchPattern::parse(p).unwrap()
    }
    fn u(s: &str) -> Url {
        Url::parse(s).unwrap()
    }

    #[test]
    fn all_urls() {
        let p = m("*://*/*");
        assert!(p.matches_url(&u("https://example.com/")));
        assert!(p.matches_url(&u("http://a.b.c/x?y=1")));
        assert!(!p.matches_url(&u("about:blank")));
        assert!(!p.matches_url(&u("file:///x")));
    }

    #[test]
    fn exact_host() {
        let p = m("https://example.com/*");
        assert!(p.matches_url(&u("https://example.com/")));
        assert!(p.matches_url(&u("https://example.com/a/b?c=d")));
        assert!(!p.matches_url(&u("https://www.example.com/")));
        assert!(!p.matches_url(&u("http://example.com/")));
    }

    #[test]
    fn wildcard_host() {
        let p = m("https://*.example.com/*");
        assert!(p.matches_url(&u("https://sub.example.com/")));
        assert!(p.matches_url(&u("https://a.b.example.com/x")));
        assert!(p.matches_url(&u("https://example.com/"))); // semantik Chrome: apex ikut
        assert!(!p.matches_url(&u("https://notexample.com/")));
    }

    #[test]
    fn path_glob() {
        let p = m("*://example.com/foo*bar");
        assert!(p.matches_url(&u("https://example.com/fooXYZbar")));
        assert!(!p.matches_url(&u("https://example.com/fo")));
    }

    #[test]
    fn invalid() {
        assert!(MatchPattern::parse("").is_err());
        assert!(MatchPattern::parse("nourl").is_err());
        assert!(MatchPattern::parse("ftp://x/*").is_err());
    }

    #[test]
    fn glob_and_regex_entries() {
        assert!(entry_matches("https://example.com/*", &u("https://example.com/x"), "https://example.com/x"));
        assert!(entry_matches("*example*", &u("https://example.com/"), "https://example.com/"));
        assert!(entry_matches("/^https:\\/\\/a\\.b\\//", &u("https://a.b/c"), "https://a.b/c"));
        assert!(!entry_matches("*nothing*", &u("https://a.b/c"), "https://a.b/c"));
    }
}
