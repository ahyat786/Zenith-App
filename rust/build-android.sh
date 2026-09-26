#!/usr/bin/env bash
# Zenith Browser — build Rust core (libzenith_core.so) untuk Android.
# Dipanggil otomatis oleh Gradle (task buildRustCore) sebelum preBuild.
#
# Lewati dengan:  ./gradlew assembleRelease -Pzenith.skipRust=1
# (berguna bila .so sudah tersedia di jniLibs dan mesin tidak punya toolchain Rust)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
JNILIBS="$ROOT/android/app/src/main/jniLibs"
ABIS=(${ZENITH_RUST_ABIS:-arm64-v8a armeabi-v7a x86_64 x86})

if [ "${ZENITH_SKIP_RUST:-0}" = "1" ]; then
  echo "[rust] ZENITH_SKIP_RUST=1 — lewati build Rust"
  exit 0
fi

if ! command -v cargo-ndk >/dev/null 2>&1; then
  if ls "$JNILIBS"/*/libzenith_core.so >/dev/null 2>&1; then
    echo "[rust] cargo-ndk tidak ada, tapi .so lama tersedia — pakai yang ada."
    exit 0
  fi
  echo "ERROR: cargo-ndk tidak ditemukan. Instal dengan:" >&2
  echo "  cargo install cargo-ndk && rustup target add aarch64-linux-android armv7-linux-androideabi x86_64-linux-android i686-linux-android" >&2
  exit 1
fi

# Cari NDK
NDK_DIR="${ANDROID_NDK_HOME:-${ANDROID_NDK_ROOT:-}}"
if [ -z "$NDK_DIR" ] && [ -n "${ANDROID_HOME:-}" ]; then
  NDK_DIR="$(ls -d "$ANDROID_HOME"/ndk/* 2>/dev/null | sort -V | tail -1 || true)"
fi
if [ -z "$NDK_DIR" ] && [ -d "$HOME/Android/Sdk/ndk" ]; then
  NDK_DIR="$(ls -d "$HOME/Android/Sdk/ndk"/* 2>/dev/null | sort -V | tail -1 || true)"
fi
if [ -z "$NDK_DIR" ]; then
  echo "ERROR: NDK tidak ditemukan. Set ANDROID_NDK_HOME atau ANDROID_HOME." >&2
  exit 1
fi
echo "[rust] NDK: $NDK_DIR"

triple_for() {
  case "$1" in
    arm64-v8a) echo aarch64-linux-android ;;
    armeabi-v7a) echo armv7-linux-androideabi ;;
    x86_64) echo x86_64-linux-android ;;
    x86) echo i686-linux-android ;;
    *) echo "" ;;
  esac
}

mkdir -p "$JNILIBS"
cd "$ROOT/rust"

for abi in "${ABIS[@]}"; do
  triple="$(triple_for "$abi")"
  if [ -z "$triple" ]; then
    echo "[rust] ABI tidak dikenal: $abi (lewati)"
    continue
  fi
  echo "[rust] build $abi ($triple) — release"
  ANDROID_NDK_HOME="$NDK_DIR" cargo ndk -t "$triple" -o "$JNILIBS" build --release -p zenith-core
done

ls -la "$JNILIBS"/*/libzenith_core.so
echo "[rust] selesai — .so ditulis ke $JNILIBS"
