//! Utilitas URL: normalisasi input omnibox (URL atau pencarian),
//! ekspansi templat mesin pencari (`%s`), dan pengambilan host.

use url::Url;

/// Percent-encode query untuk ditanam di URL pencarian.
pub fn percent_encode_query(q: &str) -> String {
    let mut out = String::with_capacity(q.len());
    for b in q.as_bytes() {
        let c = *b as char;
        if c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.' | '~') {
            out.push(c);
        } else {
            out.push_str(&format!("%{b:02X}"));
        }
    }
    out
}

/// Ganti `%s` pada templat mesin pencari dengan kueri terenkode.
pub fn expand_search(template: &str, query: &str) -> String {
    let q = percent_encode_query(query.trim());
    if template.contains("%s") {
        template.replacen("%s", &q, 1)
    } else {
        format!("{template}{q}")
    }
}

/// Skema yang dikenali browser. Nama lain (mis. `localhost:8080`) dianggap
/// host:port, bukan skema — meniru perilaku omnibox Chrome/Via.
const KNOWN_SCHEMES: &[&str] = &[
    "http", "https", "about", "data", "file", "javascript", "mailto", "intent", "ws", "wss",
    "blob", "content", "market", "tel", "sms", "geo", "view-source",
];

fn has_scheme(s: &str) -> Option<String> {
    let (scheme, _) = s.split_once(':')?;
    let mut chars = scheme.chars();
    if scheme.is_empty() || !chars.next()?.is_ascii_alphabetic() {
        return None;
    }
    if !scheme.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '+' | '-' | '.')) {
        return None;
    }
    let lower = scheme.to_ascii_lowercase();
    if KNOWN_SCHEMES.contains(&lower.as_str()) {
        Some(lower)
    } else {
        None
    }
}

/// Heuristik: apakah input ini kemungkinan besar URL (bukan kueri pencarian)?
pub fn looks_like_url(input: &str) -> bool {
    let s = input.trim();
    if s.is_empty() || s.split_whitespace().count() > 1 {
        return false;
    }
    if has_scheme(s).is_some() {
        return true;
    }
    let host_part = s.split(['/', '?', '#']).next().unwrap_or("");
    let host = host_part.split(':').next().unwrap_or("");
    if host.eq_ignore_ascii_case("localhost") {
        return true;
    }
    if host.parse::<std::net::IpAddr>().is_ok() {
        return true;
    }
    host.contains('.') && !host.starts_with('.') && !host.ends_with('.')
}

/// Keputusan omnibox: kalau URL → URL valid; selain itu → pencarian.
pub fn normalize_input(input: &str, search_template: &str) -> String {
    let s = input.trim();
    if s.is_empty() {
        return String::new();
    }
    if s.starts_with("javascript:") {
        return s.to_string();
    }
    if let Some(scheme) = has_scheme(s) {
        if scheme == "http" || scheme == "https" {
            if Url::parse(s).is_ok() {
                return s.to_string();
            }
            return expand_search(search_template, s); // URL rusak → cari
        }
        // Skema lain (about:, data:, file:, mailto:, intent:) — serahkan apa adanya.
        if Url::parse(s).is_ok() || s.starts_with("about:") || s.starts_with("data:") {
            return s.to_string();
        }
    }
    if looks_like_url(s) {
        let host_head = s.split(['/', ':', '?']).next().unwrap_or("");
        let candidate = if host_head.eq_ignore_ascii_case("localhost") || host_head.parse::<std::net::IpAddr>().is_ok() {
            format!("http://{s}")
        } else {
            format!("https://{s}")
        };
        if Url::parse(&candidate).is_ok() {
            return candidate;
        }
    }
    expand_search(search_template, s)
}

/// Ambil host dari sebuah URL (string kosong bila gagal).
pub fn host_of(url_str: &str) -> String {
    Url::parse(url_str)
        .ok()
        .and_then(|u| u.host_str().map(|h| h.to_ascii_lowercase()))
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    const ENGINE: &str = "https://duckduckgo.com/?q=%s";

    #[test]
    fn urls() {
        assert_eq!(normalize_input("example.com", ENGINE), "https://example.com");
        assert_eq!(normalize_input("EXAMPLE.com/A/B", ENGINE), "https://EXAMPLE.com/A/B");
        assert_eq!(normalize_input("https://example.com", ENGINE), "https://example.com");
        assert_eq!(normalize_input("sub.example.com/x?y=1", ENGINE), "https://sub.example.com/x?y=1");
        assert_eq!(normalize_input("localhost:8080", ENGINE), "http://localhost:8080");
        assert_eq!(normalize_input("192.168.1.1/admin", ENGINE), "http://192.168.1.1/admin");
        assert_eq!(normalize_input("about:blank", ENGINE), "about:blank");
        assert_eq!(normalize_input("data:text/html,hi", ENGINE), "data:text/html,hi");
    }

    #[test]
    fn searches() {
        assert_eq!(normalize_input("kucing lucu", ENGINE), "https://duckduckgo.com/?q=kucing%20lucu");
        assert_eq!(normalize_input("apa itu rust", ENGINE), "https://duckduckgo.com/?q=apa%20itu%20rust");
        assert_eq!(normalize_input("  spasi  ", ENGINE), "https://duckduckgo.com/?q=spasi");
    }

    #[test]
    fn expand() {
        assert_eq!(expand_search("https://x.id/?q=%s", "a b"), "https://x.id/?q=a%20b");
        assert_eq!(expand_search("https://x.id/s/", "z"), "https://x.id/s/z");
    }

    #[test]
    fn hosts() {
        assert_eq!(host_of("https://Example.COM/path"), "example.com");
        assert_eq!(host_of("bukan url"), "");
    }
}
