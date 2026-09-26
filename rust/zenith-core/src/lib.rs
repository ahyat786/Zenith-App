//! Zenith Browser — inti logika berbasis Rust.
//!
//! Dipanggil dari React Native melalui JNI (modul `jni`) dan dari
//! `ZenithWebViewClient` (Kotlin) untuk pemblokiran permintaan jaringan.

pub mod adblock;
pub mod extension;
pub mod jni;
pub mod pattern;
pub mod urlkit;
pub mod userscript;

pub const CORE_VERSION: &str = env!("CARGO_PKG_VERSION");
