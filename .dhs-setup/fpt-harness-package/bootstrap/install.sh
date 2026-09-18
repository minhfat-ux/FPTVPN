#!/usr/bin/env bash
# =======================================================================
#  FlowTech Harness — bootstrap tự cài MỌI thứ cho macOS, chạy 1 dòng lệnh:
#
#      curl -fsSL https://meetflowai.site/dl/harness/install.sh | bash
#
#  Quy trình:
#    [0/5] KIỂM TRA HỆ THỐNG — liệt kê đã có gì / thiếu gì (không sửa gì)
#    [1/5] XÁC NHẬN          — in rõ thao tác sẽ làm, chờ người dùng đồng ý
#    [2/5] Node.js LTS       — Homebrew; chưa có thì cài Homebrew; cùng lắm tải .pkg từ nodejs.org
#    [3/5] DeepSeek Harness  — npm install -g @deepseek-ai/dsh
#    [4/5] Python 3          — Homebrew / Xcode CLT (chỉ cần khi patch style)
#    [5/5] Bộ cài + patch    — tải zip (verify sha256) → theme FlowVPN + branding FlowTech
#
#  KHÔNG cài gì nếu người dùng không đồng ý. Mọi file bị sửa đều có backup `.fpt.bak`.
#
#  Tham số:  --check | --yes | --skip-patch | --bundle-base <url> | --help
# =======================================================================
set -euo pipefail

BUNDLE_BASE="https://meetflowai.site/dl/harness"
SKIP_PATCH=0
CHECK_ONLY=0
ASSUME_YES=0
DECLINE=0

usage() {
  cat <<'TXT'
FlowTech Harness — bootstrap cho macOS

  curl -fsSL https://meetflowai.site/dl/harness/install.sh | bash
  curl -fsSL https://meetflowai.site/dl/harness/install.sh | bash -s -- --check
  curl -fsSL https://meetflowai.site/dl/harness/install.sh | bash -s -- --yes

  --check            chỉ kiểm tra hệ thống, không cài/sửa gì (exit 1 nếu còn thiếu)
  --yes              đồng ý trước, không hỏi lại
  --no               từ chối trước: chỉ kiểm tra rồi thoát, không cài gì
  --skip-patch       chỉ cài Node + DSH, không patch giao diện (không cần Python)
  --bundle-base URL  gốc chứa latest.json + zip (mặc định https://meetflowai.site/dl/harness)
  --help             in trợ giúp này
TXT
}

while [ $# -gt 0 ]; do
  case "$1" in
    --bundle-base) BUNDLE_BASE="${2:-}"; shift 2 ;;
    --skip-patch)  SKIP_PATCH=1; shift ;;
    --check)       CHECK_ONLY=1; shift ;;
    --yes|-y)      ASSUME_YES=1; shift ;;
    --no|-n)       DECLINE=1; shift ;;
    -h|--help)     usage; exit 0 ;;
    *) echo "tham số lạ: $1 (xem --help)" >&2; exit 2 ;;
  esac
done

C_G=$'\033[32m'; C_C=$'\033[36m'; C_Y=$'\033[33m'; C_R=$'\033[31m'; C_0=$'\033[0m'
log()  { printf '%s==> %s%s\n' "$C_G" "$*" "$C_0"; }
info() { printf '%s--> %s%s\n' "$C_C" "$*" "$C_0"; }
ok()   { printf '   %sOK%s  %s\n' "$C_G" "$C_0" "$*"; }
warn() { printf '   %s!!%s  %s\n' "$C_Y" "$C_0" "$*"; }
err()  { printf '   %sXX%s  %s\n' "$C_R" "$C_0" "$*" >&2; }

# ---------------------------------------------------------------- trạng thái
REPORT=()
NEED=()
add()  { REPORT+=("$1|$2|$3"); }          # trạng thái | tên | chi tiết
need() { NEED+=("$1"); }

show_report() {
  printf '\n  ----------------- KIỂM TRA HỆ THỐNG -----------------\n'
  local row status name detail color
  for row in "${REPORT[@]}"; do
    IFS='|' read -r status name detail <<<"$row"
    case "$status" in
      OK|"ĐÃ CÀI") color="$C_G" ;;
      "THIẾU"|WARN) color="$C_Y" ;;
      FAIL) color="$C_R" ;;
      *) color="$C_0" ;;
    esac
    printf '   %b%-7s%b %-22s %s\n' "$color" "$status" "$C_0" "$name" "$detail"
  done
  printf '  -----------------------------------------------------\n'
}

# ---------------------------------------------------------------- tiện ích
has() { command -v "$1" >/dev/null 2>&1; }

# Lấy "phiên bản chính" của một lệnh; KHÔNG làm chết script khi lệnh lỗi
# (set -e + pipefail: `var=$(cmd | awk ...)` sẽ thoát nếu cmd trả mã khác 0 —
#  ví dụ `python3` trên macOS khi chưa có Xcode CLT, hoặc stub của Microsoft Store).
probe_ver() { # $1 = lệnh in ra "X.Y.Z"; in ra "X.Y.Z" hoặc rỗng
  local out
  out="$("$@" 2>&1 | head -1)" || out=""
  out="$(printf '%s' "$out" | grep -oE '[0-9]+(\.[0-9]+)+' | head -1)" || out=""
  printf '%s' "$out"
}

# So sánh phiên bản kiểu 22.14.0 >= 18.0 (chỉ dùng awk, không phụ thuộc sort -V của BSD/GNU)
ver_ge() {
  awk -v a="$1" -v b="$2" 'BEGIN{
    gsub(/^v/, "", a); gsub(/^v/, "", b);
    split(a, x, "."); split(b, y, ".");
    for (i = 1; i <= 3; i++) { xi = x[i] + 0; yi = y[i] + 0; if (xi > yi) exit 0; if (xi < yi) exit 1 }
    exit 0
  }'
}

url_ok() { curl -fsS -m 15 -o /dev/null "$1" >/dev/null 2>&1; }

free_gb() {
  df -Pk "${1:-$HOME}" 2>/dev/null | awk 'NR==2 {printf "%.1f", $4/1048576}' || echo 0
}

node_bin() {
  if has node; then command -v node; return 0; fi
  for p in /opt/homebrew/bin/node /usr/local/bin/node "$HOME/.nvm/versions/node"/*/bin/node; do
    [ -x "$p" ] && { printf '%s\n' "$p"; return 0; }
  done
  return 1
}

npm_bin() {
  if has npm; then command -v npm; return 0; fi
  for p in /opt/homebrew/bin/npm /usr/local/bin/npm; do
    [ -x "$p" ] && { printf '%s\n' "$p"; return 0; }
  done
  return 1
}

dsh_path() {
  local root
  root="$(npm root -g 2>/dev/null || true)"
  if [ -n "$root" ] && [ -d "$root/@deepseek-ai/dsh" ]; then printf '%s\n' "$root/@deepseek-ai/dsh"; return 0; fi
  for p in "$HOME/.npm-global/lib/node_modules/@deepseek-ai/dsh" \
           /opt/homebrew/lib/node_modules/@deepseek-ai/dsh \
           /usr/local/lib/node_modules/@deepseek-ai/dsh; do
    [ -d "$p" ] && { printf '%s\n' "$p"; return 0; }
  done
  return 1
}

eval_brew() {
  if [ -x /opt/homebrew/bin/brew ]; then eval "$(/opt/homebrew/bin/brew shellenv)"
  elif [ -x /usr/local/bin/brew ]; then eval "$(/usr/local/bin/brew shellenv)"
  fi
}

xcode_clt_ok() { xcode-select -p >/dev/null 2>&1; }

install_clt() {
  warn "Chưa có Xcode Command Line Tools — đang mở hộp thoại cài của Apple..."
  xcode-select --install >/dev/null 2>&1 || true
  local i=0
  while [ "$i" -lt 60 ]; do
    if xcode_clt_ok; then ok "Xcode CLT đã xong"; return 0; fi
    sleep 10; i=$((i+1))
    [ $((i % 6)) -eq 0 ] && info "vẫn chờ Xcode CLT... ($((i*10))s — bấm 'Install' trong hộp thoại nếu chưa)"
  done
  return 1
}

ensure_brew() {
  if has brew; then return 0; fi
  eval_brew && has brew && return 0
  xcode_clt_ok || install_clt || return 1
  info "cài Homebrew (có thể hỏi mật khẩu quản trị)..."
  NONINTERACTIVE=1 /bin/bash -c \
    "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)" || true
  eval_brew
  has brew
}

install_node() {
  # 1) Homebrew
  if ensure_brew; then
    info "cài Node.js LTS qua Homebrew..."
    brew install node || true
    eval_brew
    node_bin >/dev/null && return 0
  fi
  # 2) .pkg chính thức (universal, không cần Homebrew/CLT) — cần mật khẩu admin
  local ver="v22.14.0" json pkg
  json="$(curl -fsSL -m 30 https://nodejs.org/dist/index.json 2>/dev/null || true)"
  if [ -n "$json" ]; then
    local lts
    lts="$(printf '%s' "$json" | tr '}' '\n' | grep -m1 '"lts":"' | sed -n 's/.*"version":"\(v[0-9.]*\)".*/\1/p' || true)"
    [ -n "$lts" ] && ver="$lts"
  fi
  pkg="$TMPDIR_H/node-$ver.pkg"
  info "tải Node.js $ver (.pkg universal) từ nodejs.org..."
  curl -fL --progress-bar "https://nodejs.org/dist/$ver/node-$ver.pkg" -o "$pkg" || return 1
  info "cài Node (sẽ hỏi mật khẩu quản trị)..."
  sudo installer -pkg "$pkg" -target / || return 1
  export PATH="/usr/local/bin:$PATH"
  node_bin >/dev/null
}

install_python() {
  if ensure_brew; then
    info "cài Python 3 qua Homebrew..."
    brew install python || true
    eval_brew
  fi
  has python3
}

install_dsh() {
  local npmc; npmc="$(npm_bin)" || return 1
  info "cài @deepseek-ai/dsh (toàn cục)..."
  if "$npmc" install -g @deepseek-ai/dsh; then return 0; fi
  # prefix toàn cục không ghi được -> dùng prefix người dùng (không cần sudo)
  warn "npm install -g lỗi (thường do prefix hệ thống không ghi được) — thử prefix người dùng..."
  local prefix="$HOME/.npm-global"
  mkdir -p "$prefix"
  "$npmc" install -g --prefix "$prefix" @deepseek-ai/dsh || return 1
  export PATH="$prefix/bin:$PATH"
  ensure_path_line "export PATH=\"\$HOME/.npm-global/bin:\$PATH\""
  dsh_path >/dev/null
}

ensure_path_line() {
  local line="$1" file="$HOME/.zprofile"
  if [ -f "$file" ] && grep -qF "$line" "$file" 2>/dev/null; then return 0; fi
  printf '\n# FlowTech Harness\n%s\n' "$line" >> "$file"
  ok "đã thêm vào $file: $line"
}

# ---------------------------------------------------------------- banner
printf '\n  ============================================\n'
printf '   FLOWTECH HARNESS - CAI DAT TU DONG (macOS)\n'
printf '  ============================================\n\n'

TMPDIR_H="$(mktemp -d)"
trap 'rm -rf "$TMPDIR_H"' EXIT

# ================================================================ [0/5] kiểm tra
log "[0/5] Kiểm tra hệ thống (chưa cài/sửa gì)"

osver="$(sw_vers -productVersion 2>/dev/null || echo "?")"
arch="$(uname -m)"
add OK "macOS" "$osver ($arch)"
case "$osver" in
  1[0-5].*|9.*|8.*) warn "macOS khá cũ ($osver) — Node 18+ cần macOS 10.15+" ;;
esac

add OK "Kiến trúc" "${arch} ($( [ "$arch" = arm64 ] && echo 'Apple Silicon' || echo 'Intel' ))"
add OK "shell" "${SHELL:-/bin/bash} · bash $BASH_VERSION"

if url_ok "$BUNDLE_BASE/latest.json"; then add OK "Internet - CDN" "$BUNDLE_BASE"
else add FAIL "Internet - CDN" "không kết nối được $BUNDLE_BASE"; need "Internet (CDN)"; fi
if url_ok "https://registry.npmjs.org/-/ping"; then add OK "Internet - npm" "registry.npmjs.org"
else add FAIL "Internet - npm" "không kết nối được registry.npmjs.org"; need "Internet (npm)"; fi
if url_ok "https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh"; then add OK "Internet - GitHub" "raw.githubusercontent.com"
else add WARN "Internet - GitHub" "không tới được GitHub (chỉ cần khi phải cài Homebrew)"; fi

freev="$(free_gb "$HOME")"
if [ "$(printf '%.1f' "$freev" | cut -d. -f1)" -lt 1 ]; then
  add "THIẾU" "Dung lượng đĩa" "${freev} GB trống — cần >= 1.5 GB"; need "Dung lượng đĩa"
else
  add OK "Dung lượng đĩa" "${freev} GB trống"
fi

for tool in curl unzip shasum; do
  if has "$tool"; then add OK "$tool" "$(command -v "$tool")"; else add "THIẾU" "$tool" "thiếu công cụ bắt buộc"; need "$tool"; fi
done
if has tar; then add OK "tar" "$(command -v tar)"; else add WARN "tar" "không có (không bắt buộc)"; fi

if xcode_clt_ok; then add OK "Xcode CLT" "$(xcode-select -p)"
else add "THIẾU" "Xcode CLT" "chưa cài (Homebrew cần) — sẽ mở hộp thoại cài của Apple"; need "Xcode CLT"; fi

if has brew || [ -x /opt/homebrew/bin/brew ] || [ -x /usr/local/bin/brew ]; then
  eval_brew; add OK "Homebrew" "$(brew --version 2>/dev/null | head -1)"
else
  add "THIẾU" "Homebrew" "chưa cài (dùng để cài Node/Python)"; need "Homebrew"
fi

if node_bin >/dev/null; then
  nv="$(node --version 2>/dev/null || /opt/homebrew/bin/node --version 2>/dev/null || echo '')"
  if ver_ge "$nv" "18.0"; then add OK "Node.js" "$nv (>= 18)"; else add "THIẾU" "Node.js" "$nv quá cũ — cần >= 18"; need "Node.js"; fi
else
  add "THIẾU" "Node.js" "chưa cài"; need "Node.js"
fi

if npm_bin >/dev/null; then add OK "npm" "$(npm --version 2>/dev/null)"; else add "THIẾU" "npm" "đi kèm Node.js"; fi

if [ "$SKIP_PATCH" = "1" ]; then
  add OK "Python 3" "không cần (đang --skip-patch)"
elif has python3; then
  pv="$(probe_ver python3 --version)"
  if ver_ge "$pv" "3.8"; then add OK "Python 3" "$pv (>= 3.8)"; else add "THIẾU" "Python 3" "$pv quá cũ — cần >= 3.8"; need "Python 3"; fi
else
  add "THIẾU" "Python 3" "chưa cài (bước patch cần Python)"; need "Python 3"
fi

if dsh_path >/dev/null; then add OK "DeepSeek Harness" "$(dsh_path)"
else add "THIẾU" "DeepSeek Harness" "@deepseek-ai/dsh chưa cài"; need "DeepSeek Harness"; fi

npm_prefix="$(npm config get prefix 2>/dev/null || echo '')"
if [ -n "$npm_prefix" ]; then
  if [ -w "$npm_prefix/lib/node_modules" ] || [ -w "$npm_prefix" ]; then
    add OK "Quyền ghi npm global" "$npm_prefix (ghi được, không cần sudo)"
  else
    add WARN "Quyền ghi npm global" "$npm_prefix (không ghi được — sẽ dùng ~/.npm-global)"
  fi
fi

show_report

if [ "$CHECK_ONLY" = "1" ]; then
  printf '\n'
  if [ "${#NEED[@]}" -eq 0 ]; then
    printf '  %sKết luận: hệ thống ĐÃ ĐỦ mọi thứ cần thiết.%s\n' "$C_G" "$C_0"
    exit 0
  fi
  printf '  %sKết luận: còn thiếu -> %s%s\n' "$C_Y" "$(printf '%s, ' "${NEED[@]}" | sed 's/, $//')" "$C_0"
  printf '  %sChạy lại KHÔNG có --check để tự cài (sẽ hỏi đồng ý trước khi cài).%s\n' "$C_C" "$C_0"
  exit 1
fi

# ================================================================ [1/5] xác nhận
log "[1/5] Xác nhận trước khi cài"
[ "${#NEED[@]}" -eq 0 ] && ok "không thiếu gì — chỉ còn tải bộ cài + patch giao diện"

printf '\n  ---------------- ĐIỀU KHOẢN CÀI ĐẶT ----------------\n'
printf '  Bootstrap sẽ THỰC HIỆN các thao tác sau trên máy này:\n'
n=1
for item in "${NEED[@]}"; do
  case "$item" in
    "Node.js")            printf '   %d. Cài Node.js LTS (Homebrew, hoặc .pkg từ nodejs.org nếu chưa có Homebrew)\n' "$n" ;;
    "Homebrew")           printf '   %d. Cài Homebrew (có thể hỏi mật khẩu quản trị)\n' "$n" ;;
    "Xcode CLT")          printf '   %d. Cài Xcode Command Line Tools (hộp thoại của Apple, có thể mất vài phút)\n' "$n" ;;
    "Python 3")           printf '   %d. Cài Python 3 (Homebrew) — chỉ để chạy script patch\n' "$n" ;;
    "DeepSeek Harness")   printf '   %d. Cài DeepSeek Harness: npm install -g @deepseek-ai/dsh\n' "$n" ;;
    "Dung lượng đĩa")     printf '   %d. (!) Cần giải phóng thêm dung lượng đĩa — bootstrap sẽ DỪNG, không tự xoá gì\n' "$n" ;;
    *)                    printf '   %d. Xử lý: %s\n' "$n" "$item" ;;
  esac
  n=$((n+1))
done
if [ "$SKIP_PATCH" = "1" ]; then
  printf '   %d. Tải gói FlowTech Harness + chạy installer với --skip-patch (không đổi giao diện)\n' "$n"
else
  printf '   %d. Tải gói FlowTech Harness + patch giao diện DSH:\n' "$n"
  printf '      theme FlowVPN + branding FlowTech + favicon + browse-picker\n'
  printf '      (mọi file bị sửa đều backup thành <file>.fpt.bak, chạy lại nhiều lần vô hại)\n'
fi
n=$((n+1))
printf '   %d. (chỉ khi cần) thêm 1 dòng PATH vào ~/.zprofile nếu npm global không ghi được\n' "$n"
printf '\n  KHÔNG thu thập dữ liệu cá nhân. KHÔNG đụng tới phiên làm việc (~/.dsh/sessions).\n'
printf '  Cài vào thư mục người dùng + npm global; chỉ hỏi mật khẩu khi macOS/Homebrew yêu cầu.\n'
printf '  ---------------------------------------------------\n\n'

if [ "$DECLINE" = "1" ]; then
  printf '\n  %sĐã HUỶ (--no) — chỉ kiểm tra, không cài gì. Máy không bị thay đổi.%s\n' "$C_Y" "$C_0"
  exit 0
fi

if [ "$ASSUME_YES" != "1" ]; then
  if [ -r /dev/tty ]; then
    printf '  Bạn đồng ý cài đặt? (y/N) '
    read -r ans < /dev/tty || ans=""
  else
    err "Không có terminal để hỏi đồng ý (stdin là script từ curl)."
    printf '  Nếu bạn đồng ý với các điều khoản trên, chạy lại với --yes:\n' >&2
    printf '    curl -fsSL %s/install.sh | bash -s -- --yes\n' "$BUNDLE_BASE" >&2
    exit 3
  fi
  case "$ans" in
    y|Y|yes|YES|Yes) ok "đã đồng ý" ;;
    *) printf '\n  %sĐã HUỶ — không cài gì cả. Máy không bị thay đổi.%s\n' "$C_Y" "$C_0"; exit 0 ;;
  esac
else
  ok "đã đồng ý trước bằng --yes"
fi

# ================================================================ [2/5] Node
log "[2/5] Node.js + npm"
if node_bin >/dev/null && npm_bin >/dev/null; then
  ok "đã có Node.js $(node --version) / npm $(npm --version)"
else
  if install_node; then ok "Node.js $(node --version) / npm $(npm --version)"
  else err "Cài Node.js thất bại. Tải tay từ https://nodejs.org rồi chạy lại lệnh này."; exit 1; fi
fi

# ================================================================ [3/5] DSH
log "[3/5] DeepSeek Harness"
if dsh_path >/dev/null; then
  ok "đã có DSH: $(dsh_path)"
else
  if install_dsh; then ok "DSH: $(dsh_path)"
  else err "Cài DSH thất bại. Chạy lại: npm install -g @deepseek-ai/dsh"; exit 1; fi
fi

# ================================================================ [4/5] Python
if [ "$SKIP_PATCH" = "1" ]; then
  log "[4/5] Python 3 — bỏ qua (--skip-patch)"
else
  log "[4/5] Python 3 (cho bước patch)"
  if has python3; then ok "đã có $(python3 --version 2>&1)"
  else
    if install_python; then ok "$(python3 --version 2>&1)"
    else err "Cài Python 3 thất bại. Chạy: xcode-select --install  hoặc  brew install python"; exit 1; fi
  fi
fi

# ================================================================ [5/5] tải + patch
log "[5/5] Tải bộ cài mới nhất + áp style"
STAMP="$(date +%s)"
LATEST="$(curl -fsSL "$BUNDLE_BASE/latest.json?t=$STAMP")" || { err "không tải được latest.json từ $BUNDLE_BASE"; exit 1; }
FILE="$(printf '%s' "$LATEST" | sed -n 's/.*"mac"[^}]*"file"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')"
WANT_SHA="$(printf '%s' "$LATEST" | sed -n 's/.*"mac"[^}]*"sha256"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')"
[ -n "$FILE" ] && [ -n "$WANT_SHA" ] || { err "latest.json thiếu thông tin cho mac"; exit 1; }
info "$BUNDLE_BASE/$FILE"
ZIP="$TMPDIR_H/$FILE"
curl -fL --progress-bar "$BUNDLE_BASE/$FILE" -o "$ZIP"

GOT_SHA="$(shasum -a 256 "$ZIP" | awk '{print $1}')"
[ "$GOT_SHA" = "$WANT_SHA" ] || { err "sha256 không khớp (mong đợi $WANT_SHA, nhận $GOT_SHA) — thử lại"; exit 1; }
ok "tải xong + sha256 khớp (${GOT_SHA:0:12}...)"

unzip -q "$ZIP" -d "$TMPDIR_H/bundle"

INSTALLER="$(find "$TMPDIR_H/bundle" -name install-mac.sh -maxdepth 3 2>/dev/null | head -1)" || INSTALLER=""
[ -n "$INSTALLER" ] || { err "Không thấy install-mac.sh trong bộ cài"; exit 1; }
ARGS=()
if [ "$SKIP_PATCH" = "1" ]; then ARGS+=(--skip-patch); fi
bash "$INSTALLER" ${ARGS[@]+"${ARGS[@]}"}

# ================================================================ kiểm tra lại
printf '\n'
log "Kiểm tra lại sau khi cài"
REPORT=()
eval_brew || true
if node_bin >/dev/null; then add OK "Node.js" "$(node --version)"; else add FAIL "Node.js" "không thấy"; fi
if npm_bin  >/dev/null; then add OK "npm" "$(npm --version)"; else add FAIL "npm" "không thấy"; fi
if [ "$SKIP_PATCH" = "0" ]; then
  if has python3; then add OK "Python 3" "$(python3 --version 2>&1)"; else add FAIL "Python 3" "không thấy"; fi
fi
if dsh_path >/dev/null; then add OK "DeepSeek Harness" "$(dsh_path)"; else add FAIL "DeepSeek Harness" "không thấy"; fi

dshp="$(dsh_path || true)"
if [ -f "$dist/index.html" ]; then
  title="$(sed -n 's/.*<title>\([^<]*\)<\/title>.*/\1/p' "$dist/index.html" 2>/dev/null | head -1)" || title=""
  if [ "$title" = "HarnessFlow" ]; then add OK "Giao diện" "<title>HarnessFlow</title>"; else add WARN "Giao diện" "title = '$title' (chưa patch?)"; fi
fi
show_report

if ! has dsh; then
  printf '\n  %sLưu ý:%s chưa thấy lệnh `dsh` trong PATH hiện tại. Mở terminal mới hoặc chạy:\n' "$C_Y" "$C_0"
  printf '    export PATH="%s/bin:$PATH"\n' "$(dirname "$(dirname "$(npm_bin)")")"
fi

printf '\n  ============================================\n'
printf '   XONG\n'
printf '  ============================================\n'
printf '   1) Restart DSH:  Ctrl+C cửa sổ `dsh web` rồi chạy lại  dsh web\n'
printf '   2) Trong trình duyệt:  Cmd+Shift+R  (hard refresh)\n\n'
