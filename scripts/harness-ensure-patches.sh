#!/usr/bin/env bash
# harness-ensure-patches.sh — đảm bảo theme/brand FlowTech còn nguyên trên bản DSH đang cài.
#
# Vì sao cần (sự cố 21/09/2026): `npm install -g @deepseek-ai/dsh@<ver>` thay cả thư mục package
# nên xoá sạch file đã patch (theme #33C773, logo FlowTech, tên HarnessFlow, icon) — harness mất
# theme/layout mà không ai biết cho tới khi mở giao diện. Script này phát hiện "drift" và áp lại.
#
# Chạy:
#   bash scripts/harness-ensure-patches.sh            # kiểm tra, tự vá nếu thiếu
#   bash scripts/harness-ensure-patches.sh --check    # chỉ kiểm tra (exit 1 nếu thiếu)
#   bash scripts/harness-ensure-patches.sh --quiet    # chỉ in khi có việc
#   bash scripts/harness-ensure-patches.sh --notify   # gửi Telegram khi vừa vá lại
#
# Biến môi trường: DSH_ROOT (mặc định $(npm root -g)/@deepseek-ai/dsh), PATCH_DIR.
set -uo pipefail

REPO_SELF="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
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
for a in "$@"; do
  case "$a" in
    --check) CHECK_ONLY=1 ;;
    --quiet) QUIET=1 ;;
    --notify) NOTIFY=1 ;;
    -h|--help) sed -n '2,14p' "$0"; exit 0 ;;
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

culi_ok() {
  [ -f "$CULI_ICON" ] || return 0                      # không có asset thì bỏ qua (bản cài cũ)
  [ -f "$DIST/favicon.png" ] || return 1
  [ "$(shasum -a 256 "$DIST/favicon.png" | awk '{print $1}')" = "$(shasum -a 256 "$CULI_ICON" | awk '{print $1}')" ] || return 1
  if [ -f "$CULI_MARK" ] && [ -f "$DIST/brand-mark.png" ]; then
    [ "$(shasum -a 256 "$DIST/brand-mark.png" | awk '{print $1}')" = "$(shasum -a 256 "$CULI_MARK" | awk '{print $1}')" ] || return 1
  fi
  grep -q "culi" "$DIST/favicon.svg" 2>/dev/null || return 1
  return 0
}

apply_culi_icon() {
  [ -f "$CULI_ICON" ] || { say "[harness-patches] (không có culi-icon.png — bỏ qua icon Culi)"; return 0; }
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

# ---------- kiểm tra dấu vết patch ----------
missing() {
  [ -d "$DSH_ROOT" ] || { echo "khong thay DSH root: $DSH_ROOT"; return 0; }
  local miss=()
  [ -f "$DIST/brand-logo.png" ] || miss+=("brand-logo.png")
  [ -f "$DIST/brand-mark.png" ] || miss+=("brand-mark.png")
  grep -q "HarnessFlow" "$DIST/index.html" 2>/dev/null || miss+=("title HarnessFlow")
  grep -q "brand-mark.png" "$BRAND" 2>/dev/null || miss+=("brand-official mark")
  grep -qi "33c773" "$THEME" 2>/dev/null || miss+=("theme #33C773")
  grep -q 'sidebar.brand.mark", { size: 72 }' "$SIDEBAR" 2>/dev/null || miss+=("sidebar logo 72px")
  if [ -f "$CULI_ICON" ]; then culi_ok || miss+=("icon Culi"); fi
  [ "${#miss[@]}" -eq 0 ] || { printf '%s; ' "${miss[@]}"; return 1; }
  return 0
}

DSH_VERSION="$(node -e "try{console.log(require('$DSH_ROOT/package.json').version)}catch(e){console.log('?')}" 2>/dev/null || echo '?')"
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
