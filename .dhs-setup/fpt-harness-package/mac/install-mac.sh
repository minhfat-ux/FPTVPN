#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════
#  FLOWVPN / FLOWTECH HARNESS — 1-CLICK INSTALLER (macOS)
#
#  Cài DeepSeek Harness (nếu chưa có) rồi áp style của mình vào:
#    · theme FlowVPN (màu thương hiệu, browse-picker cho truy cập từ xa)
#    · branding FlowTech / "HarnessFlow" (logo, tên, tiêu đề trang, favicon)
#
#  Cách dùng:
#    bash install-mac.sh
#    bash install-mac.sh --dsh-root /opt/homebrew/lib/node_modules/@deepseek-ai/dsh
#    bash install-mac.sh --skip-patch        # chỉ cài DSH, không patch
#
#  Chạy lại nhiều lần vô hại: mọi bước idempotent, patch tự backup `.fpt.bak`.
# ═══════════════════════════════════════════════════════════════════════
set -euo pipefail

DSH_ROOT=""
SKIP_PATCH=0
while [ $# -gt 0 ]; do
  case "$1" in
    --dsh-root) DSH_ROOT="${2:-}"; shift 2 ;;
    --skip-patch) SKIP_PATCH=1; shift ;;
    -h|--help) sed -n '2,16p' "$0"; exit 0 ;;
    *) echo "tham số lạ: $1" >&2; exit 2 ;;
  esac
done

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -d "$SRC/patches" ]; then PATCH_DIR="$SRC/patches"; else PATCH_DIR="$SRC/../patches"; fi
if [ -f "$SRC/profile/cordis.patch.yml" ]; then PROF_SRC="$SRC/profile/cordis.patch.yml"; else PROF_SRC="$SRC/../profile/cordis.patch.yml"; fi

C_G=$'\033[32m'; C_C=$'\033[36m'; C_Y=$'\033[33m'; C_0=$'\033[0m'
log()  { printf '%s==> %s%s\n' "$C_G" "$*" "$C_0"; }
info() { printf '%s--> %s%s\n' "$C_C" "$*" "$C_0"; }
ok()   { printf '   %sOK%s  %s\n' "$C_G" "$C_0" "$*"; }
warn() { printf '   %s!!%s  %s\n' "$C_Y" "$C_0" "$*"; }

printf '\n  ============================================\n'
printf '   FLOWTECH HARNESS - CAI DAT 1-CLICK (macOS)\n'
printf '  ============================================\n\n'

# ---------- [1] Node.js ----------
log "Kiem tra tien quyet"
if ! command -v node >/dev/null 2>&1; then
  warn "Chua thay Node.js."
  if command -v brew >/dev/null 2>&1; then
    warn "Dang cai Node.js LTS qua Homebrew..."
    brew install node
  else
    echo "   Hay cai Node.js LTS tu https://nodejs.org (hoac Homebrew: brew install node) roi chay lai." >&2
    exit 1
  fi
fi
ok "Node.js: $(node --version)"

# ---------- [2] DSH ----------
NPM_ROOT="$(npm root -g 2>/dev/null || true)"
if [ -z "$DSH_ROOT" ]; then
  DSH_ROOT="$NPM_ROOT/@deepseek-ai/dsh"
fi
if [ ! -d "$DSH_ROOT" ]; then
  log "Chua thay DSH. Dang cai @deepseek-ai/dsh toan cau..."
  npm install -g @deepseek-ai/dsh
  NPM_ROOT="$(npm root -g 2>/dev/null || true)"
  DSH_ROOT="$NPM_ROOT/@deepseek-ai/dsh"
  [ -d "$DSH_ROOT" ] || { echo "Cai DSH that bai. Chay lai: npm install -g @deepseek-ai/dsh" >&2; exit 1; }
fi
ok "DSH: $DSH_ROOT"

# ---------- [3] Python 3 (cho script patch) ----------
if [ "$SKIP_PATCH" = "0" ]; then
  if ! command -v python3 >/dev/null 2>&1; then
    warn "Chua thay python3."
    if command -v brew >/dev/null 2>&1; then
      warn "Dang cai python qua Homebrew..."
      brew install python
    else
      warn "Chay: xcode-select --install  (hoac brew install python) roi chay lai." >&2
      exit 1
    fi
  fi
  ok "Python: $(python3 --version 2>&1)"
fi

# ---------- [4] patch style ----------
if [ "$SKIP_PATCH" = "1" ]; then
  info "Bo qua patch (--skip-patch)"
else
  FPT_PY="$PATCH_DIR/apply-fpt-patches.py"
  BRAND_PY="$PATCH_DIR/apply-flowtech-brand.py"
  [ -f "$FPT_PY" ] || { echo "THIEU $FPT_PY - copy ca package (xem README-MAC.md)" >&2; exit 1; }

  log "Ap patch FlowVPN (theme, favicon, browse-picker) - backup .fpt.bak"
  python3 "$FPT_PY" --dsh-root "$DSH_ROOT"
  ok "Patch FlowVPN xong"

  if [ -f "$BRAND_PY" ]; then
    log "Ap branding FlowTech (logo, ten, title, favicon)"
    python3 "$BRAND_PY" --dsh-root "$DSH_ROOT"
    ok "Branding FlowTech xong"
  else
    warn "Khong thay $BRAND_PY - bo qua branding FlowTech"
  fi

  log "Cai profile (pin browse directory picker cho truy cap tu xa)"
  PROF_DIR="$HOME/.dsh/profiles/web"
  mkdir -p "$PROF_DIR"
  if [ -f "$PROF_SRC" ]; then
    [ -f "$PROF_DIR/cordis.patch.yml" ] && [ ! -f "$PROF_DIR/cordis.patch.yml.bak" ] \
      && cp "$PROF_DIR/cordis.patch.yml" "$PROF_DIR/cordis.patch.yml.bak"
    cp "$PROF_SRC" "$PROF_DIR/cordis.patch.yml"
    ok "profile: $PROF_DIR/cordis.patch.yml"
  else
    warn "Khong thay $PROF_SRC - bo qua profile"
  fi
fi

printf '\n  ============================================\n'
printf '   XONG\n'
printf '  ============================================\n'
printf '  1) Restart DSH:  Ctrl+C cua so `dsh web` roi chay lai  dsh web\n'
printf '  2) Trong trinh duyet:  Ctrl+Shift+R  (hard refresh)\n'
printf '  Ghi chu: patch chi doi style/branding, khong dung du lieu phien lam viec.\n\n'
