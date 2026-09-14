#!/usr/bin/env bash
# Thêm UDID mới (khách vừa đăng ký) → ký lại IPA bản ad-hoc → upload Diawi → đổi link tải.
#
# Vì sao cần: bản IPA ad-hoc chỉ cài được lên máy có UDID trong provisioning profile, nên mỗi máy
# mới phải ký lại app (KHÔNG cần build lại — chỉ re-sign với profile mới). Script này làm trọn vòng:
#
#   1. lấy danh sách UDID khách vừa đăng ký từ server (data/ios-devices.json qua API admin)
#   2. thêm UDID vào App Store Connect (API key) nếu chưa có
#   3. archive + export lại bản **ad-hoc** (profile mới chứa UDID mới)  ← hoặc re-sign IPA có sẵn
#   4. upload IPA lên Diawi, lấy link mới (30 ngày, bật find_by_udid)
#   5. PATCH app-config (ipa_url + ipa_build) để app + trang buy dùng link mới
#   6. báo server "đã ký lại" ⇒ trang chờ của khách tự hiện nút Cài đặt
#
# Chạy TỪ MÁY MAC (cần Xcode + khoá ASC). Ví dụ:
#   scripts/ios-add-udid.sh                 # xử lý hết UDID đang chờ
#   scripts/ios-add-udid.sh --list          # chỉ xem đang chờ máy nào
#   scripts/ios-add-udid.sh --dry-run       # thêm UDID + export nhưng không upload/không PATCH
#
# Cần: ASC_KEY_ID / ASC_ISSUER_ID (mặc định đọc từ ~/.appstoreconnect), key ở
# ~/.appstoreconnect/private_keys/AuthKey_<KEY_ID>.p8, và token Diawi ở /root/.diawi-token trên node-2.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

NODE2="${NODE2:-root@165.101.114.162}"
KEY="${KEY:-$HOME/.ssh/fpt_vpn_node}"
KEY_ID="${ASC_KEY_ID:-8GW3662G64}"
ISSUER="${ASC_ISSUER_ID:-7a64d085-c03d-4b10-9b96-ff8e00c42e79}"
P8="${ASC_KEY_PATH:-$HOME/.appstoreconnect/private_keys/AuthKey_${KEY_ID}.p8}"
TEAM="${TEAM_ID:-G6XW3RN6LJ}"
BUNDLE="${BUNDLE_ID:-com.privatevpn.app}"
DIAWI_DAYS="${DIAWI_DAYS:-30}"
LIST_ONLY=0; DRY_RUN=0
for a in "$@"; do
  case "$a" in
    --list) LIST_ONLY=1 ;;
    --dry-run) DRY_RUN=1 ;;
    *) echo "usage: $0 [--list|--dry-run]" >&2; exit 2 ;;
  esac
done

SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=12 -o StrictHostKeyChecking=accept-new)
[ -f "$KEY" ] && SSH_OPTS+=(-i "$KEY")
log() { printf '  %s\n' "$*"; }
die() { printf 'LỖI: %s\n' "$*" >&2; exit 1; }

T=$(ssh "${SSH_OPTS[@]}" "$NODE2" 'systemctl show flowvpn-cp -p Environment | tr " " "\n" | grep "^AUTH_TOKEN=" | cut -d= -f2-')
[ -n "$T" ] || die "không lấy được AUTH_TOKEN trên node-2"
api() { ssh "${SSH_OPTS[@]}" "$NODE2" "curl -s -H 'Authorization: Bearer $T' '$@'"; }
api_post() { ssh "${SSH_OPTS[@]}" "$NODE2" "curl -s -X POST -H 'Authorization: Bearer $T' -H 'content-type: application/json' -d '$2' '$1'"; }

# ---------- ASC JWT (ES256 raw — Apple KHÔNG nhận chữ ký DER của openssl) ----------
asc_jwt() {
  python3 - "$KEY_ID" "$ISSUER" "$P8" <<'PY'
import base64, json, subprocess, sys, time
key_id, issuer, key_path = sys.argv[1], sys.argv[2], sys.argv[3]
def b64url(b): return base64.urlsafe_b64encode(b).rstrip(b"=").decode()
def der_to_raw(der):
    i = 0
    assert der[i] == 0x30; i += 1
    l = der[i]; i += 1
    if l & 0x80: i += l & 0x7f
    assert der[i] == 0x02; i += 1
    rl = der[i]; i += 1; r = der[i:i+rl]; i += rl
    assert der[i] == 0x02; i += 1
    sl = der[i]; i += 1; s = der[i:i+sl]
    return r.lstrip(b"\0").rjust(32, b"\0") + s.lstrip(b"\0").rjust(32, b"\0")
now = int(time.time())
h = b64url(json.dumps({"alg": "ES256", "kid": key_id, "typ": "JWT"}, separators=(",", ":")).encode())
p = b64url(json.dumps({"iss": issuer, "iat": now, "exp": now + 900, "aud": "appstoreconnect-v1"}, separators=(",", ":")).encode())
der = subprocess.run(["openssl", "dgst", "-sha256", "-sign", key_path], input=f"{h}.{p}".encode(), capture_output=True, check=True).stdout
print(f"{h}.{p}.{b64url(der_to_raw(der))}")
PY
}
asc() { # asc <method> <path> [json-body]
  local method="$1" path="$2" body="${3:-}"
  local jwt; jwt="$(asc_jwt)"
  if [ -n "$body" ]; then
    curl -sS -X "$method" -H "Authorization: Bearer $jwt" -H "Content-Type: application/json" -d "$body" "https://api.appstoreconnect.apple.com$path"
  else
    curl -sS -X "$method" -H "Authorization: Bearer $jwt" "https://api.appstoreconnect.apple.com$path"
  fi
}

log "1) UDID khách vừa đăng ký (hàng đợi trên server)"
QUEUE="$(api "http://127.0.0.1:7778/v1/admin/ios/devices")"
echo "$QUEUE" | python3 -c '
import json,sys
d = json.load(sys.stdin)
pend = [x for x in d["devices"] if not x.get("built")]
print(f"     tổng {len(d[\"devices\"])} thiết bị · đang chờ ký lại: {len(pend)} · buildSerial={d[\"buildSerial\"]}")
for x in pend: print("      -", x["udid"], x.get("model"), x.get("iosVersion"), x.get("registeredAt"))
'
PENDING=$(echo "$QUEUE" | python3 -c 'import json,sys; print("\n".join(x["udid"]+"|"+(x.get("model") or "") for x in json.load(sys.stdin)["devices"] if not x.get("built")))')
[ "$LIST_ONLY" = "1" ] && exit 0
[ -n "$PENDING" ] || { log "không có máy nào đang chờ — không cần ký lại"; exit 0; }

log "2) thêm UDID vào App Store Connect (bỏ qua máy đã có)"
REGISTERED="$(asc GET "/v1/devices?limit=200" | python3 -c 'import json,sys; print("\n".join(x["attributes"]["udid"] for x in json.load(sys.stdin).get("data", [])))')"
ADDED=0
while IFS='|' read -r udid model; do
  [ -n "$udid" ] || continue
  if printf '%s\n' "$REGISTERED" | grep -qxF "$udid"; then
    log "     đã có sẵn: $udid"
    continue
  fi
  name="${model:-iPhone của khách}"
  out="$(asc POST /v1/devices "{\"data\":{\"type\":\"devices\",\"attributes\":{\"name\":\"$name\",\"udid\":\"$udid\",\"platform\":\"IOS\"}}}")"
  if echo "$out" | grep -q '"id"'; then log "     + đã thêm: $udid ($name)"; ADDED=$((ADDED+1));
  else log "     ! lỗi khi thêm $udid: $(echo "$out" | head -c 200)"; fi
done <<< "$PENDING"

log "3) export lại IPA bản ad-hoc (profile mới đã gồm UDID vừa thêm)"
if [ "$DRY_RUN" = "1" ]; then
  log "     --dry-run: bỏ qua build/upload/PATCH"
  exit 0
fi
bash scripts/archive-appstore.sh ios adhoc
IPA="build/ios-adhoc-export/ipa/PrivateVPN.ipa"
[ -f "$IPA" ] || IPA="$(ls -t build/ios-adhoc-export/ipa/*.ipa 2>/dev/null | head -1)"
[ -f "$IPA" ] || die "không thấy IPA sau khi export (xem build/ios-adhoc-export/)"
log "     IPA: $IPA"

log "4) upload lên Diawi"
DIAWI_JSON="$(ssh "${SSH_OPTS[@]}" "$NODE2" "cat '$IPA' > /root/flowvpn-ipa/VPNFlow-latest.ipa 2>/dev/null" || true)"
scp "${SSH_OPTS[@]}" "$IPA" "$NODE2:/root/flowvpn-ipa/VPNFlow-latest.ipa" >/dev/null
LINK="$(ssh "${SSH_OPTS[@]}" "$NODE2" "cd /root && DIAWI_TOKEN=\$(cat /root/.diawi-token) node /root/diawi-upload.mjs --file /root/flowvpn-ipa/VPNFlow-latest.ipa --days $DIAWI_DAYS --find-by-udid --comment 'VPNFlow iOS ad-hoc (UDID cập nhật)' --json" | python3 -c 'import json,sys; print(json.load(sys.stdin)["link"])')"
[ -n "$LINK" ] || die "upload Diawi không trả về link"
log "     link mới: $LINK"

log "5) đổi link trong app-config (app + trang buy dùng ngay)"
api_post "http://127.0.0.1:7778/v1/admin/app-version" "{\"ipa_url\":\"$LINK\"}" >/dev/null

log "6) báo server đã ký lại ⇒ trang chờ của khách tự hiện nút Cài đặt"
api_post "http://127.0.0.1:7778/v1/admin/ios/devices/built" "{\"note\":\"adhoc re-sign, +$ADDED UDID\"}" >/dev/null

log "XONG — khách mở lại /install/ios là bấm cài được (link: $LINK)"
