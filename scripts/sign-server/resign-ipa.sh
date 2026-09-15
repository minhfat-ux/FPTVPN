#!/usr/bin/env bash
# KÝ LẠI IPA NGAY TRÊN SERVER (Linux) — KHÔNG cần máy Mac.
#
# Dùng khi: có UDID mới ⇒ profile phải chứa thêm máy ⇒ ký lại IPA đang phát.
# Không build lại code (binary giữ nguyên), chỉ thay provisioning profile + chữ ký.
#
# Chạy trên node-2 (Ubuntu), cần:
#   · zsign (bản dựng sẵn: /usr/local/bin/zsign)
#   · khoá ký dạng .p12:      /root/flowvpn-sign/dist.p12      (0600)
#   · mật khẩu .p12:          /root/flowvpn-sign/dist.p12.pass (0600)
#   · khoá App Store Connect: đã có sẵn trong control plane (data/apple-asc.json)
#
#   /root/flowvpn-sign/resign-ipa.sh            # refresh profile + ký lại + phát + báo server
#   /root/flowvpn-sign/resign-ipa.sh --dry-run  # chỉ ký ra file mới, không thay IPA đang phát
set -euo pipefail

SIGN_DIR="${SIGN_DIR:-/root/flowvpn-sign}"
# Máy chạy control plane (serve IPA + endpoint admin). Rỗng = chính máy này.
CP_HOST="${CP_HOST:-}"
IPA_PATH="${IPA_PATH:-/root/flowvpn-ipa/VPNFlow-latest.ipa}"
IPA_LIVE="${IPA_LIVE:-$SIGN_DIR/VPNFlow-live.ipa}"
P12="${P12:-$SIGN_DIR/dist.p12}"
P12_PASS_FILE="${P12_PASS_FILE:-$SIGN_DIR/dist.p12.pass}"
WORK="${WORK:-$SIGN_DIR/work}"
OUT_IPA="${OUT_IPA:-$SIGN_DIR/VPNFlow-resigned.ipa}"
REFRESH="${REFRESH:-$SIGN_DIR/refresh-profiles.mjs}"
DRY_RUN=0; [ "${1:-}" = "--dry-run" ] && DRY_RUN=1

log() { printf '  %s\n' "$*"; }

for f in "$P12" "$P12_PASS_FILE"; do
  [ -f "$f" ] || { echo "LỖI: thiếu $f (cần khoá ký dạng .p12 + file mật khẩu)" >&2; exit 2; }
done
command -v zsign >/dev/null || { echo "LỖI: chưa có zsign" >&2; exit 2; }
# Lấy IPA đang phát: máy này là control plane thì đọc trực tiếp, khác máy thì ssh sang lấy.
if [ -n "$CP_HOST" ]; then
  log "0) lấy IPA đang phát từ $CP_HOST:$IPA_PATH"
  ssh -o BatchMode=yes -o ConnectTimeout=15 "$CP_HOST" "cat $IPA_PATH" > "$IPA_LIVE" || { echo "LỖI: không lấy được IPA từ $CP_HOST" >&2; exit 2; }
else
  cp "$IPA_PATH" "$IPA_LIVE"
fi
[ -s "$IPA_LIVE" ] || { echo "LỖI: IPA đang phát rỗng/không có" >&2; exit 2; }
log "     $(stat -c %s "$IPA_LIVE") bytes"

log "1) cập nhật profile Ad Hoc cho đủ UDID (App Store Connect API, ngay trên server)"
node "$REFRESH" "$SIGN_DIR" | sed 's/^/     /'

log "2) giải nén IPA đang phát"
rm -rf "$WORK"; mkdir -p "$WORK"
python3 - "$IPA_LIVE" "$WORK" <<'PY'
import sys, zipfile
zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])
PY
APP=$(find "$WORK/Payload" -maxdepth 1 -name "*.app" | head -1)
APPEX=$(find "$APP/PlugIns" -maxdepth 1 -name "*.appex" 2>/dev/null | head -1 || true)
[ -n "$APP" ] || { echo "LỖI: IPA không có Payload/*.app" >&2; exit 1; }
log "     app : $(basename "$APP")  |  appex: $([ -n "$APPEX" ] && basename "$APPEX" || echo '(không có)')"

# Entitlements lấy TỪ CHÍNH profile (đúng quyền của bundle đó) — không bịa quyền mới.
entitlements() { # $1 profile  $2 file ra
  python3 - "$1" "$2" <<'PY'
import plistlib, re, sys
raw = open(sys.argv[1], "rb").read().decode("utf-8", "replace")
start, end = raw.find("<?xml"), raw.rfind("</plist>") + len("</plist>")
plist = plistlib.loads(raw[start:end].encode())
ents = plist.get("Entitlements")
if not ents:
    sys.exit("profile không có Entitlements")
with open(sys.argv[2], "wb") as fh:
    plistlib.dump({k: v for k, v in ents.items()}, fh)
print(f"     entitlements: {len(ents)} khoá → {sys.argv[2].split('/')[-1]}")
PY
}

PASS="$(cat "$P12_PASS_FILE")"
ZFLAGS=(-k "$P12" -p "$PASS" -f)

log "3) thay profile + ký lại từng bundle bằng zsign"
# Ký appex TRƯỚC (bundle lồng), rồi mới ký app — giữ đúng profile/entitlements cho từng bundle.
if [ -n "$APPEX" ]; then
  cp "$SIGN_DIR/ext.mobileprovision" "$APPEX/embedded.mobileprovision"
  entitlements "$SIGN_DIR/ext.mobileprovision" "$SIGN_DIR/ext.entitlements"
  zsign "${ZFLAGS[@]}" -m "$SIGN_DIR/ext.mobileprovision" -e "$SIGN_DIR/ext.entitlements" "$APPEX" 2>&1 | sed 's/^/     /'
fi
cp "$SIGN_DIR/app.mobileprovision" "$APP/embedded.mobileprovision"
entitlements "$SIGN_DIR/app.mobileprovision" "$SIGN_DIR/app.entitlements"
zsign "${ZFLAGS[@]}" -m "$SIGN_DIR/app.mobileprovision" -e "$SIGN_DIR/app.entitlements" "$APP" 2>&1 | sed 's/^/     /'

log "4) kiểm tra kết quả (profile trong từng bundle + chữ ký)"
python3 - "$APP" "$APPEX" <<'PY'
import re, sys, os
def prof_udids(p):
    if not p or not os.path.exists(p): return None, None
    raw = open(p, "rb").read().decode("utf-8", "replace")
    name = re.search(r"<key>Name</key>\s*<string>([^<]*)", raw)
    return (name.group(1) if name else "?"), len(set(re.findall(r"[0-9A-F]{8}-[0-9A-F]{16}", raw)))
for label, path in (("app", sys.argv[1]), ("appex", sys.argv[2] if len(sys.argv) > 2 else None)):
    if not path: continue
    name, n = prof_udids(os.path.join(path, "embedded.mobileprovision"))
    sig = os.path.exists(os.path.join(path, "_CodeSignature", "CodeResources"))
    print(f"     {label}: profile={name} | UDID={n} | CodeResources={'CÓ' if sig else 'KHÔNG'}")
PY

log "5) đóng gói lại IPA"
python3 - "$WORK" "$OUT_IPA" <<'PY'
import os, sys, zipfile
work, out = sys.argv[1], sys.argv[2]
if os.path.exists(out): os.unlink(out)
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    for root, _dirs, files in os.walk(os.path.join(work, "Payload")):
        for name in files:
            full = os.path.join(root, name)
            z.write(full, os.path.relpath(full, work))
print(f"     {out} ({os.path.getsize(out)} bytes)")
PY

if [ "$DRY_RUN" = "1" ]; then log "--dry-run: dừng, KHÔNG thay IPA đang phát"; exit 0; fi

log "6) phát bản mới + báo server 'đã ký lại'"
SHA=$(sha256sum "$OUT_IPA" | cut -d" " -f1)
if [ -n "$CP_HOST" ]; then
  cat "$OUT_IPA" | ssh -o BatchMode=yes -o ConnectTimeout=20 "$CP_HOST" "cat > $IPA_PATH && chmod 600 $IPA_PATH"
  REMOTE=$(ssh -o BatchMode=yes "$CP_HOST" "sha256sum $IPA_PATH | cut -d' ' -f1")
  [ "$REMOTE" = "$SHA" ] || { echo "LỖI: sha256 trên $CP_HOST KHÔNG khớp ($REMOTE vs $SHA)" >&2; exit 1; }
  log "     đã đẩy sang $CP_HOST:$IPA_PATH (sha256 ${SHA:0:16}… khớp)"
  ssh -o BatchMode=yes "$CP_HOST" 'bash -s' <<'REMOTE'
T=$(systemctl show -p Environment flowvpn-cp | tr " " "\n" | sed -n 's/^AUTH_TOKEN=//p' | head -1)
curl -s --max-time 20 -X POST -H "Authorization: Bearer $T" -H "content-type: application/json" \
  -d '{"note":"resign on sign host (zsign)"}' http://127.0.0.1:7778/v1/admin/ios/devices/built
REMOTE
else
  cp "$OUT_IPA" "$IPA_PATH"; chmod 600 "$IPA_PATH"
  log "     đã thay $IPA_PATH ($(stat -c %s "$IPA_PATH") bytes)"
  T=$(systemctl show -p Environment flowvpn-cp | tr " " "\n" | sed -n 's/^AUTH_TOKEN=//p' | head -1)
  curl -s --max-time 20 -X POST -H "Authorization: Bearer $T" -H "content-type: application/json" \
    -d '{"note":"resign on server (zsign, không build lại)"}' \
    http://127.0.0.1:7778/v1/admin/ios/devices/built
fi
