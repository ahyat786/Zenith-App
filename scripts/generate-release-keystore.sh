#!/usr/bin/env bash
# Rotasi kunci rilis Zenith — generate keystore baru + panduan set ulang GitHub Secrets.
#
# Kapan dipakai: kunci lama dicurigai bocor, atau ingin mengganti identitas penandatangan.
# CATATAN: APK yang ditandatangani kunci baru TIDAK bisa meng-update instalasi
# yang ditandatangani kunci lama (harus uninstall dulu).
#
# Setelah menjalankan skrip ini:
#   1. Buka GitHub → Settings → Secrets and variables → Actions (repo Zenith-App)
#   2. Perbarui 4 secret:
#        ZENITH_KEYSTORE_BASE64  = keluaran base64 skrip ini
#        ZENITH_KEYSTORE_PASSWORD = password yang dicetak
#        ZENITH_KEYSTORE_ALIAS    = zenith
#        ZENITH_KEY_PASSWORD      = password yang dicetak
#   3. Simpan keystore + password di tempat aman (password manager).
set -euo pipefail

PASS=$(openssl rand -base64 24)
TMP=$(mktemp -d)

openssl req -x509 -newkey rsa:4096 -sha256 -days 10950 -nodes \
  -subj "/CN=Zenith Browser/O=Zenith/C=ID" \
  -keyout "$TMP/key.pem" -out "$TMP/cert.pem" 2>/dev/null

openssl pkcs12 -export -name zenith \
  -inkey "$TMP/key.pem" -in "$TMP/cert.pem" \
  -passout "pass:$PASS" -out zenith-release.keystore

rm -rf "$TMP"

echo "✓ Keystore baru: $(pwd)/zenith-release.keystore (alias: zenith)"
echo ""
echo "PASSWORD (simpan di password manager):"
echo "  $PASS"
echo ""
echo "Nilai ZENITH_KEYSTORE_BASE64:"
base64 -w0 zenith-release.keystore
echo ""
