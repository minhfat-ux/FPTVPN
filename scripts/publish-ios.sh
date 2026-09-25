#!/usr/bin/env bash
# publish-ios.sh — phát hành 1 IPA ad-hoc lên trang buy (đủ 10 bước PUBLISHER_PROCESS §1, in bằng chứng).
#
# Dùng:
#   scripts/publish-ios.sh <ipa> <version> <build> [--dry-run] [--no-claim]
# Ví dụ:
#   scripts/publish-ios.sh build/ios-adhoc-export/ipa/FlowVPN.ipa 1.4.2 19
#
# Vì sao có: lần 1.4.1/18 (23/09/2026) phải làm tay 6 bước qua ssh; gom lại để không sót bước
# (đặc biệt: verify TỪ TRONG IPA + backup bản cũ + đọc JSON trả về của PATCH, không tin exit code).
#
# KHÔNG dùng script này cho TestFlight: kênh đó cần bản app-store-connect (xem docs/PUBLISHER_PROCESS.md §6b).
set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# Đường vào node-1: mặc định IP công khai; mạng TQ chập chờn thì đặt
#   PUBLISH_JUMP=root@100.76.147.111   (node-1 qua Tailscale — ổn định hơn, đo 26/09/2026)
JUMP="${PUBLISH_JUMP:-root@103.173.155.50}"
VPS="${PUBLISH_VPS:-root@165.101.114.162}"
# Key SSH: máy này có thể đổi/ mất quyền file key — ưu tiên biến SSH_KEY, rồi dsh_tunnel (đang dùng
# cho tunnel 13080), rồi fpt_tunnel. Sự cố 23/09: fpt_tunnel mất quyền => upload đứt giữa dòng.
SSH_KEY="${SSH_KEY:-}"
if [ -z "$SSH_KEY" ]; then
  for cand in "$HOME/.ssh/dsh_tunnel" "$HOME/.ssh/fpt_tunnel"; do
    [ -r "$cand" ] && { SSH_KEY="$cand"; break; }
  done
fi
KEY="${SSH_KEY:?khong tim thay SSH key (dat SSH_KEY=...)}"
SSH="ssh -i $KEY -o ConnectTimeout=10"
# Đẩy lệnh sang node-2 qua node-1 bằng STDIN (`ssh … bash -s`) thay vì bọc trong nháy đơn:
# cách cũ làm vỡ mọi lệnh có nháy đơn bên trong — ca thật 26/09/2026 (`sha256sum … | cut -d' ' -f1`
# bị cắt thành `cut -d -f1`) ⇒ đọc sha256 rỗng ⇒ cổng chặn DỪNG OAN giữa lúc phát.
remote() { printf '%s\n' "$1" | $SSH "$JUMP" "$SSH $VPS bash -s"; }

IPA="${1:-}"; VERSION="${2:-}"; BUILD="${3:-}"
DRY=0; CLAIM=1; DEVICE_TEST=""
shift $(( $# < 3 ? $# : 3 ))
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY=1; shift ;;
    --no-claim) CLAIM=0; shift ;;
    --device-test) DEVICE_TEST="${2:-}"; shift 2 ;;
    *) echo "tham so la: $1" >&2; exit 2 ;;
  esac
done
[ -f "$IPA" ] && [ -n "$VERSION" ] && [ -n "$BUILD" ] || { sed -n '2,14p' "$0"; exit 2; }

fail() { echo "DỪNG: $*" >&2; exit 1; }
step() { echo; echo "== $* =="; }

# ---------- 1c) CỔNG CHẶN VERSION (BẮT BUỘC — §0 luật 1, không đạt thì DỪNG) ----------
step "1c) Cổng chặn version (check-publish-version.py, TRƯỚC khi upload)"
python3 "$REPO/scripts/check-publish-version.py" --platform ios --file "$IPA" --version "$VERSION" --build "$BUILD"
GATE=$?
if [ "$GATE" = "2" ]; then fail "cổng chặn KHÔNG KIỂM ĐƯỢC (thiếu công cụ) — không được đoán"; fi
if [ "$GATE" != "0" ]; then fail "cổng chặn version KHÔNG ĐẠT — sửa artifact rồi chạy lại (xem output trên)"; fi

# ---------- 1d) §2c: bắt buộc có bằng chứng test iPhone THẬT ----------
step "1d) §2c — bằng chứng test iPhone thật"
if [ -z "$DEVICE_TEST" ] || [ ! -f "$DEVICE_TEST" ]; then
  fail "thiếu --device-test <file bằng chứng>. §2c (chủ dự án chốt 22/09) yêu cầu 7 mục: model+iOS, đúng bản/sha, luồng cơ bản ≥10 phút, đổi Wi-Fi↔4G, ngắt VPN không mất mạng, watchdog 0 lần oan + tự dựng lại, Settings hiện version. Thiếu ⇒ DỪNG, không phát hành, không gửi email."
fi
echo "   bằng chứng §2c: $DEVICE_TEST"
grep -qiE "iphone|ipad" "$DEVICE_TEST" || fail "file bằng chứng không nhắc tới iPhone/iPad thật — Simulator KHÔNG tính"

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
# Bản iOS mới KHÔNG dùng nhóm keychain dùng chung (profile Ad Hoc không cấp ⇒ -34018 ⇒ kẹt
# màn đăng nhập). Còn nhóm này trong signature = build sai, hoặc script ký lại tiêm nhóm vào.
shared = [g for g in groups if "com.privatevpn.shared" in g]
assert not shared, f"app còn khai nhóm keychain dùng chung {shared} — bản iOS mới không dùng"
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
  remote "flowvpn-coord claim --owner mac --area release-ios --files /root/flowvpn-ipa/VPNFlow-latest.ipa --note publish-ios-$VERSION-$BUILD" | tail -1
fi

# ---------- 3+4) backup + upload + verify ----------
step "3-5) Backup bản cũ, upload bản mới, verify trên server"
TS="$(date +%Y%m%d-%H%M%S)"
OLDV="$(remote "python3 - <<'P'\nimport zipfile,plistlib,io\nz=zipfile.ZipFile('/root/flowvpn-ipa/VPNFlow-latest.ipa')\nn=[x for x in z.namelist() if x.endswith('.app/Info.plist')][0]\nd=plistlib.loads(z.read(n))\nprint(d.get('CFBundleShortVersionString'),d.get('CFBundleVersion'))\nP" 2>/dev/null | tail -1)"
echo "   bản đang phát: ${OLDV:-?}"
remote "cp -p /root/flowvpn-ipa/VPNFlow-latest.ipa /root/flowvpn-ipa/VPNFlow-latest.bak-${OLDV// /-b}-$TS.ipa" || fail "backup lỗi"
# Tải lên file TẠM rồi mới thay file đang phát: nếu ssh đứt giữa dòng (ca thật 23/09: key mất quyền
# ⇒ khách tải được file CỤT 2,85 MB) thì route vẫn phục vụ bản cũ nguyên vẹn, không bao giờ cụt.
$SSH "$JUMP" "$SSH $VPS 'cat > /root/flowvpn-ipa/VPNFlow-latest.ipa.new && chmod 600 /root/flowvpn-ipa/VPNFlow-latest.ipa.new'" < "$IPA" || fail "upload lỗi"
REMOTE_SHA="$(remote "sha256sum /root/flowvpn-ipa/VPNFlow-latest.ipa.new | cut -d' ' -f1")"
REMOTE_SIZE="$(remote "stat -c %s /root/flowvpn-ipa/VPNFlow-latest.ipa.new")"
echo "   server (tạm): sha256=$REMOTE_SHA size=$REMOTE_SIZE"
[ "$REMOTE_SHA" = "$SHA" ] || fail "sha256 trên server KHÁC bản local (file tạm giữ nguyên, bản đang phát chưa đổi)"
[ "$REMOTE_SIZE" = "$SIZE" ] || fail "size trên server KHÁC bản local (file tạm giữ nguyên)"
remote "mv /root/flowvpn-ipa/VPNFlow-latest.ipa.new /root/flowvpn-ipa/VPNFlow-latest.ipa" || fail "mv vào chỗ đang phát lỗi"
echo "   đã thay file đang phát (nguyên tử)"

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

# ---------- 7b) cổng chặn SAU upload (§1c bước 5b) ----------
step "7b) Cổng chặn hậu-upload (đọc version trong file ĐANG PHÁT)"
python3 "$REPO/scripts/check-publish-version.py" --platform ios --mode post --version "$VERSION" --build "$BUILD" \
  || fail "cổng hậu-upload KHÔNG ĐẠT — file đang phát chưa đúng bản/mốc"

# ---------- 7c) ghi sổ phát hành (§VERSIONING) ----------
step "7c) Ghi sổ release/releases.jsonl"
node "$REPO/scripts/release-record.mjs" append --platform ios --version "$VERSION" --build "$BUILD" \
  --sha256 "$SHA" --size "$SIZE" --channel /v1/downloads/ios \
  --marker-latest "$VERSION" --marker-build "$BUILD" \
  --internal-version "$VERSION" --internal-build "$BUILD" \
  --artifact /root/flowvpn-ipa/VPNFlow-latest.ipa \
  --evidence "release/ios/RELEASE_NOTES_$VERSION.md" --origin publish --recorded-by mac \
  --verified-by "publish-ios.sh: cổng 1c/5b ĐẠT + tải thật sha256 khớp + bằng chứng §2c: $DEVICE_TEST" \
  --notes "phát hành $VERSION ($BUILD) qua publish-ios.sh" || fail "ghi sổ lỗi"

# ---------- 8) xong ----------
step "8) Xong"
echo "   IPA $VERSION ($BUILD) đang phát · sha256 $SHA · ${SIZE} bytes"
[ "$CLAIM" = "1" ] && remote "flowvpn-coord release --owner mac --area release-ios" | tail -1
echo "   Nhớ: (a) TAG (sau khi có commit build): node scripts/release-record.mjs tag --platform ios --version $VERSION"
echo "         (b) nộp TestFlight bản app-store-connect: node scripts/asc-beta.mjs submit <build> --whatsnew <json>"
echo "         (b) ghi nhật ký docs/PUBLISHER_PROCESS.md §6 rồi commit."
