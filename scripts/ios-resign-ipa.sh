#!/usr/bin/env bash
# KÝ LẠI một IPA ad-hoc đã có — KHÔNG build lại code.
#
# Vì sao cần: khách mới đăng ký ⇒ UDID mới phải nằm trong provisioning profile. Bản thân app
# KHÔNG đổi, nên không phải biên dịch lại: chỉ cần (1) cập nhật profile Ad Hoc qua App Store
# Connect API cho đủ UDID, (2) thay profile + ký lại .appex rồi .app, (3) zip lại thành IPA.
# Nhanh vài giây, không cần Xcode, không cần archive.
#
# Dùng:
#   scripts/ios-resign-ipa.sh                       # ký lại IPA đang phát (tải từ server) rồi upload + báo đã ký
#   scripts/ios-resign-ipa.sh --src <file.ipa>      # ký lại file IPA chỉ định
#   scripts/ios-resign-ipa.sh --no-upload           # chỉ tạo IPA mới ở build/ios-resign/
#
# Cần: chứng chỉ "Apple Distribution: … (TEAM)" trong keychain, API key ASC ở
# ~/.appstoreconnect/private_keys/AuthKey_<KEY_ID>.p8 (mặc định 8GW3662G64).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"; cd "$ROOT"

NODE1="${NODE1:-root@100.76.147.111}"; NODE2_IP="${NODE2_IP:-165.101.114.162}"
SSH_KEY="${KEY:-$HOME/.ssh/fpt_tunnel}"
KEY_ID="${ASC_KEY_ID:-8GW3662G64}"; ISSUER="${ASC_ISSUER_ID:-7a64d085-c03d-4b10-9b96-ff8e00c42e79}"
P8="${ASC_KEY_PATH:-$HOME/.appstoreconnect/private_keys/AuthKey_${KEY_ID}.p8}"
TEAM="${TEAM_ID:-G6XW3RN6LJ}"
IDENTITY="${SIGN_IDENTITY:-Apple Distribution}"
OUT_DIR="${OUT_DIR:-build/ios-resign}"
SERVED_URL="${SERVED_URL:-https://meetflowai.site/v1/downloads/ios}"

SRC=""; UPLOAD=1
while [ $# -gt 0 ]; do
  case "$1" in
    --src) SRC="$2"; shift 2;;
    --no-upload) UPLOAD=0; shift;;
    *) echo "usage: $0 [--src file.ipa] [--no-upload]" >&2; exit 2;;
  esac
done

log() { printf '  %s\n' "$*"; }
die() { printf 'LỖI: %s\n' "$*" >&2; exit 1; }

[ -f "$P8" ] || die "không thấy API key $P8"
security find-identity -v -p codesigning | grep -q "$IDENTITY" || die "không thấy chứng chỉ '$IDENTITY' trong keychain"

mkdir -p "$OUT_DIR"
if [ -z "$SRC" ]; then
  SRC="$OUT_DIR/source.ipa"
  log "1) tải IPA đang phát: $SERVED_URL"
  curl -fsS --max-time 300 "$SERVED_URL" -o "$SRC" || die "không tải được IPA đang phát"
fi
[ -f "$SRC" ] || die "không thấy file IPA: $SRC"
log "   nguồn: $SRC ($(stat -f%z "$SRC") bytes, sha256 $(shasum -a 256 "$SRC" | cut -c1-16)…)"

# ---------- JWT ES256 raw + gọi API Apple ----------
mkjwt() {
  python3 - "$KEY_ID" "$ISSUER" "$P8" <<'PY'
import base64, json, subprocess, sys, time
key_id, issuer, p8 = sys.argv[1], sys.argv[2], sys.argv[3]
def b64(b): return base64.urlsafe_b64encode(b).rstrip(b"=")
now = int(time.time())
head = b64(json.dumps({"alg": "ES256", "kid": key_id, "typ": "JWT"}, separators=(",", ":")).encode())
body = b64(json.dumps({"iss": issuer, "iat": now, "exp": now + 900, "aud": "appstoreconnect-v1"}, separators=(",", ":")).encode())
signing = head + b"." + body
der = subprocess.run(["openssl", "dgst", "-sha256", "-sign", p8], input=signing, capture_output=True, check=True).stdout
# DER(SEQUENCE{INTEGER r, INTEGER s}) -> raw r||s 64 byte (Apple KHÔNG nhận DER)
i, vals = 2, []
if der[1] & 0x80: i = 2 + (der[1] & 0x7F)
while len(vals) < 2:
    ln = der[i+1]; i += 2
    if ln & 0x80:
        n = ln & 0x7F; ln = int.from_bytes(der[i:i+n], "big"); i += n
    v = der[i:i+ln]; i += ln
    v = v.lstrip(b"\x00")
    vals.append(v.rjust(32, b"\x00"))
print((signing + b"." + b64(vals[0] + vals[1])).decode())
PY
}
asc() { local m="$1" p="$2" body="${3:-}" jwt; jwt="$(mkjwt)"
  if [ -n "$body" ]; then curl -sS -g -X "$m" -H "Authorization: Bearer $jwt" -H "Content-Type: application/json" -d "$body" "https://api.appstoreconnect.apple.com$p"
  else curl -sS -g -X "$m" -H "Authorization: Bearer $jwt" "https://api.appstoreconnect.apple.com$p"; fi
}
py() { python3 "$@"; }

log "2) cập nhật profile Ad Hoc cho ĐỦ UDID đang có trong tài khoản"
BID_APP=$(asc GET "/v1/bundleIds?filter[identifier]=com.privatevpn.app" | py -c 'import json,sys; print(json.load(sys.stdin)["data"][0]["id"])')
BID_EXT=$(asc GET "/v1/bundleIds?filter[identifier]=com.privatevpn.app.packet-tunnel" | py -c 'import json,sys; print(json.load(sys.stdin)["data"][0]["id"])')
CERT_ID=$(asc GET "/v1/certificates?filter[certificateType]=DISTRIBUTION&limit=1" | py -c 'import json,sys; print(json.load(sys.stdin)["data"][0]["id"])')
DEV_IDS=$(asc GET "/v1/devices?filter[platform]=IOS&limit=200" | py -c 'import json,sys; print(json.dumps([{"type":"devices","id":x["id"]} for x in json.load(sys.stdin)["data"]]))')
log "   bundle app=$BID_APP ext=$BID_EXT cert=$CERT_ID · thiết bị: $(printf '%s' "$DEV_IDS" | py -c 'import json,sys; print(len(json.load(sys.stdin)))')"

# Apple KHÔNG cho PATCH profile ⇒ xoá rồi tạo lại cùng tên (ExportOptions/ipa cũ vẫn trỏ đúng tên).
mk_profile() { # $1 tên  $2 bundle id  $3 profile id cũ
  [ -n "$3" ] && asc DELETE "/v1/profiles/$3" >/dev/null 2>&1 || true
  asc POST "/v1/profiles" "{\"data\":{\"type\":\"profiles\",\"attributes\":{\"name\":\"$1\",\"profileType\":\"IOS_APP_ADHOC\"},\"relationships\":{\"bundleId\":{\"data\":{\"type\":\"bundleIds\",\"id\":\"$2\"}},\"certificates\":{\"data\":[{\"type\":\"certificates\",\"id\":\"$CERT_ID\"}]},\"devices\":{\"data\":$DEV_IDS}}}}"
}
existing_id() { asc GET "/v1/profiles?filter[name]=$1&limit=1" | py -c 'import json,sys; d=json.load(sys.stdin)["data"]; print(d[0]["id"] if d else "")'; }
dl_profile() { # $1 json phản hồi  $2 file ra
  py - "$1" "$2" <<'PY'
import base64, json, sys
d = json.loads(open(sys.argv[1]).read()); a = d["data"]["attributes"]
open(sys.argv[2], "wb").write(base64.b64decode(a["profileContent"]))
print(f"   ✔ {a['name']} ({len(base64.b64decode(a['profileContent']))} bytes)")
PY
}
APP_NAME="VPNFlow AdHoc App"; EXT_NAME="VPNFlow AdHoc Tunnel"
mk_profile "$APP_NAME" "$BID_APP" "$(existing_id "VPNFlow%20AdHoc%20App")" > "$OUT_DIR/app-prof.json"
mk_profile "$EXT_NAME" "$BID_EXT" "$(existing_id "VPNFlow%20AdHoc%20Tunnel")" > "$OUT_DIR/ext-prof.json"
dl_profile "$OUT_DIR/app-prof.json" "$OUT_DIR/app.mobileprovision"
dl_profile "$OUT_DIR/ext-prof.json" "$OUT_DIR/ext.mobileprovision"

log "3) thay profile + ký lại (KHÔNG biên dịch lại)"
WORK="$OUT_DIR/work"; rm -rf "$WORK"; mkdir -p "$WORK"
ditto -x -k "$SRC" "$WORK"
APP=$(find "$WORK/Payload" -maxdepth 1 -name "*.app" | head -1)
[ -n "$APP" ] || die "IPA không có Payload/*.app"
APPEX=$(find "$APP/PlugIns" -maxdepth 1 -name "*.appex" 2>/dev/null | head -1 || true)

# Giữ nguyên entitlements mà binary đang có (lấy từ chính chữ ký cũ) — ký lại không được đổi quyền.
codesign -d --entitlements :- "$APP" > "$OUT_DIR/app.entitlements" 2>/dev/null || true
cp "$OUT_DIR/app.mobileprovision" "$APP/embedded.mobileprovision"
if [ -n "$APPEX" ]; then
  codesign -d --entitlements :- "$APPEX" > "$OUT_DIR/ext.entitlements" 2>/dev/null || true
  cp "$OUT_DIR/ext.mobileprovision" "$APPEX/embedded.mobileprovision"
  log "   ký lại: $(basename "$APPEX")"
  codesign --force --sign "$IDENTITY" --timestamp=none \
    --entitlements "$OUT_DIR/ext.entitlements" "$APPEX" 2>&1 | sed 's/^/     /' || \
  codesign --force --sign "$IDENTITY" --timestamp=none "$APPEX"
fi
log "   ký lại: $(basename "$APP")"
codesign --force --sign "$IDENTITY" --timestamp=none \
  --entitlements "$OUT_DIR/app.entitlements" "$APP" 2>&1 | sed 's/^/     /' || \
codesign --force --sign "$IDENTITY" --timestamp=none "$APP"

log "4) kiểm tra chữ ký + profile sau khi ký lại"
codesign --verify --deep --strict --verbose=2 "$APP" 2>&1 | tail -2 | sed 's/^/     /'
python3 - "$APP/embedded.mobileprovision" <<'PY'
import re, sys
raw = open(sys.argv[1], "rb").read().decode("utf-8", "replace")
udids = sorted(set(re.findall(r"[0-9A-F]{8}-[0-9A-F]{16}", raw)))
print(f"     UDID trong profile: {len(udids)}")
for u in udids: print("      -", u)
PY

NEW_IPA="$OUT_DIR/VPNFlow-resigned-$(date +%Y%m%d-%H%M%S).ipa"
( cd "$WORK" && ditto -c -k --sequesterRsrc --keepParent Payload "$ROOT/$NEW_IPA" )
log "5) IPA mới: $NEW_IPA ($(stat -f%z "$NEW_IPA") bytes, sha256 $(shasum -a 256 "$NEW_IPA" | cut -c1-16)…)"

if [ "$UPLOAD" = "1" ]; then
  log "6) upload lên node-2 (qua node-1) + báo server đã ký lại"
  SHA=$(shasum -a 256 "$NEW_IPA" | cut -d' ' -f1)
  cat "$NEW_IPA" | ssh -o BatchMode=yes -o ConnectTimeout=15 -i "$SSH_KEY" "$NODE1" "cat > /tmp/VPNFlow-latest.ipa"
  ssh -o BatchMode=yes -o ConnectTimeout=15 -i "$SSH_KEY" "$NODE1" \
    "scp -o BatchMode=yes /tmp/VPNFlow-latest.ipa root@$NODE2_IP:/root/flowvpn-ipa/VPNFlow-latest.ipa && rm -f /tmp/VPNFlow-latest.ipa"
  REMOTE=$(ssh -o BatchMode=yes -o ConnectTimeout=15 -i "$SSH_KEY" "$NODE1" "ssh -o BatchMode=yes root@$NODE2_IP 'sha256sum /root/flowvpn-ipa/VPNFlow-latest.ipa | cut -d\" \" -f1'")
  [ "$REMOTE" = "$SHA" ] || die "sha256 trên server KHÔNG khớp (local $SHA vs server $REMOTE) — kiểm lại ngay!"
  log "   ✔ sha256 khớp trên node-2: ${SHA:0:16}…"
  ssh -o BatchMode=yes -o ConnectTimeout=15 -i "$SSH_KEY" "$NODE1" "ssh -o BatchMode=yes root@$NODE2_IP 'bash -s'" <<EOS
T=\$(systemctl show -p Environment flowvpn-cp | tr " " "\n" | sed -n "s/^AUTH_TOKEN=//p" | head -1)
curl -s --max-time 20 -X POST -H "Authorization: Bearer \$T" -H "content-type: application/json" \
  -d '{"note":"resign IPA (không build lại) — thêm UDID mới"}' http://127.0.0.1:7778/v1/admin/ios/devices/built
EOS
  log "   ✔ đã báo server 'đã ký lại' ⇒ trang cài của khách hiện nút Tải & cài"
fi
