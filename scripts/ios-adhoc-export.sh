#!/usr/bin/env bash
# Ký lại IPA bản **ad-hoc** (không cần Developer Mode, không cần "Tin cậy nhà phát triển") và phát cho khách.
#
# Vì sao cần script riêng: `xcodebuild -exportArchive method=ad-hoc` với ký tự động cần Xcode tạo profile
# ad-hoc trên cloud — tài khoản này bị chặn ("Cloud signing permission error"), nên ở đây tạo profile
# bằng **App Store Connect API** rồi export với ký THỦ CÔNG (chỉ đúng tên profile). Chạy lại mỗi khi có
# UDID mới để profile chứa thêm máy đó.
#
# Dùng:
#   scripts/ios-adhoc-export.sh                 # tạo/cập nhật profile ad-hoc + export IPA
#   scripts/ios-adhoc-export.sh --no-upload     # chỉ export, không upload Diawi/PATCH link
#
# Cần: archive đã build (bash scripts/archive-appstore.sh ios adhoc, hoặc archive có sẵn), API key ở
# ~/.appstoreconnect/private_keys/AuthKey_<KEY_ID>.p8, token Diawi ở /root/.diawi-token trên node-2.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"; cd "$ROOT"

NODE2="${NODE2:-root@165.101.114.162}"; SSH_KEY="${KEY:-$HOME/.ssh/fpt_vpn_node}"
KEY_ID="${ASC_KEY_ID:-8GW3662G64}"; ISSUER="${ASC_ISSUER_ID:-7a64d085-c03d-4b10-9b96-ff8e00c42e79}"
P8="${ASC_KEY_PATH:-$HOME/.appstoreconnect/private_keys/AuthKey_${KEY_ID}.p8}"
TEAM="${TEAM_ID:-G6XW3RN6LJ}"
ARCHIVE="${ARCHIVE:-build/ios-adhoc-export/PrivateVPN.xcarchive}"
OUT="${OUT:-build/ios-adhoc-export/ipa}"
UPLOAD=1; [ "${1:-}" = "--no-upload" ] && UPLOAD=0
SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=12 -o StrictHostKeyChecking=accept-new); [ -f "$SSH_KEY" ] && SSH_OPTS+=(-i "$SSH_KEY")
log() { printf '  %s\n' "$*"; }

[ -d "$ARCHIVE" ] || { echo "LỖI: không thấy archive $ARCHIVE — build trước: bash scripts/archive-appstore.sh ios adhoc" >&2; exit 1; }
[ -f "$P8" ] || { echo "LỖI: không thấy API key $P8" >&2; exit 1; }

# ---- JWT ES256 raw (Apple KHÔNG nhận DER) + gọi API ----
b64url() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }
mkjwt() {
  local n h p
  n=$(date +%s)
  h=$(printf '{"alg":"ES256","kid":"%s","typ":"JWT"}' "$KEY_ID" | b64url)
  p=$(printf '{"iss":"%s","iat":%s,"exp":%s,"aud":"appstoreconnect-v1"}' "$ISSUER" "$n" "$((n+900))" | b64url)
  printf '%s.%s.%s' "$h" "$p" "$(python3 -c "
import base64,subprocess
der=subprocess.run(['openssl','dgst','-sha256','-sign','$P8'],input='$h.$p'.encode(),capture_output=True,check=True).stdout
i=0; assert der[i]==0x30; i+=1; l=der[i]; i+=1
if l & 0x80: i += l & 0x7f
assert der[i]==0x02; i+=1; rl=der[i]; i+=1; r=der[i:i+rl]; i+=rl
assert der[i]==0x02; i+=1; sl=der[i]; i+=1; s=der[i:i+sl]
print(base64.urlsafe_b64encode(r.lstrip(b'\0').rjust(32,b'\0')+s.lstrip(b'\0').rjust(32,b'\0')).rstrip(b'=').decode())")"
}
asc() { local m="$1" path="$2" body="${3:-}" jwt; jwt="$(mkjwt)"
  if [ -n "$body" ]; then curl -sS -g -X "$m" -H "Authorization: Bearer $jwt" -H "Content-Type: application/json" -d "$body" "https://api.appstoreconnect.apple.com$path"
  else curl -sS -g -X "$m" -H "Authorization: Bearer $jwt" "https://api.appstoreconnect.apple.com$path"; fi
}
py() { python3 "$@"; }

log "1) lấy thông tin tài khoản: bundle id, chứng chỉ Distribution, UDID iOS"
BID_APP=$(asc GET "/v1/bundleIds?filter[identifier]=com.privatevpn.app" | py -c 'import json,sys; print(json.load(sys.stdin)["data"][0]["id"])')
BID_EXT=$(asc GET "/v1/bundleIds?filter[identifier]=com.privatevpn.app.packet-tunnel" | py -c 'import json,sys; print(json.load(sys.stdin)["data"][0]["id"])')
# PHẢI chọn chứng chỉ Distribution CÓ KHOÁ RIÊNG trên máy này: profile Ad Hoc phải chứa đúng cert mà
# xcodebuild dùng để ký, nếu không export sẽ báo "Provisioning profile ... doesn't include signing
# certificate" (đã gặp thật: tài khoản có 2 cert Distribution, cert mới hơn không có khoá trên máy).
CERT_ID="${ASC_CERT_ID:-}"
if [ -z "$CERT_ID" ]; then
  KC_CERT=$(security find-certificate -a -c "Apple Distribution" -p 2>/dev/null | openssl x509 -outform der 2>/dev/null | openssl base64 -A)
  CERT_ID=$(asc GET "/v1/certificates?filter[certificateType]=DISTRIBUTION&limit=10&fields[certificates]=certificateContent" | KC_CERT="$KC_CERT" py -c '
import json, os, sys
kc = (os.environ.get("KC_CERT") or "").strip()
data = json.load(sys.stdin).get("data", [])
match = next((x["id"] for x in data if (x["attributes"].get("certificateContent") or "").strip() == kc), "")
print(match or (data[0]["id"] if data else ""))')
fi
[ -n "$CERT_ID" ] || { echo "LỖI: không tìm được chứng chỉ Distribution (đặt ASC_CERT_ID để chỉ định)" >&2; exit 1; }
DEV_IDS=$(asc GET "/v1/devices?filter[platform]=IOS&limit=200" | py -c 'import json,sys; print(json.dumps([{"type":"devices","id":x["id"]} for x in json.load(sys.stdin)["data"]]))')
log "     app=$BID_APP ext=$BID_EXT cert=$CERT_ID · $DEV_IDS"

# API của Apple KHÔNG cho UPDATE profile (chỉ CREATE/DELETE/GET) ⇒ muốn đổi danh sách UDID thì
# xoá rồi tạo lại cùng tên. Tên giữ nguyên nên ExportOptions.plist vẫn trỏ đúng profile mới.
mk_profile() { # $1 name  $2 bundleId-id  $3 profile-id cũ (rỗng = chưa có)
  local name="$1" bid="$2" pid="${3:-}"
  if [ -n "$pid" ]; then
    asc DELETE "/v1/profiles/$pid" >/dev/null || true
    printf '  (đã xoá profile cũ %s để tạo lại với danh sách UDID mới)\n' "$name" >&2
  fi
  asc POST "/v1/profiles" "{\"data\":{\"type\":\"profiles\",\"attributes\":{\"name\":\"$name\",\"profileType\":\"IOS_APP_ADHOC\"},\"relationships\":{\"bundleId\":{\"data\":{\"type\":\"bundleIds\",\"id\":\"$bid\"}},\"certificates\":{\"data\":[{\"type\":\"certificates\",\"id\":\"$CERT_ID\"}]},\"devices\":{\"data\":$DEV_IDS}}}}"
}

log "2) tạo/cập nhật profile Ad Hoc (đủ UDID đang có trong tài khoản)"
existing_id() { asc GET "/v1/profiles?filter[name]=$1&limit=1" | py -c 'import json,sys; d=json.load(sys.stdin)["data"]; print(d[0]["id"] if d else "")'; }
APP_PID=$(existing_id "VPNFlow%20AdHoc%20App"); EXT_PID=$(existing_id "VPNFlow%20AdHoc%20Tunnel")
for pair in "VPNFlow AdHoc App|$BID_APP|$APP_PID" "VPNFlow AdHoc Tunnel|$BID_EXT|$EXT_PID"; do
  IFS='|' read -r nm bid pid <<< "$pair"
  mk_profile "$nm" "$bid" "$pid" > /tmp/adhoc-prof-resp.json
  py - "$nm" <<'PY'
import base64, json, os, sys
d = json.load(open('/tmp/adhoc-prof-resp.json'))
if 'errors' in d:
    print("  ✖", d['errors'][0].get('detail', '')[:160]); raise SystemExit(1)
a = d['data']['attributes']; content = base64.b64decode(a['profileContent'])
for dd in [os.path.expanduser('~/Library/Developer/Xcode/UserData/Provisioning Profiles'),
           os.path.expanduser('~/Library/MobileDevice/Provisioning Profiles')]:
    os.makedirs(dd, exist_ok=True)
    open(os.path.join(dd, a['uuid'] + '.mobileprovision'), 'wb').write(content)
print(f"  ✔ {a['name']} ({a['profileType']}, {len(content)} bytes) → đã cài vào máy này")
PY
done

log "3) export IPA ad-hoc (ký thủ công bằng profile vừa tạo)"
cat > /tmp/ExportOptions-adhoc.plist <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>method</key><string>ad-hoc</string>
  <key>teamID</key><string>$TEAM</string>
  <key>signingStyle</key><string>manual</string>
  <key>provisioningProfiles</key><dict>
    <key>com.privatevpn.app</key><string>VPNFlow AdHoc App</string>
    <key>com.privatevpn.app.packet-tunnel</key><string>VPNFlow AdHoc Tunnel</string>
  </dict>
  <key>uploadSymbols</key><true/><key>compileBitcode</key><false/><key>destination</key><string>export</string>
</dict></plist>
PLIST
rm -rf "$OUT"
xcodebuild -exportArchive -archivePath "$ARCHIVE" -exportOptionsPlist /tmp/ExportOptions-adhoc.plist -exportPath "$OUT" -allowProvisioningUpdates 2>&1 | tail -3
IPA="$(ls -t "$OUT"/*.ipa | head -1)"
log "     IPA: $IPA ($(stat -f %z "$IPA") bytes, md5 $(md5 -q "$IPA"))"

if [ "$UPLOAD" = "0" ]; then log "(--no-upload: dừng ở đây)"; exit 0; fi

log "4) đưa IPA lên node-2 + Diawi"
scp "${SSH_OPTS[@]}" "$IPA" "$NODE2:/root/flowvpn-ipa/VPNFlow-latest.ipa" >/dev/null
LINK=$(ssh "${SSH_OPTS[@]}" "$NODE2" "cd /root && DIAWI_TOKEN=\$(cat /root/.diawi-token) node /root/diawi-upload.mjs --file /root/flowvpn-ipa/VPNFlow-latest.ipa --days ${DIAWI_DAYS:-30} --find-by-udid --comment 'VPNFlow iOS ad-hoc' --json" | py -c 'import json,sys; print(json.load(sys.stdin)["link"])')
log "     link: $LINK"

log "5) cập nhật link Diawi (kênh phụ) + báo server đã ký lại"
# `ipa_url` GIỮ NGUYÊN là /install/ios: khách chưa đăng ký bấm thẳng Diawi sẽ báo 'Unable to Install'.
# Link Diawi chỉ là kênh phụ hiện trong khối hướng dẫn của trang cài.
T=$(ssh "${SSH_OPTS[@]}" "$NODE2" 'systemctl show flowvpn-cp -p Environment | tr " " "\n" | grep "^AUTH_TOKEN=" | cut -d= -f2-')
ssh "${SSH_OPTS[@]}" "$NODE2" "curl -s -X PATCH -H 'Authorization: Bearer $T' -H 'content-type: application/json' -d '{\"diawi_url\":\"$LINK\",\"ipa_url\":\"https://meetflowai.site/install/ios\"}' http://127.0.0.1:7778/v1/admin/app-version >/dev/null; curl -s -X POST -H 'Authorization: Bearer $T' -H 'content-type: application/json' -d '{\"note\":\"adhoc export\"}' http://127.0.0.1:7778/v1/admin/ios/devices/built >/dev/null"
log "XONG — khách mở /install/ios là cài được: $LINK"
