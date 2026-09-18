#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════
#  FlowTech Harness — bootstrap tự cài MỌI thứ cho macOS, chạy 1 dòng lệnh:
#
#      curl -fsSL https://meetflowai.site/dl/harness/install.sh | bash
#
#  Nó tự làm, theo thứ tự:
#    1) Node.js LTS (Homebrew; chưa có Homebrew thì cài Homebrew trước)
#    2) DeepSeek Harness:  npm install -g @deepseek-ai/dsh
#    3) Python 3 (cho script patch; qua Homebrew nếu thiếu)
#    4) Tải bộ cài đúng phiên bản mới nhất -> chạy installer (theme FlowVPN + branding FlowTech)
#
#  Bộ cài lấy từ latest.json (đọc kèm ?t=<epoch> để Cloudflare không trả bản cũ) và được
#  kiểm tra sha256 trước khi chạy.
#
#  Tham số (khi chạy từ file):  --bundle-base <url>  --skip-patch
# ═══════════════════════════════════════════════════════════════════════
set -euo pipefail

BUNDLE_BASE="https://meetflowai.site/dl/harness"
SKIP_PATCH=0
while [ $# -gt 0 ]; do
  case "$1" in
    --bundle-base) BUNDLE_BASE="${2:-}"; shift 2 ;;
    --skip-patch) SKIP_PATCH=1; shift ;;
    -h|--help) sed -n '2,18p' "$0"; exit 0 ;;
    *) echo "tham số lạ: $1" >&2; exit 2 ;;
  esac
done

C_G=$'\033[32m'; C_C=$'\033[36m'; C_Y=$'\033[33m'; C_0=$'\033[0m'
log()  { printf '%s==> %s%s\n' "$C_G" "$*" "$C_0"; }
info() { printf '%s--> %s%s\n' "$C_C" "$*" "$C_0"; }
ok()   { printf '   %sOK%s  %s\n' "$C_G" "$C_0" "$*"; }
warn() { printf '   %s!!%s  %s\n' "$C_Y" "$C_0" "$*"; }

printf '\n  ============================================\n'
printf '   FLOWTECH HARNESS - CAI DAT TU DONG (macOS)\n'
printf '  ============================================\n\n'

ensure_brew() {
  if command -v brew >/dev/null 2>&1; then return 0; fi
  warn "Chua co Homebrew — dang cai (co the hoi mat khau quan tri)..."
  NONINTERACTIVE=1 /bin/bash -c \
    "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  if [ -x /opt/homebrew/bin/brew ]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
  elif [ -x /usr/local/bin/brew ]; then
    eval "$(/usr/local/bin/brew shellenv)"
  fi
  command -v brew >/dev/null 2>&1
}

# ---------- [1] Node.js ----------
log "Buoc 1/4: Node.js"
if command -v node >/dev/null 2>&1; then
  ok "da co Node.js $(node --version)"
else
  if ensure_brew; then
    info "cai Node.js LTS qua Homebrew..."
    brew install node
  else
    echo "   Hay cai Node.js LTS tu https://nodejs.org roi chay lai lenh nay." >&2
    exit 1
  fi
  command -v node >/dev/null 2>&1 || { echo "Cai Node.js that bai." >&2; exit 1; }
  ok "Node.js $(node --version)"
fi

# ---------- [2] DeepSeek Harness ----------
log "Buoc 2/4: DeepSeek Harness"
NPM_ROOT="$(npm root -g 2>/dev/null || true)"
if [ -d "$NPM_ROOT/@deepseek-ai/dsh" ]; then
  ok "da co DSH: $NPM_ROOT/@deepseek-ai/dsh"
else
  info "cai @deepseek-ai/dsh (toan cau)..."
  npm install -g @deepseek-ai/dsh
  NPM_ROOT="$(npm root -g 2>/dev/null || true)"
  [ -d "$NPM_ROOT/@deepseek-ai/dsh" ] || { echo "Cai DSH that bai. Chay lai: npm install -g @deepseek-ai/dsh" >&2; exit 1; }
  ok "DSH: $NPM_ROOT/@deepseek-ai/dsh"
fi

# ---------- [3] tai bo cai moi nhat ----------
log "Buoc 3/4: tai bo cai moi nhat"
if [ "$SKIP_PATCH" = "0" ]; then
  if ! command -v python3 >/dev/null 2>&1; then
    if ensure_brew; then
      info "cai python qua Homebrew (buoc patch can python3)..."
      brew install python
    else
      echo "   Hay chay: xcode-select --install   roi chay lai lenh nay." >&2
      exit 1
    fi
  fi
  ok "Python: $(python3 --version 2>&1)"
fi

STAMP="$(date +%s)"
LATEST="$(curl -fsSL "$BUNDLE_BASE/latest.json?t=$STAMP")"
FILE="$(printf '%s' "$LATEST" | sed -n 's/.*"mac"[^}]*"file"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')"
WANT_SHA="$(printf '%s' "$LATEST" | sed -n 's/.*"mac"[^}]*"sha256"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')"
[ -n "$FILE" ] && [ -n "$WANT_SHA" ] || { echo "latest.json thieu thong tin cho mac" >&2; exit 1; }
info "$BUNDLE_BASE/$FILE"

TMPDIR_H="$(mktemp -d)"
trap 'rm -rf "$TMPDIR_H"' EXIT
ZIP="$TMPDIR_H/$FILE"
curl -fL --progress-bar "$BUNDLE_BASE/$FILE" -o "$ZIP"

GOT_SHA="$(shasum -a 256 "$ZIP" | awk '{print $1}')"
[ "$GOT_SHA" = "$WANT_SHA" ] || { echo "sha256 khong khop (mong doi $WANT_SHA, nhan $GOT_SHA) — thu lai" >&2; exit 1; }
ok "tai xong + sha256 khop (${GOT_SHA:0:12}...)"

unzip -q "$ZIP" -d "$TMPDIR_H/bundle"

# ---------- [4] chay installer ----------
log "Buoc 4/4: ap style FlowVPN + branding FlowTech"
INSTALLER="$(find "$TMPDIR_H/bundle" -name install-mac.sh -maxdepth 3 | head -1)"
[ -n "$INSTALLER" ] || { echo "Khong thay install-mac.sh trong bo cai" >&2; exit 1; }
ARGS=()
[ "$SKIP_PATCH" = "1" ] && ARGS+=(--skip-patch)
bash "$INSTALLER" "${ARGS[@]:-}"

printf '\n  ============================================\n'
printf '   XONG\n'
printf '  ============================================\n'
printf '  1) Restart DSH:  Ctrl+C cua so `dsh web` roi chay lai  dsh web\n'
printf '  2) Trong trinh duyet:  Cmd+Shift+R  (hard refresh)\n\n'
