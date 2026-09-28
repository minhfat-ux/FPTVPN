#!/usr/bin/env bash
# harness-ensure-patches.sh — đảm bảo theme/brand FlowTech còn nguyên trên bản DSH đang cài.
#
# Vì sao cần (sự cố 21/09/2026): `npm install -g @deepseek-ai/dsh@<ver>` thay cả thư mục package
# nên xoá sạch file đã patch (theme #33C773, logo FlowTech, tên HarnessFlow, icon) — harness mất
# theme/layout mà không ai biết cho tới khi mở giao diện. Script này phát hiện "drift" và áp lại.
#
# Chạy:
#   bash scripts/harness-ensure-patches.sh            # kiểm tra, tự vá nếu thiếu
#   bash scripts/harness-ensure-patches.sh --check    # chỉ kiểm tra, FAIL-CLOSED (exit != 0 nếu thiếu/không xác minh được)
#   bash scripts/harness-ensure-patches.sh --quiet    # chỉ in khi có việc
#   bash scripts/harness-ensure-patches.sh --notify   # gửi Telegram khi vừa vá lại
#   bash scripts/harness-ensure-patches.sh --verify-install   # so sha256 repo ↔ ~/.local/share/harness-patches
#
# Biến môi trường: DSH_ROOT (mặc định $(npm root -g)/@deepseek-ai/dsh), PATCH_DIR,
#                  HARNESS_REPO_ROOT (gốc repo, cần cho --verify-install khi chạy từ bản cài).
set -uo pipefail

REPO_SELF="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Gốc repo chứa scripts/ + .dhs-setup/. Bản cài nằm ở ~/.local/share/harness-patches nên không suy
# ra được repo từ $BASH_SOURCE; --verify-install phải dùng HARNESS_REPO_ROOT khi chạy từ bản cài.
REPO_ROOT="${HARNESS_REPO_ROOT:-$REPO_SELF}"
# Bản cài trên ổ trong có patches/ nằm cạnh script (xem scripts/harness-patches-install.sh).
if [ -z "${PATCH_DIR:-}" ]; then
  if [ -f "$SCRIPT_DIR/patches/apply-flowtech-brand.py" ]; then
    PATCH_DIR="$SCRIPT_DIR/patches"
  else
    PATCH_DIR="$REPO_SELF/.dhs-setup/fpt-harness-package/patches"
  fi
fi
CHECK_ONLY=0
QUIET=0
NOTIFY=0
VERIFY_INSTALL=0
for a in "$@"; do
  case "$a" in
    --check) CHECK_ONLY=1 ;;
    --quiet) QUIET=1 ;;
    --notify) NOTIFY=1 ;;
    --verify-install) VERIFY_INSTALL=1 ;;
    -h|--help) sed -n '2,15p' "$0"; exit 0 ;;
    *) echo "tham so la: $a" >&2; exit 2 ;;
  esac
done

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
NPM_ROOT="$(npm root -g 2>/dev/null || true)"
DSH_ROOT="${DSH_ROOT:-$NPM_ROOT/@deepseek-ai/dsh}"
NM="$DSH_ROOT/node_modules/@deepseek-ai"
DIST="$NM/dsh-web-frontend/dist"
BRAND="$NM/dsh-client-ui-brand-official/lib/client.js"
THEME="$NM/dsh-client-ui-theme/lib/client.js"
SIDEBAR="$NM/dsh-client-ui-sidebar/lib/client.js"

say() { [ "$QUIET" = "1" ] || echo "$@"; }

# ---------- icon Culi (icon harness phải là hình Culi, không phải favicon FlowTech) ----------
# Vì sao: patch FlowTech ghi favicon.png/favicon.svg bằng favicon FlowTech; chủ dự án chốt icon
# harness = hình Culi (favicon-culi.png trong gói patch, 512x512). Hàm này ép lại mỗi lần chạy.
CULI_ICON="$PATCH_DIR/culi-icon.png"
CULI_MARK="$PATCH_DIR/culi-mark-256.png"
CULI_WHY=""          # lý do culi_ok() thất bại — để báo rõ THIẾU gì thay vì "OK giả"

sha256() { shasum -a 256 "$1" | awk '{print $1}'; }

# favicon.svg phải nhúng ĐÚNG PNG Culi. Chỉ `grep "culi"` là sai: comment cũng khớp chuỗi, còn ảnh
# nhúng bên trong vẫn có thể là FlowTech ⇒ phải giải base64 của data:image/png;base64,… rồi so sha256.
svg_icon_ok() {
  [ -f "$CULI_ICON" ] && [ -f "$DIST/favicon.svg" ] || return 1
  python3 - "$DIST/favicon.svg" "$CULI_ICON" <<'PYEOF'
import base64, hashlib, re, sys
try:
    svg = open(sys.argv[1], encoding="utf-8", errors="replace").read()
    want = open(sys.argv[2], "rb").read()
except OSError:
    sys.exit(1)
m = re.search(r"data:image/png;base64,([A-Za-z0-9+/=]+)", svg)
if not m:
    sys.exit(1)
try:
    embedded = base64.b64decode(m.group(1), validate=True)
except Exception:
    sys.exit(1)
sys.exit(0 if hashlib.sha256(embedded).digest() == hashlib.sha256(want).digest() else 1)
PYEOF
}

# FAIL-CLOSED: thiếu asset / không xác minh được ⇒ coi là THIẾU (bản cũ `return 0` khi thiếu asset
# ⇒ nâng cấp DSH xoá icon mà cổng vẫn in "OK").
culi_ok() {
  CULI_WHY=""
  [ -f "$CULI_ICON" ] || { CULI_WHY="thiếu asset $CULI_ICON"; return 1; }
  [ -f "$DIST/favicon.png" ] || { CULI_WHY="thiếu $DIST/favicon.png"; return 1; }
  [ "$(sha256 "$DIST/favicon.png")" = "$(sha256 "$CULI_ICON")" ] || { CULI_WHY="favicon.png khác culi-icon.png"; return 1; }
  [ -f "$CULI_MARK" ] || { CULI_WHY="thiếu asset $CULI_MARK"; return 1; }
  [ -f "$DIST/brand-mark.png" ] || { CULI_WHY="thiếu $DIST/brand-mark.png"; return 1; }
  [ "$(sha256 "$DIST/brand-mark.png")" = "$(sha256 "$CULI_MARK")" ] || { CULI_WHY="brand-mark.png khác culi-mark-256.png"; return 1; }
  svg_icon_ok || { CULI_WHY="favicon.svg không nhúng đúng PNG culi-icon.png"; return 1; }
  return 0
}

# ---------- marker màn hình boot + tiêu đề tab ----------
# Vì sao (audit t1): patch cũ tìm literal `this.wordmark=Jt(Gt.wordmark,"HARNESS")`, nhưng bundle
# 0.1.5-rc.1 đã minify thành `ot(rt.wordmark,"HARNESS")` ⇒ không khớp ⇒ no-op im lặng ⇒ màn hình
# boot vẫn hiện "HARNESS". Và tiêu đề tab runtime nằm ở dsh-client-ui-layout (không phải renderer)
# nên patch `productTitle` cũng no-op. Hai marker dưới đây để cổng bắt được đúng 2 lỗi đó.
BOOT_MARKER='wordmark.appendChild(function(){const e=document.createElement("img");e.src="/favicon.png"'
BOOT_WHY=""

boot_ok() {
  BOOT_WHY=""
  local b found=0
  for b in "$DIST"/assets/index-*.js; do
    [ -f "$b" ] || continue
    if grep -qE 'wordmark=[^;]{0,48}"HARNESS"' "$b" 2>/dev/null; then
      BOOT_WHY="$(basename "$b") còn \"HARNESS\" ở wordmark màn hình boot"
      return 1
    fi
    grep -qF "$BOOT_MARKER" "$b" 2>/dev/null && found=1
  done
  [ "$found" = "1" ] || { BOOT_WHY="không thấy ảnh boot trong $DIST/assets/index-*.js"; return 1; }
  return 0
}

apply_culi_icon() {
  [ -f "$CULI_ICON" ] || { say "[harness-patches] thiếu $CULI_ICON — không đặt được icon Culi (cổng kiểm tra sẽ báo THIẾU)"; return 1; }
  cp "$CULI_ICON" "$DIST/favicon.png"
  [ -f "$CULI_MARK" ] && cp "$CULI_MARK" "$DIST/brand-mark.png"
  # favicon.svg: nhúng thẳng PNG Culi (index.html trỏ ./favicon.svg nên phải là Culi, không phải FlowTech)
  python3 - "$CULI_ICON" "$DIST/favicon.svg" <<'PYEOF'
import base64, sys
png, out = sys.argv[1], sys.argv[2]
b64 = base64.b64encode(open(png, "rb").read()).decode()
open(out, "w", encoding="utf-8").write(
    '<!-- culi-icon: icon harness = hình Culi (xem scripts/harness-ensure-patches.sh) -->\n'
    '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">'
    f'<image width="512" height="512" href="data:image/png;base64,{b64}"/></svg>\n')
PYEOF
  say "[harness-patches] đã đặt icon Culi cho favicon.png, favicon.svg, brand-mark.png"
}

notify_telegram() {
  [ "$NOTIFY" = "1" ] || return 0
  local f="$HOME/.vpnflow-telegram" tok chat
  [ -f "$f" ] || return 0
  tok=$(grep -oE 'TELEGRAM_BOT_TOKEN:.*' "$f" 2>/dev/null | sed 's/.*: *//' | tr -d '"')
  chat=$(grep -oE 'TELEGRAM_CHAT_ID:.*' "$f" 2>/dev/null | sed 's/.*: *//' | tr -d '"')
  [ -n "$tok" ] && [ -n "$chat" ] || return 0
  curl -s -m 15 "https://api.telegram.org/bot$tok/sendMessage" -d "chat_id=$chat" \
    --data-urlencode "text=$1" >/dev/null 2>&1 || true
}

# ---------- F7: kiểm lệch repo ↔ bản cài trong $HOME (--verify-install) ----------
# Vì sao: sửa script/patch trong repo mà quên `harness-patches-install.sh` thì LaunchAgent vẫn chạy
# bản CŨ trong ~/.local/share/harness-patches mà không ai biết. Cổng này so sha256 từng file.
INSTALL_DIR="${HARNESS_INSTALL_DIR:-$HOME/.local/share/harness-patches}"
VINST_TOTAL=0
VINST_OK=0

vinst_one() { # $1 = file trong repo, $2 = file trong bản cài, $3 = nhãn
  VINST_TOTAL=$((VINST_TOTAL + 1))
  if [ ! -f "$1" ]; then
    echo "  LỆCH  $3 — thiếu ở repo: $1"
    return 1
  fi
  if [ ! -f "$2" ]; then
    echo "  LỆCH  $3 — thiếu ở bản cài: $2"
    return 1
  fi
  if [ "$(sha256 "$1")" = "$(sha256 "$2")" ]; then
    echo "  OK    $3"
    VINST_OK=$((VINST_OK + 1))
    return 0
  fi
  echo "  LỆCH  $3 — sha256 khác nhau (repo: $(sha256 "$1" | cut -c1-12)… bản cài: $(sha256 "$2" | cut -c1-12)…)"
  return 1
}

verify_install() {
  local bad=0 src
  if [ ! -f "$REPO_ROOT/scripts/harness-ensure-patches.sh" ]; then
    echo "[harness-patches] không thấy repo tại $REPO_ROOT — đặt HARNESS_REPO_ROOT=<gốc repo>" >&2
    return 1
  fi
  echo "[harness-patches] --verify-install: repo=$REPO_ROOT ↔ bản cài=$INSTALL_DIR"
  if [ ! -d "$INSTALL_DIR" ]; then
    echo "[harness-patches] chưa có bản cài $INSTALL_DIR — chạy: bash scripts/harness-patches-install.sh" >&2
    return 1
  fi
  vinst_one "$REPO_ROOT/scripts/harness-ensure-patches.sh" "$INSTALL_DIR/harness-ensure-patches.sh" \
    "harness-ensure-patches.sh" || bad=1
  # Đúng tập file mà `harness-patches-install.sh` copy (glob của patches/* = bỏ file ẩn, bỏ thư mục).
  for src in "$REPO_ROOT"/.dhs-setup/fpt-harness-package/patches/*; do
    [ -f "$src" ] || continue
    vinst_one "$src" "$INSTALL_DIR/patches/$(basename "$src")" "patches/$(basename "$src")" || bad=1
  done
  echo "[harness-patches] bản cài khớp $VINST_OK/$VINST_TOTAL file"
  if [ "$bad" = "0" ]; then
    echo "[harness-patches] bản cài trong $HOME ĐÚNG bằng repo"
    return 0
  fi
  echo "[harness-patches] LỆCH repo ↔ bản cài — chạy: bash scripts/harness-patches-install.sh" >&2
  return 1
}

if [ "$VERIFY_INSTALL" = "1" ]; then
  verify_install && exit 0 || exit 1
fi

# ---------- G1: sidebar mark — chỉ tính occurrence WIDE (ngữ cảnh brandMark/brandIdentity) ----------
# Vì sao (audit t9/t10): `renderSlot("sidebar.brand.mark", { size: N })` có HAI occurrence — WIDE
# (logo sidebar rộng, phải 72px) và RAIL thu gọn (railMark, cạnh `!wide &&`, phải giữ 24px). Cổng cũ
# chỉ `grep 'sidebar.brand.mark", { size: 72 }'` nên ĐẠT giả khi occurrence RAIL bị vá nhầm thành 72
# trong lúc occurrence WIDE vẫn 24 (>hoặc đã đổi tên). Neo theo ngữ cảnh, không theo thứ tự file.
SIDEBAR_WHY=""

sidebar_ok() {
  SIDEBAR_WHY=""
  if [ ! -f "$SIDEBAR" ]; then SIDEBAR_WHY="thiếu $SIDEBAR"; return 1; fi
  local why
  why=$(python3 - "$SIDEBAR" <<'PYEOF'
import re, sys
SLOT = re.compile(r'renderSlot\("sidebar\.brand\.mark", \{ size: (\d+) \}')
WIDE_CTX, RAIL_CTX, WINDOW = ("brandMark", "brandIdentity"), ("railMark",), 600
s = open(sys.argv[1], encoding="utf-8", errors="replace").read()
wide = rail = None
for m in SLOT.finditer(s):
    ctx = s[max(0, m.start() - WINDOW):m.start()]
    if any(k in ctx for k in RAIL_CTX):
        if rail is None:
            rail = int(m.group(1))
    elif all(k in ctx for k in WIDE_CTX):
        if wide is None:
            wide = int(m.group(1))
note = ""
if rail is not None:
    note = "; occurrence RAIL (railMark) = %dpx — phải giữ 24px%s" % (
        rail, " (bị vá nhầm?)" if rail == 72 else "")
if wide is None:
    print("khong thay occurrence WIDE (brandMark/brandIdentity) cua sidebar.brand.mark" + note)
    sys.exit(1)
if wide != 72:
    print("occurrence WIDE = %dpx (cần 72)" % wide + note)
    sys.exit(1)
sys.exit(0)
PYEOF
) || { SIDEBAR_WHY="${why:-không xác minh được}"; return 1; }
  return 0
}

# ---------- kiểm tra dấu vết patch ----------
missing() {
  # DSH_ROOT không tồn tại = KHÔNG xác minh được ⇒ trả 1. Bản cũ `return 0` ở đây chính là "OK giả"
  # đã làm sự cố 21/09/2026 đi im lặng (nâng cấp DSH xoá patch mà cổng vẫn báo nguyên vẹn).
  [ -d "$DSH_ROOT" ] || { printf 'khong thay DSH root: %s' "$DSH_ROOT"; return 1; }
  local miss=()
  [ -f "$DIST/brand-logo.png" ] || miss+=("brand-logo.png")
  [ -f "$DIST/brand-mark.png" ] || miss+=("brand-mark.png")
  grep -q "HarnessFlow" "$DIST/index.html" 2>/dev/null || miss+=("title HarnessFlow")
  grep -q "brand-mark.png" "$BRAND" 2>/dev/null || miss+=("brand-official mark")
  grep -qi "33c773" "$THEME" 2>/dev/null || miss+=("theme #33C773")
  sidebar_ok || miss+=("sidebar logo WIDE 72px (${SIDEBAR_WHY:-không xác minh được})")
  culi_ok || miss+=("icon Culi (${CULI_WHY:-không xác minh được})")
  # Tiêu đề tab runtime (DSH 0.1.5+): layout, không phải renderer (xem audit t1 F2)
  grep -q 'const productTitle = "HarnessFlow";' "$NM/dsh-client-ui-layout/lib/client.js" 2>/dev/null \
    || miss+=("productTitle ui-layout")
  # Màn hình boot: không còn "HARNESS", phải là ảnh Culi (audit t1 F3)
  boot_ok || miss+=("boot wordmark (${BOOT_WHY:-không xác minh được})")
  [ "${#miss[@]}" -eq 0 ] || { printf '%s; ' "${miss[@]}"; return 1; }
  return 0
}

DSH_VERSION="$(node -e "try{console.log(require('$DSH_ROOT/package.json').version)}catch(e){console.log('?')}" 2>/dev/null || echo '?')"

# F1 — FAIL-CLOSED: không thấy DSH_ROOT thì KHÔNG in "OK" (bản cũ rơi vào nhánh này rồi vẫn báo
# nguyên vẹn). Đây là lỗi môi trường/cài đặt, KHÁC "có drift" (patch bị `npm i -g` xoá) — in qua
# stderr kể cả khi --quiet để LaunchAgent ghi được vào /tmp/harness-patches.log.
if [ ! -d "$DSH_ROOT" ]; then
  echo "[harness-patches] KHÔNG KIỂM TRA ĐƯỢC: không thấy DSH root: $DSH_ROOT" >&2
  echo "[harness-patches] lỗi môi trường (khác 'có drift' = patch bị nâng cấp xoá) — không in OK, exit 1" >&2
  exit 1
fi

DRIFT="$(missing)" && STATUS=ok || STATUS=drift

if [ "$STATUS" = "ok" ]; then
  say "[harness-patches] OK — theme/brand FlowTech còn nguyên (DSH $DSH_VERSION, $DSH_ROOT)"
  exit 0
fi

say "[harness-patches] THIẾU: $DRIFT"
say "[harness-patches] DSH $DSH_VERSION tại $DSH_ROOT — có thể vừa bị nâng cấp (npm i -g) làm mất patch"
[ "$CHECK_ONLY" = "1" ] && exit 1

FPT_PY="$PATCH_DIR/apply-fpt-patches.py"
BRAND_PY="$PATCH_DIR/apply-flowtech-brand.py"
if [ ! -f "$FPT_PY" ] || [ ! -f "$BRAND_PY" ]; then
  echo "[harness-patches] thiếu script patch trong $PATCH_DIR — không vá được" >&2
  notify_telegram "⚠️ Harness mất theme FlowTech nhưng thiếu patch trong $PATCH_DIR — cần cài lại gói harness."
  exit 1
fi

say "[harness-patches] áp lại patch (FPT theme trước, FlowTech brand sau)…"
python3 "$FPT_PY" --dsh-root "$DSH_ROOT" 2>&1 | sed 's/^/  /' | { [ "$QUIET" = "1" ] && cat >/dev/null || cat; }
python3 "$BRAND_PY" --dsh-root "$DSH_ROOT" 2>&1 | sed 's/^/  /' | { [ "$QUIET" = "1" ] && cat >/dev/null || cat; }
apply_culi_icon

if AFTER="$(missing)"; then
  say "[harness-patches] đã vá lại xong — cần khởi động lại \`dsh web\` + Cmd+Shift+R"
  notify_telegram "✅ Harness vừa được vá lại theme/brand FlowTech (DSH $DSH_VERSION). Đang khởi động lại dsh web…"
  exit 0
fi
echo "[harness-patches] vá xong nhưng vẫn thiếu: $AFTER" >&2
notify_telegram "⚠️ Đã chạy patch harness nhưng vẫn thiếu: $AFTER — cần kiểm tra tay."
exit 1
