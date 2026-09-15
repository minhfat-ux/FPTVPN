#!/usr/bin/env bash
# Export khoá ký "Apple Distribution" ra .p12 — để MÁY KÝ LINUX (node-1) ký lại IPA mà không cần Mac.
#
# Chạy 1 lần, TẠI TERMINAL TRÊN MAC (phải là phiên đăng nhập của chủ máy):
#   bash scripts/ios-export-signing-key.sh
#
# macOS sẽ HIỆN HỘP THOẠI hỏi mật khẩu keychain (= mật khẩu đăng nhập Mac) → nhập vào đó.
# Không nhập được (chạy qua ssh/agent) là lỗi "user name or passphrase you entered is not correct".
set -euo pipefail
OUT="${1:-$HOME/flowvpn-dist.p12}"
PASS="${EXPORT_PASS:-FlowVPN-Sign-2026!}"
IDENTITY="Apple Distribution: Minh Nguyen (G6XW3RN6LJ)"

if [ -f "$OUT" ]; then
  echo "Đã có $OUT rồi. Muốn export lại thì xoá trước: rm \"$OUT\"" >&2
  exit 1
fi

echo "→ Sắp export identity: $IDENTITY"
echo "→ macOS sẽ hỏi MẬT KHẨU KEYCHAIN (mật khẩu đăng nhập Mac) — nhập vào hộp thoại hiện ra."
security export -t identities -f pkcs12 -P "$PASS" -o "$OUT" "$IDENTITY"
chmod 600 "$OUT"

echo "✔ $OUT ($(stat -f%z "$OUT") bytes, quyền 600)"
echo "→ chứng chỉ trong file:"
openssl pkcs12 -in "$OUT" -nokeys -passin "pass:$PASS" 2>/dev/null \
  | openssl crl2pkcs7 -nocrl -certfile /dev/stdin 2>/dev/null \
  | openssl pkcs7 -print_certs -noout 2>/dev/null | grep subject | sed 's/^/   /'
if openssl pkcs12 -in "$OUT" -nocerts -nodes -passin "pass:$PASS" 2>/dev/null | openssl pkey -noout >/dev/null 2>&1; then
  echo "   ✔ CÓ khoá riêng trong file"
else
  echo "   ✗ THIẾU khoá riêng — phải export từ mục 'My Certificates' (có cả cert + key)"
fi
echo
echo "Xong thì nhắn agent: \"đã export\" (đường dẫn: $OUT)"
