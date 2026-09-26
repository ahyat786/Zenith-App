//! Parser manifest ekstensi Chrome (MV2/MV3) — subset kompatibel Kiwi.
//!
//! Kiwi Browser menjalankan ekstensi penuh di atas Chromium; Zenith
//! (berbasis WebView) mendukung subset yang paling berguna:
//! parsing manifest, `content_scripts` (js/css + matches + run_at),
//! daftar `permissions`, dan deteksi `background` (info saja —
//! service worker tidak dapat dijalankan di WebView).

use crate::pattern::entry_matches;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use url::Url;

fn default_run_at() -> String {
    "document-idle".into()
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct NormalizedContentScript {
    pub matches: Vec<String>,
    pub exclude_matches: Vec<String>,
    pub js: Vec<String>,
    pub css: Vec<String>,
    #[serde(default = "default_run_at")]
    pub run_at: String,
    pub all_frames: bool,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct NormalizedExtension {
    pub id: String,
    pub name: String,
    pub version: String,
    pub description: Option<String>,
    pub manifest_version: u32,
    pub permissions: Vec<String>,
    pub host_permissions: Vec<String>,
    pub content_scripts: Vec<NormalizedContentScript>,
    pub has_background: bool,
    pub background_kind: Option<String>,
    pub options_page: Option<String>,
    pub icons: Vec<String>,
}

fn norm_run_at(v: Option<&str>) -> String {
    match v.map(|s| s.trim()) {
        Some("document_start") | Some("document-start") => "document-start".into(),
        Some("document_end") | Some("document-end") => "document-end".into(),
        Some("document_idle") | Some("document-idle") | Some(_) | None => "document-idle".into(),
    }
}

fn slug(s: &str) -> String {
    let mut out = String::new();
    for ch in s.chars() {
        if ch.is_ascii_alphanumeric() {
            out.push(ch.to_ascii_lowercase());
        } else if !out.ends_with('-') && !out.is_empty() {
            out.push('-');
        }
    }
    out.trim_matches('-').to_string()
}

/// Normalisasi manifest.json menjadi `NormalizedExtension`.
pub fn normalize_manifest(manifest: &str) -> Result<NormalizedExtension, String> {
    let v: Value = serde_json::from_str(manifest).map_err(|e| format!("JSON tidak valid: {e}"))?;
    let obj = v.as_object().ok_or("manifest bukan objek JSON")?;

    let name = obj
        .get("name")
        .and_then(|x| x.as_str())
        .filter(|s| !s.trim().is_empty())
        .ok_or("manifest tidak memiliki 'name'")?
        .to_string();
    let version = obj.get("version").and_then(|x| x.as_str()).unwrap_or("0.0").to_string();
    let manifest_version = obj.get("manifest_version").and_then(|x| x.as_u64()).unwrap_or(2) as u32;

    let str_list = |key: &str| -> Vec<String> {
        obj.get(key)
            .and_then(|x| x.as_array())
            .map(|a| a.iter().filter_map(|i| i.as_str().map(String::from)).collect())
            .unwrap_or_default()
    };

    let mut content_scripts = Vec::new();
    if let Some(cs) = obj.get("content_scripts").and_then(|x| x.as_array()) {
        for item in cs {
            let Some(io) = item.as_object() else { continue };
            let get_strs = |key: &str| -> Vec<String> {
                io.get(key)
                    .and_then(|x| x.as_array())
                    .map(|a| a.iter().filter_map(|i| i.as_str().map(String::from)).collect())
                    .unwrap_or_default()
            };
            let js = get_strs("js");
            let css = get_strs("css");
            let matches = get_strs("matches");
            if matches.is_empty() || (js.is_empty() && css.is_empty()) {
                continue;
            }
            content_scripts.push(NormalizedContentScript {
                matches,
                exclude_matches: get_strs("exclude_matches"),
                js,
                css,
                run_at: norm_run_at(io.get("run_at").and_then(|x| x.as_str())),
                all_frames: io.get("all_frames").and_then(|x| x.as_bool()).unwrap_or(false),
            });
        }
    }

    let background = obj.get("background").and_then(|x| x.as_object());
    let (has_background, background_kind) = match background {
        Some(b) if b.get("service_worker").is_some() => (true, Some("service_worker".to_string())),
        Some(b) if b.get("scripts").is_some() => (true, Some("scripts".to_string())),
        _ => (false, None),
    };

    let icons = obj
        .get("icons")
        .and_then(|x| x.as_object())
        .map(|m| m.values().filter_map(|v| v.as_str().map(String::from)).collect())
        .unwrap_or_default();

    let id = obj
        .get("id")
        .and_then(|x| x.as_str())
        .map(String::from)
        .unwrap_or_else(|| format!("{}@{}", slug(&name), version));

    Ok(NormalizedExtension {
        id,
        name,
        version,
        description: obj.get("description").and_then(|x| x.as_str()).map(String::from),
        manifest_version,
        permissions: str_list("permissions"),
        host_permissions: str_list("host_permissions"),
        content_scripts,
        has_background,
        background_kind,
        options_page: obj
            .get("options_page")
            .and_then(|x| x.as_str())
            .or_else(|| obj.get("options_ui").and_then(|x| x.as_object()).and_then(|o| o.get("page")).and_then(|x| x.as_str()))
            .map(String::from),
        icons,
    })
}

/// Indeks content_scripts yang cocok untuk URL (dan opsional run_at tertentu).
pub fn content_scripts_matching(
    ext: &NormalizedExtension,
    url_str: &str,
    run_at: Option<&str>,
) -> Result<Vec<usize>, String> {
    let Ok(url) = Url::parse(url_str) else { return Ok(vec![]) };
    if url.scheme() != "http" && url.scheme() != "https" {
        return Ok(vec![]);
    }
    let mut out = Vec::new();
    for (i, cs) in ext.content_scripts.iter().enumerate() {
        if let Some(ra) = run_at {
            if cs.run_at != ra {
                continue;
            }
        }
        if cs.excludes_url(&url, url_str) {
            continue;
        }
        if cs.matches.iter().any(|m| entry_matches(m, &url, url_str)) {
            out.push(i);
        }
    }
    Ok(out)
}

impl NormalizedContentScript {
    fn excludes_url(&self, url: &Url, url_str: &str) -> bool {
        self.exclude_matches.iter().any(|m| entry_matches(m, url, url_str))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const MANIFEST: &str = r#"{
      "manifest_version": 3,
      "name": "Darkify Semua",
      "version": "1.0.0",
      "description": "Filter gelap sederhana",
      "permissions": ["storage", "activeTab"],
      "host_permissions": ["<all_urls>"],
      "background": { "service_worker": "sw.js" },
      "content_scripts": [{
        "matches": ["https://example.com/*", "*://*.wikipedia.org/*"],
        "exclude_matches": ["https://id.wikipedia.org/wiki/Istimewa:*"],
        "js": ["content.js"],
        "css": ["dark.css"],
        "run_at": "document_start"
      }]
    }"#;

    #[test]
    fn normalize() {
        let ext = normalize_manifest(MANIFEST).unwrap();
        assert_eq!(ext.name, "Darkify Semua");
        assert_eq!(ext.manifest_version, 3);
        assert_eq!(ext.content_scripts.len(), 1);
        assert_eq!(ext.content_scripts[0].run_at, "document-start");
        assert_eq!(ext.content_scripts[0].js, vec!["content.js"]);
        assert!(ext.has_background);
        assert_eq!(ext.background_kind.as_deref(), Some("service_worker"));
        assert_eq!(ext.permissions.len(), 2);
        assert!(ext.id.contains("darkify-semua"));
    }

    #[test]
    fn matching() {
        let ext = normalize_manifest(MANIFEST).unwrap();
        let all = content_scripts_matching(&ext, "https://example.com/x", None).unwrap();
        assert_eq!(all, vec![0]);
        let start = content_scripts_matching(&ext, "https://example.com/x", Some("document-start")).unwrap();
        assert_eq!(start, vec![0]);
        let idle = content_scripts_matching(&ext, "https://example.com/x", Some("document-idle")).unwrap();
        assert!(idle.is_empty());
        let wiki = content_scripts_matching(&ext, "https://id.wikipedia.org/wiki/Halo", None).unwrap();
        assert_eq!(wiki, vec![0]);
        let excluded = content_scripts_matching(&ext, "https://id.wikipedia.org/wiki/Istimewa:Statistik", None).unwrap();
        assert!(excluded.is_empty());
        let other = content_scripts_matching(&ext, "https://google.com/", None).unwrap();
        assert!(other.is_empty());
    }

    #[test]
    fn missing_name_fails() {
        assert!(normalize_manifest("{\"manifest_version\":2}").is_err());
        assert!(normalize_manifest("bukan json").is_err());
    }
}
