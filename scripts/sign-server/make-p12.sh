#!/usr/bin/env bash
# Ghép khoá ký cho zsign: KHOÁ RIÊNG (từ máy Mac của chủ shop) + CHUỖI CHỨNG CHỈ Apple.
#
# Vì sao cần ghép: zsign đòi p12 có đủ chuỗi (leaf → Apple WWDR → Apple Root), nếu chỉ có khoá
# trơ thì báo "Unknown issuer hash … no usable CA chain" và ký hỏng.
#
# Dùng trên node-2:
#   /root/flowvpn-sign/make-p12.sh <key-in.p12|key.pem> <mật-khẩu-khoá-vào> <mật-khẩu-p12-ra>
set -euo pipefail
SIGN_DIR="${SIGN_DIR:-/root/flowvpn-sign}"
IN="${1:?thiếu file khoá vào (p12 hoặc pem)}"; IN_PASS="${2:-}"; OUT_PASS="${3:?thiếu mật khẩu cho p12 ra}"
OUT="$SIGN_DIR/dist.p12"

# 1) tách khoá riêng (+ cert lá nếu có) từ file vào
if openssl pkcs12 -in "$IN" -nocerts -nodes -passin "pass:$IN_PASS" -out "$SIGN_DIR/key.pem" 2>/dev/null; then
  echo "  nguồn: p12 (đã tách khoá riêng)"
else
  cp "$IN" "$SIGN_DIR/key.pem"
  echo "  nguồn: PEM"
fi

# 2) ghép khoá + chuỗi cert công khai (leaf lấy từ IPA, WWDR + Root lấy từ chữ ký đang phát)
openssl pkcs12 -export -out "$OUT" \
  -inkey "$SIGN_DIR/key.pem" \
  -in "$SIGN_DIR/cert_0.pem" \
  -certfile "$SIGN_DIR/chain.pem" \
  -passout "pass:$OUT_PASS" -name "Apple Distribution"
chmod 600 "$OUT" "$SIGN_DIR/key.pem"
printf '%s' "$OUT_PASS" > "$SIGN_DIR/dist.p12.pass"; chmod 600 "$SIGN_DIR/dist.p12.pass"
echo "  ✔ $OUT ($(stat -c %s "$OUT") bytes) + dist.p12.pass (0600)"
echo "  kiểm chuỗi trong p12:"
openssl pkcs12 -in "$OUT" -nokeys -passin "pass:$OUT_PASS" 2>/dev/null | openssl crl2pkcs7 -nocrl -certfile /dev/stdin 2>/dev/null | openssl pkcs7 -print_certs -noout 2>/dev/null | grep subject | sed 's/^/    /' || true
