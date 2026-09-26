//! Parser metadata userscript — kompatibel dengan format yang dipakai Via
//! Browser dan skrip Greasy Fork (`// ==UserScript==` … `// ==/UserScript==`).

use crate::pattern::entry_matches;
use serde::{Deserialize, Serialize};
use url::Url;

fn default_run_at() -> String {
    "document-idle".into()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct UserScriptMeta {
    pub name: Option<String>,
    pub namespace: Option<String>,
    pub version: Option<String>,
    pub description: Option<String>,
    pub author: Option<String>,
    pub icon: Option<String>,
    pub homepage_url: Option<String>,
    pub update_url: Option<String>,
    pub download_url: Option<String>,
    #[serde(default = "default_run_at")]
    pub run_at: String,
    pub noframes: bool,
    pub matches: Vec<String>,
    pub includes: Vec<String>,
    pub excludes: Vec<String>,
    pub grants: Vec<String>,
    pub requires: Vec<String>,
}

impl Default for UserScriptMeta {
    fn default() -> Self {
        Self {
            name: None,
            namespace: None,
            version: None,
            description: None,
            author: None,
            icon: None,
            homepage_url: None,
            update_url: None,
            download_url: None,
            run_at: default_run_at(),
            noframes: false,
            matches: Vec::new(),
            includes: Vec::new(),
            excludes: Vec::new(),
            grants: Vec::new(),
            requires: Vec::new(),
        }
    }
}

impl UserScriptMeta {
    pub fn display_name(&self) -> &str {
        self.name.as_deref().unwrap_or("Tanpa nama")
    }
    pub fn normalized_run_at(&self) -> &str {
        match self.run_at.as_str() {
            "document-start" | "document-end" | "document-idle" => self.run_at.as_str(),
            _ => "document-idle",
        }
    }
}

#[derive(Debug, Clone)]
pub struct ParsedUserScript {
    pub meta: UserScriptMeta,
    pub body: String,
    pub has_header: bool,
}

/// Parse kode userscript: blok metadata + badan skrip.
pub fn parse_user_script(src: &str) -> ParsedUserScript {
    let lines: Vec<&str> = src.lines().collect();
    let mut meta = UserScriptMeta::default();
    let mut has_header = false;
    let mut body_from = 0usize;

    let start = lines
        .iter()
        .position(|l| l.contains("==UserScript==") && !l.contains("==/UserScript=="));
    let end = lines.iter().position(|l| l.contains("==/UserScript=="));

    if let (Some(s), Some(e)) = (start, end) {
        if e > s {
            has_header = true;
            for line in &lines[s + 1..e] {
                let t = line.trim_start_matches('/').trim();
                let Some(kv) = t.strip_prefix('@') else { continue };
                let (key, value) = match kv.split_once(char::is_whitespace) {
                    Some((k, v)) => (k.trim().to_ascii_lowercase(), v.trim().to_string()),
                    None => (kv.trim().to_ascii_lowercase(), String::new()),
                };
                if value.is_empty() {
                    continue;
                }
                match key.as_str() {
                    "name" => meta.name = Some(value),
                    "namespace" => meta.namespace = Some(value),
                    "version" => meta.version = Some(value),
                    "description" => meta.description = Some(value),
                    "author" => meta.author = Some(value),
                    "icon" => meta.icon = Some(value),
                    "homepage" | "homepageurl" | "website" => {
                        meta.homepage_url = Some(value)
                    }
                    "updateurl" => meta.update_url = Some(value),
                    "downloadurl" => meta.download_url = Some(value),
                    "run-at" | "runat" => meta.run_at = value,
                    "match" => meta.matches.push(value),
                    "include" => meta.includes.push(value),
                    "exclude" => meta.excludes.push(value),
                    "grant" => meta.grants.push(value),
                    "require" => meta.requires.push(value),
                    "noframes" => meta.noframes = true,
                    _ => {}
                }
            }
            body_from = e + 1;
        }
    }

    let body = if body_from > 0 && body_from <= lines.len() {
        lines[body_from..].join("\n")
    } else {
        src.to_string()
    };

    ParsedUserScript {
        meta,
        body: body.trim().to_string(),
        has_header,
    }
}

/// Apakah skrip boleh berjalan pada URL tertentu?
/// Semantik: `@exclude` menang; lalu `@match` (strict) atau `@include` (glob/regex).
pub fn matches_url(meta: &UserScriptMeta, url_str: &str) -> Result<bool, String> {
    let url = Url::parse(url_str).map_err(|e| e.to_string())?;
    if url.scheme() != "http" && url.scheme() != "https" {
        return Ok(false);
    }
    for ex in &meta.excludes {
        if entry_matches(ex, &url, url_str) {
            return Ok(false);
        }
    }
    for m in meta.matches.iter().chain(meta.includes.iter()) {
        if entry_matches(m, &url, url_str) {
            return Ok(true);
        }
    }
    Ok(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = r#"// ==UserScript==
// @name         Contoh Zenith
// @namespace    id.zenith.contoh
// @version      1.2.3
// @description  Skrip uji
// @author       Kamu
// @match        https://example.com/*
// @match        *://*.example.org/path/*
// @exclude      https://example.com/admin*
// @run-at       document-start
// @grant        none
// ==/UserScript==
console.log('halo');
"#;

    #[test]
    fn parse_header() {
        let p = parse_user_script(SAMPLE);
        assert!(p.has_header);
        assert_eq!(p.meta.name.as_deref(), Some("Contoh Zenith"));
        assert_eq!(p.meta.version.as_deref(), Some("1.2.3"));
        assert_eq!(p.meta.matches.len(), 2);
        assert_eq!(p.meta.run_at, "document-start");
        assert!(p.body.contains("console.log"));
        assert!(!p.body.contains("@name"));
    }

    #[test]
    fn parse_without_header() {
        let p = parse_user_script("alert(1);");
        assert!(!p.has_header);
        assert!(p.meta.matches.is_empty());
        assert!(p.body.contains("alert"));
    }

    #[test]
    fn matching() {
        let p = parse_user_script(SAMPLE);
        assert!(matches_url(&p.meta, "https://example.com/halo?q=1").unwrap());
        assert!(!matches_url(&p.meta, "https://example.com/admin/rahasia").unwrap());
        assert!(matches_url(&p.meta, "https://sub.example.org/path/x").unwrap());
        assert!(!matches_url(&p.meta, "https://sub.example.org/other").unwrap());
        assert!(!matches_url(&p.meta, "https://google.com/").unwrap());
        assert!(!matches_url(&p.meta, "about:blank").unwrap());
    }

    #[test]
    fn include_glob_and_regex() {
        let src = "// ==UserScript==\n// @include *youtube*\n// ==/UserScript==\nx";
        let p = parse_user_script(src);
        assert!(matches_url(&p.meta, "https://www.youtube.com/watch?v=1").unwrap());
        let src2 = "// ==UserScript==\n// @include /^https:\\/\\/id\\.wikipedia\\.org/\n// ==/UserScript==\nx";
        let p2 = parse_user_script(src2);
        assert!(matches_url(&p2.meta, "https://id.wikipedia.org/wiki/X").unwrap());
        assert!(!matches_url(&p2.meta, "https://en.wikipedia.org/").unwrap());
    }
}
