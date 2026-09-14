#!/usr/bin/env bash
# Phát bản iOS qua **TestFlight**: build app-store-connect → upload → chờ Apple xử lý → gán nhóm public
# → (tuỳ chọn) gửi Apple duyệt beta. Dùng cho khách KHÔNG cần UDID và cho việc gia hạn mỗi 90 ngày.
#
#   scripts/ios-testflight-upload.sh                 # build lại + upload + chờ + gán nhóm public
#   scripts/ios-testflight-upload.sh --reuse         # dùng IPA đã build sẵn (không build lại)
#   scripts/ios-testflight-upload.sh --submit        # gửi Apple duyệt beta (external testing)
#   scripts/ios-testflight-upload.sh --check         # chỉ xem trạng thái TestFlight hiện tại
#
# LƯU Ý: Apple KHÔNG nhận 2 build cùng số (CFBundleVersion). Trước khi chạy, tăng
# CURRENT_PROJECT_VERSION (project.yml) — ví dụ 13 → 14.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"; cd "$ROOT"

KEY_ID="${ASC_KEY_ID:-8GW3662G64}"; ISSUER="${ASC_ISSUER_ID:-7a64d085-c03d-4b10-9b96-ff8e00c42e79}"
P8="${ASC_KEY_PATH:-$HOME/.appstoreconnect/private_keys/AuthKey_${KEY_ID}.p8}"
APP_ID="${ASC_APP_ID:-6804150049}"; BUNDLE="${BUNDLE_ID:-com.privatevpn.app}"
PUBLIC_GROUP="${PUBLIC_GROUP:-External Test}"
IPA="${IPA:-build/ios-direct-export/ipa/FlowVPN.ipa}"
REUSE=0; SUBMIT=0; CHECK=0
for a in "$@"; do case "$a" in
  --reuse) REUSE=1 ;; --submit) SUBMIT=1 ;; --check) CHECK=1 ;;
  *) echo "usage: $0 [--reuse|--submit|--check]" >&2; exit 2 ;;
esac; done
log() { printf '  %s\n' "$*"; }

# --- JWT ES256 (raw) + gọi API ---
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
  else curl -sS -g -X "$m" -H "Authorization: Bearer $jwt" "https://api.appstoreconnect.apple.com$path"; fi; }
latest_build() { asc GET "/v1/builds?filter[app]=$APP_ID&limit=5&sort=-uploadedDate&fields[builds]=version,processingState,uploadedDate"; }

status() {
  latest_build | python3 -c "
import json,sys
d=json.load(sys.stdin); b=d.get('data',[])
if not b: print('  (chưa có build nào)'); raise SystemExit
for x in b[:3]:
    a=x['attributes']; print('  build', a.get('version'), '| state:', a.get('processingState'), '| uploaded:', str(a.get('uploadedDate'))[:19])
"
  asc GET "/v1/builds?filter[app]=$APP_ID&limit=1&sort=-uploadedDate" | python3 -c "
import json,sys
d=json.load(sys.stdin); b=d.get('data',[])
print('  BUILD_ID=' + (b[0]['id'] if b else ''))" 
  asc GET "/v1/betaGroups?filter[app]=$APP_ID&limit=20" | python3 -c "
import json,sys
d=json.load(sys.stdin)
for g in d.get('data',[]):
    a=g['attributes']; print('  nhóm:', a.get('name'), '| internal:', a.get('isInternalGroup'), '| link:', a.get('publicLink') or '-')
"
}

if [ "$CHECK" = "1" ]; then log "trạng thái TestFlight hiện tại:"; status; exit 0; fi

if [ "$REUSE" = "0" ]; then
  log "1) build bản app-store-connect"
  bash scripts/archive-appstore.sh ios direct 2>&1 | tail -3
fi
[ -f "$IPA" ] || { echo "LỖI: không thấy IPA $IPA" >&2; exit 1; }
log "IPA: $IPA ($(stat -f %z "$IPA") bytes · md5 $(md5 -q "$IPA"))"

log "2) upload lên App Store Connect"
xcrun altool --upload-app -f "$IPA" -t ios --apiKey "$KEY_ID" --apiIssuer "$ISSUER" 2>&1 | grep -E "UPLOAD SUCCEEDED|Delivery UUID|error" | sed 's/^/     /'

log "3) chờ Apple xử lý (tối đa ~15 phút)"
VER=$(python3 -c "
import plistlib,zipfile,sys
z=zipfile.ZipFile('$IPA'); n=[x for x in z.namelist() if x.endswith('Info.plist') and x.count('/')==2][0]
print(plistlib.loads(z.read(n)).get('CFBundleVersion'))")
BID=""
for i in $(seq 1 20); do
  sleep 45
  res=$(asc GET "/v1/builds?filter[app]=$APP_ID&limit=5&sort=-uploadedDate&fields[builds]=version,processingState")
  read -r ST BID <<< "$(echo "$res" | python3 -c "
import json,sys
d=json.load(sys.stdin); b=d.get('data',[])
m=[x for x in b if x['attributes'].get('version')=='$VER']
print((m[0]['attributes'].get('processingState') if m else 'NOT_YET'), m[0]['id'] if m else '')")"
  log "     build $VER: $ST"
  [ "$ST" = "VALID" ] && break
  [ "$ST" = "INVALID" ] && { log "     ✖ Apple từ chối build (xem email App Store Connect)"; exit 1; }
done
[ "$ST" = "VALID" ] || { log "     ✖ quá thời gian chờ"; exit 1; }

log "4) gán build vào nhóm public '$PUBLIC_GROUP'"
GID=$(asc GET "/v1/betaGroups?filter[app]=$APP_ID&limit=20" | python3 -c "
import json,sys
d=json.load(sys.stdin)
m=[g['id'] for g in d.get('data',[]) if g['attributes'].get('name')=='$PUBLIC_GROUP']
print(m[0] if m else '')")
if [ -n "$GID" ]; then
  asc POST "/v1/betaGroups/$GID/relationships/builds" "{\"data\":[{\"type\":\"builds\",\"id\":\"$BID\"}]}" >/dev/null
  LINK=$(asc GET "/v1/betaGroups/$GID" | python3 -c "import json,sys; print(json.load(sys.stdin)['data']['attributes'].get('publicLink') or '-')")
  log "     link công khai: $LINK"
else
  log "     (không thấy nhóm '$PUBLIC_GROUP' — bỏ qua)"
fi

if [ "$SUBMIT" = "1" ]; then
  log "5) gửi Apple duyệt beta (external testing)"
  asc POST "/v1/betaAppReviewSubmissions" "{\"data\":{\"type\":\"betaAppReviewSubmissions\",\"relationships\":{\"build\":{\"data\":{\"type\":\"builds\",\"id\":\"$BID\"}}}}}" | python3 -c "
import json,sys
d=json.load(sys.stdin)
print('     ✔ đã gửi:', d['data']['attributes'].get('betaReviewState') if 'data' in d else d.get('errors',[{}])[0].get('detail','?'))"
fi

log "XONG — khách: cài TestFlight → mở link mời → Install. Trang hướng dẫn: https://meetflowai.site/install/ios/testflight"
