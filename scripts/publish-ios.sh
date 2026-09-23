#!/usr/bin/env bash
# publish-ios.sh — phát hành 1 IPA ad-hoc lên trang buy (đủ 10 bước PUBLISHER_PROCESS §1, in bằng chứng).
#
# Dùng:
#   scripts/publish-ios.sh <ipa> <version> <build> [--dry-run] [--no-claim]
# Ví dụ:
#   scripts/publish-ios.sh build/ios-adhoc-export/ipa/FlowVPN.ipa 1.4.1 19
#
# Vì sao có: lần 1.4.1/18 (23/09/2026) phải làm tay 6 bước qua ssh; gom lại để không sót bước
# (đặc biệt: verify TỪ TRONG IPA + backup bản cũ + đọc JSON trả về của PATCH, không tin exit code).
#
# KHÔNG dùng script này cho TestFlight: kênh đó cần bản app-store-connect (xem docs/PUBLISHER_PROCESS.md §6b).
set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
JUMP="root@103.173.155.50"
VPS="root@165.101.114.162"
KEY="$HOME/.ssh/fpt_tunnel"
SSH="ssh -i $KEY -o ConnectTimeout=10"
remote() { $SSH "$JUMP" "$SSH $VPS '$1'"; }

IPA="${1:-}"; VERSION="${2:-}"; BUILD="${3:-}"
DRY=0; CLAIM=1
for a in "${@:4}"; do
  case "$a" in
    --dry-run) DRY=1 ;;
    --no-claim) CLAIM=0 ;;
    *) echo "tham so la: $a" >&2; exit 2 ;;
  esac
done
[ -f "$IPA" ] && [ -n "$VERSION" ] && [ -n "$BUILD" ] || { sed -n '2,12p' "$0"; exit 2; }

fail() { echo "DỪNG: $*" >&2; exit 1; }
step() { echo; echo "== $* =="; }

# ---------- 1) VERIFY từ trong file ----------
step "1) Verify IPA: $IPA"
[ -f "$IPA" ] || fail "không thấy file $IPA"
WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT
unzip -oq "$IPA" -d "$WORK" || fail "unzip lỗi"
APP="$(find "$WORK/Payload" -maxdepth 1 -name '*.app' | head -1)"
[ -n "$APP" ] || fail "trong IPA không có Payload/*.app"
V="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$APP/Info.plist" 2>/dev/null)"
B="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$APP/Info.plist" 2>/dev/null)"
BID="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$APP/Info.plist" 2>/dev/null)"
SHA="$(shasum -a 256 "$IPA" | awk '{print $1}')"; SIZE="$(stat -f%z "$IPA")"
echo "   version=$V build=$B bundle=$BID"
echo "   sha256=$SHA"; echo "   size=$SIZE bytes"
[ "$V" = "$VERSION" ] || fail "version trong IPA ($V) khác tham số ($VERSION)"
[ "$B" = "$BUILD" ] || fail "build trong IPA ($B) khác tham số ($BUILD)"
[ "$BID" = "com.privatevpn.app" ] || fail "bundle id lạ: $BID"
ls "$APP/PlugIns/PrivateVPNPacketTunnel.appex" >/dev/null 2>&1 || fail "thiếu PrivateVPNPacketTunnel.appex"
security cms -D -i "$APP/embedded.mobileprovision" > "$WORK/prof.plist" 2>/dev/null || fail "không đọc được embedded.mobileprovision"
python3 - "$WORK/prof.plist" "$APP" <<'PY' || fail "profile/entitlement không đạt"
import plistlib, subprocess, sys
prof = plistlib.load(open(sys.argv[1], "rb")); app = sys.argv[2]
udids = prof.get("ProvisionedDevices") or []
gt = prof.get("Entitlements", {}).get("get-task-allow")
print(f"   profile={prof.get('Name')} udid={len(udids)} get-task-allow={gt} exp={prof.get('ExpirationDate')}")
assert udids, "profile KHÔNG phải ad-hoc (0 UDID) — khách cài trực tiếp sẽ fail"
assert gt is False, "get-task-allow phải false (nếu true: khách phải bật Developer Mode)"
out = subprocess.run(["codesign", "-d", "--entitlements", ":-", app], capture_output=True).stdout.decode()
i = out.find("<?xml")
ent = plistlib.loads(out[i:out.rfind("</plist>") + 8].encode()) if i >= 0 else {}
groups = ent.get("keychain-access-groups") or []
print(f"   keychain-access-groups={groups}")
assert "G6XW3RN6LJ.com.privatevpn.shared" in groups, "thiếu keychain group (app sẽ kẹt đăng nhập)"
PY

if [ "$DRY" = "1" ]; then
  step "DRY-RUN: các bước sẽ làm"
  echo "   2) claim release-ios trên board"
  echo "   3) backup /root/flowvpn-ipa/VPNFlow-latest.ipa (bản đang phát)"
  echo "   4) upload IPA này -> /root/flowvpn-ipa/VPNFlow-latest.ipa"
  echo "   5) verify sha256 + size trên server"
  echo "   6) PATCH /v1/admin/app-version {latest_version:$VERSION, ipa_build:$BUILD}"
  echo "   7) verify /v1/app-version, manifest bundle-version=$BUILD, tải thật 200 + sha256, /install/ios"
  echo "   8) ghi nhật ký + release claim"
  exit 0
fi

# ---------- 2) claim ----------
if [ "$CLAIM" = "1" ]; then
  step "2) Claim vùng release-ios"
  remote "flowvpn-coord claim --owner mac --area release-ios --files /root/flowvpn-ipa/VPNFlow-latest.ipa --note 'publish-ios.sh: IPA $VERSION/$BUILD'" | tail -1
fi

# ---------- 3+4) backup + upload + verify ----------
step "3-5) Backup bản cũ, upload bản mới, verify trên server"
TS="$(date +%Y%m%d-%H%M%S)"
OLDV="$(remote "python3 - <<'P'\nimport zipfile,plistlib,io\nz=zipfile.ZipFile('/root/flowvpn-ipa/VPNFlow-latest.ipa')\nn=[x for x in z.namelist() if x.endswith('.app/Info.plist')][0]\nd=plistlib.loads(z.read(n))\nprint(d.get('CFBundleShortVersionString'),d.get('CFBundleVersion'))\nP" 2>/dev/null | tail -1)"
echo "   bản đang phát: ${OLDV:-?}"
remote "cp -p /root/flowvpn-ipa/VPNFlow-latest.ipa /root/flowvpn-ipa/VPNFlow-latest.bak-${OLDV// /-b}-$TS.ipa" || fail "backup lỗi"
$SSH "$JUMP" "$SSH $VPS 'cat > /root/flowvpn-ipa/VPNFlow-latest.ipa && chmod 600 /root/flowvpn-ipa/VPNFlow-latest.ipa'" < "$IPA" || fail "upload lỗi"
REMOTE_SHA="$(remote "sha256sum /root/flowvpn-ipa/VPNFlow-latest.ipa | cut -d' ' -f1")"
REMOTE_SIZE="$(remote "stat -c %s /root/flowvpn-ipa/VPNFlow-latest.ipa")"
echo "   server: sha256=$REMOTE_SHA size=$REMOTE_SIZE"
[ "$REMOTE_SHA" = "$SHA" ] || fail "sha256 trên server KHÁC bản local"
[ "$REMOTE_SIZE" = "$SIZE" ] || fail "size trên server KHÁC bản local"

# ---------- 6) mốc version ----------
step "6) Set mốc latest_ios_version=$VERSION ipa_build=$BUILD"
TOK_CMD="TOK=\$(grep -hoE 'AUTH_TOKEN=\"?[^\"]+\"?' /etc/systemd/system/flowvpn-cp.service.d/*.conf | head -1 | sed 's/AUTH_TOKEN=//;s/\"//g'); curl -s -m 20 -X PATCH https://t1.meetflowai.site/v1/admin/app-version -H \"Authorization: Bearer \$TOK\" -H 'Content-Type: application/json' -d '{\"latest_version\":\"$VERSION\",\"ipa_build\":\"$BUILD\"}'"
RESP="$(remote "$TOK_CMD")"
echo "   PATCH trả về: $RESP"
echo "$RESP" | grep -q "\"latest_version\":\"$VERSION\"" || fail "PATCH không xác nhận latest_version (đọc JSON, không tin exit code)"
echo "$RESP" | grep -q "\"ipa_build\":\"$BUILD\"" || fail "PATCH không xác nhận ipa_build"

# ---------- 7) verify đường khách ----------
step "7) Verify đường khách qua t1"
AV="$(curl -s -m 20 'https://t1.meetflowai.site/v1/app-version?platform=ios')"
echo "   app-version: $AV"
echo "$AV" | grep -q "\"latest_version\":\"$VERSION\"" || fail "app-version chưa trả latest_version mới"
MAN="$(curl -s -m 20 https://t1.meetflowai.site/install/ios/manifest.plist)"
echo "$MAN" | grep -q "<string>$BUILD</string>" || fail "manifest chưa trả bundle-version $BUILD"
DL="$WORK/download.ipa"
curl -s -m 300 "https://t1.meetflowai.site/v1/downloads/ios?cb=$(date +%s)" -o "$DL" || fail "tải IPA lỗi"
DSHA="$(shasum -a 256 "$DL" | awk '{print $1}')"; DSIZE="$(stat -f%z "$DL")"
echo "   tải thật: size=$DSIZE sha256=$DSHA"
[ "$DSHA" = "$SHA" ] || fail "file tải về KHÁC file phát hành"
for u in /install/ios /buy; do
  C="$(curl -s -o /dev/null -m 25 -w '%{http_code}' "https://t1.meetflowai.site$u")"
  echo "   $u -> HTTP $C"; [ "$C" = "200" ] || fail "$u không 200"
done

# ---------- 8) xong ----------
step "8) Xong"
echo "   IPA $VERSION ($BUILD) đang phát · sha256 $SHA · ${SIZE} bytes"
[ "$CLAIM" = "1" ] && remote "flowvpn-coord release --owner mac --area release-ios" | tail -1
echo "   Nhớ: (a) nộp TestFlight bản app-store-connect: node scripts/asc-beta.mjs submit <build> --whatsnew <json>"
echo "         (b) ghi nhật ký docs/PUBLISHER_PROCESS.md §6 rồi commit."
