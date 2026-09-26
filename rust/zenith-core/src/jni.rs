//! Lapisan JNI — fungsi-fungsi yang dipanggil dari Kotlin
//! (`com.zenith.browser.core.ZenithCoreJNI`, semua `@JvmStatic`).
//!
//! Konvensi: masukan/keluaran berupa JSON string agar JNI tetap sederhana;
//! kegagalan parse dikembalikan sebagai `{"ok":false,"error":"..."}`.

use jni::objects::{JClass, JString};
use jni::sys::{jboolean, JNI_FALSE, JNI_TRUE};
use jni::JNIEnv;
use serde_json::json;

use crate::adblock;
use crate::extension::{content_scripts_matching, normalize_manifest, NormalizedExtension};
use crate::urlkit;
use crate::userscript::{self, UserScriptMeta};

fn ret<'local>(env: &mut JNIEnv<'local>, s: String) -> JString<'local> {
    env.new_string(s).expect("Gagal membuat JString")
}

fn to_rust(env: &mut JNIEnv, s: &JString) -> String {
    if s.is_null() {
        return String::new();
    }
    env.get_string(s).map(|x| x.into()).unwrap_or_default()
}

fn jbool(b: bool) -> jboolean {
    if b { JNI_TRUE } else { JNI_FALSE }
}

// ---------------------------------------------------------------- identitas

#[no_mangle]
pub extern "system" fn Java_com_zenith_browser_core_ZenithCoreJNI_coreVersion<'local>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
) -> JString<'local> {
    let out = json!({ "ok": true, "version": crate::CORE_VERSION, "engine": "rust" }).to_string();
    ret(&mut env, out)
}

// --------------------------------------------------------------- userscript

#[no_mangle]
pub extern "system" fn Java_com_zenith_browser_core_ZenithCoreJNI_parseUserScript<'local>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    src: JString<'local>,
) -> JString<'local> {
    let src_s = to_rust(&mut env, &src);
    let parsed = userscript::parse_user_script(&src_s);
    let out = json!({
        "ok": true,
        "hasHeader": parsed.has_header,
        "meta": parsed.meta,
        "body": parsed.body,
    })
    .to_string();
    ret(&mut env, out)
}

#[no_mangle]
pub extern "system" fn Java_com_zenith_browser_core_ZenithCoreJNI_matchUserScript<'local>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    meta_json: JString<'local>,
    url: JString<'local>,
) -> jboolean {
    let meta_s = to_rust(&mut env, &meta_json);
    let url_s = to_rust(&mut env, &url);
    let result = serde_json::from_str::<UserScriptMeta>(&meta_s)
        .map_err(|e| e.to_string())
        .and_then(|meta| userscript::matches_url(&meta, &url_s));
    jbool(result.unwrap_or(false))
}

// --------------------------------------------------------------- ekstensi

#[no_mangle]
pub extern "system" fn Java_com_zenith_browser_core_ZenithCoreJNI_parseExtensionManifest<'local>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    manifest_json: JString<'local>,
) -> JString<'local> {
    let manifest_s = to_rust(&mut env, &manifest_json);
    let out = match normalize_manifest(&manifest_s) {
        Ok(ext) => json!({ "ok": true, "extension": ext }),
        Err(e) => json!({ "ok": false, "error": e }),
    }
    .to_string();
    ret(&mut env, out)
}

#[no_mangle]
pub extern "system" fn Java_com_zenith_browser_core_ZenithCoreJNI_extensionScriptsFor<'local>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    ext_json: JString<'local>,
    url: JString<'local>,
    run_at: JString<'local>,
) -> JString<'local> {
    let ext_s = to_rust(&mut env, &ext_json);
    let url_s = to_rust(&mut env, &url);
    let run_at_s = to_rust(&mut env, &run_at);
    let run_at = if run_at_s.is_empty() { None } else { Some(run_at_s.as_str()) };
    let out = match serde_json::from_str::<NormalizedExtension>(&ext_s)
        .map_err(|e| e.to_string())
        .and_then(|ext| content_scripts_matching(&ext, &url_s, run_at).map_err(|e| e.to_string()))
    {
        Ok(indices) => json!({ "ok": true, "indices": indices }),
        Err(e) => json!({ "ok": false, "error": e }),
    }
    .to_string();
    ret(&mut env, out)
}

// --------------------------------------------------------------- adblock

#[no_mangle]
pub extern "system" fn Java_com_zenith_browser_core_ZenithCoreJNI_adblockInit<'local>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    hosts: JString<'local>,
    mode: JString<'local>,
) -> JString<'local> {
    let hosts_s = to_rust(&mut env, &hosts);
    let mode_s = to_rust(&mut env, &mode);
    let total = adblock::with_engine(|e| e.load_user_list(&hosts_s, &mode_s));
    let out = json!({ "ok": true, "hosts": total }).to_string();
    ret(&mut env, out)
}

#[no_mangle]
pub extern "system" fn Java_com_zenith_browser_core_ZenithCoreJNI_adblockSetEnabled(
    _env: JNIEnv,
    _class: JClass,
    enabled: jboolean,
) {
    adblock::with_engine(|e| e.enabled = enabled == JNI_TRUE);
}

#[no_mangle]
pub extern "system" fn Java_com_zenith_browser_core_ZenithCoreJNI_adblockAllowHost<'local>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    host: JString<'local>,
    allow: jboolean,
) {
    let host_s = to_rust(&mut env, &host);
    adblock::with_engine(|e| e.set_allow(&host_s, allow == JNI_TRUE));
}

/// Dipanggil dari `ZenithWebViewClient` (Kotlin) untuk setiap sub-sumber daya.
#[no_mangle]
pub extern "system" fn Java_com_zenith_browser_core_ZenithCoreJNI_adblockShouldBlock<'local>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    url: JString<'local>,
) -> jboolean {
    let url_s = to_rust(&mut env, &url);
    let blocked = adblock::with_engine(|e| e.should_block(&url_s));
    jbool(blocked)
}

#[no_mangle]
pub extern "system" fn Java_com_zenith_browser_core_ZenithCoreJNI_adblockStats<'local>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
) -> JString<'local> {
    let stats = adblock::with_engine(|e| e.stats());
    let out = json!({ "ok": true, "stats": stats }).to_string();
    ret(&mut env, out)
}

#[no_mangle]
pub extern "system" fn Java_com_zenith_browser_core_ZenithCoreJNI_adblockResetStats(
    _env: JNIEnv,
    _class: JClass,
) {
    adblock::with_engine(|e| e.blocked_count = 0);
}

// --------------------------------------------------------------- URL kit

#[no_mangle]
pub extern "system" fn Java_com_zenith_browser_core_ZenithCoreJNI_normalizeInput<'local>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    input: JString<'local>,
    search_template: JString<'local>,
) -> JString<'local> {
    let input_s = to_rust(&mut env, &input);
    let template_s = to_rust(&mut env, &search_template);
    ret(&mut env, urlkit::normalize_input(&input_s, &template_s))
}

#[no_mangle]
pub extern "system" fn Java_com_zenith_browser_core_ZenithCoreJNI_expandSearch<'local>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    template: JString<'local>,
    query: JString<'local>,
) -> JString<'local> {
    let t = to_rust(&mut env, &template);
    let q = to_rust(&mut env, &query);
    ret(&mut env, urlkit::expand_search(&t, &q))
}

#[no_mangle]
pub extern "system" fn Java_com_zenith_browser_core_ZenithCoreJNI_hostOf<'local>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    url: JString<'local>,
) -> JString<'local> {
    let u = to_rust(&mut env, &url);
    ret(&mut env, urlkit::host_of(&u))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn json_roundtrip_userscript() {
        let meta = UserScriptMeta {
            name: Some("Tes".into()),
            matches: vec!["*://*/*".into()],
            ..Default::default()
        };
        let s = serde_json::to_string(&meta).unwrap();
        let back: UserScriptMeta = serde_json::from_str(&s).unwrap();
        assert_eq!(back.matches, vec!["*://*/*".to_string()]);
        assert_eq!(back.run_at, "document-idle");
    }

    #[test]
    fn extension_json_camelcase() {
        let ext = normalize_manifest(
            r#"{"name":"X","version":"1","content_scripts":[{"matches":["*://*/*"],"js":["a.js"]}]}"#,
        )
        .unwrap();
        let v = serde_json::to_value(&ext).unwrap();
        assert!(v["manifestVersion"].is_number());
        assert_eq!(v["contentScripts"][0]["runAt"], "document-idle");
    }
}
