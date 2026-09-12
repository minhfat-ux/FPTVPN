#!/bin/bash
# Xcode Cloud — chạy sau khi clone, TRƯỚC khi resolve package & build.
#
# Vì sao cần file này:
#   1) Repo KHÔNG commit `PrivateVPN.xcodeproj` (xem .gitignore: `*.xcodeproj/`). Nguồn
#      sự thật là `project.yml` (xcodegen) ⇒ máy CI sạch phải tự sinh project + scheme,
#      nếu không Xcode Cloud báo "Build failed" ngay vì không có project/scheme.
#   2) PreBuild phase "Build wireguard-go" chạy `make` và cần toolchain **Go**
#      (`go env GOROOT`), cộng thêm `patch`/`rsync` để vá goruntime — Go không có sẵn
#      trên ảnh Xcode Cloud.
#
# Ghi chú: Xcode Cloud chạy script này với `CI_PRIMARY_REPOSITORY_PATH` là gốc repo.
set -euo pipefail

REPO="${CI_PRIMARY_REPOSITORY_PATH:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "$REPO"
echo "[ci_post_clone] repo=$REPO"
echo "[ci_post_clone] xcode: $(xcodebuild -version | tr '\n' ' ')"
echo "[ci_post_clone] python: $(python3 --version 2>&1 || echo none)"

# Homebrew nằm ở /opt/homebrew (Apple Silicon) hoặc /usr/local (Intel).
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

have() { command -v "$1" >/dev/null 2>&1; }
try_brew() {
  if have brew; then
    brew install "$1" >/dev/null 2>&1 || brew upgrade "$1" >/dev/null 2>&1 || true
  fi
}

# --- 1) Go toolchain (bắt buộc cho wireguard-go) ---
if ! have go; then
  echo "[ci_post_clone] installing go"
  try_brew go
fi
if ! have go; then
  echo "!! FATAL: Go toolchain không có — preBuild 'Build wireguard-go' sẽ fail." >&2
  exit 1
fi
echo "[ci_post_clone] go: $(go version)"

# --- 2) patch/rsync (Makefile của wireguard-go dùng để vá goruntime) ---
for t in patch rsync make clang; do
  have "$t" || echo "[ci_post_clone] WARNING: thiếu $t"
done

# --- 3) xcodegen: sinh project + scheme (shared) từ project.yml ---
if ! have xcodegen; then
  echo "[ci_post_clone] installing xcodegen"
  try_brew xcodegen
fi
if ! have xcodegen; then
  echo "!! FATAL: xcodegen không có — không sinh được PrivateVPN.xcodeproj." >&2
  exit 1
fi
echo "[ci_post_clone] xcodegen: $(xcodegen --version)"

if [ ! -f project.yml ]; then
  echo "!! FATAL: không tìm thấy project.yml ở gốc repo." >&2
  exit 1
fi

rm -rf PrivateVPN.xcodeproj
xcodegen generate --spec project.yml
echo "[ci_post_clone] project generated"

# --- 4) Kiểm tra scheme đã ở dạng SHARED (Xcode Cloud cần) ---
SCHEMES_DIR="PrivateVPN.xcodeproj/xcshareddata/xcschemes"
if [ -d "$SCHEMES_DIR" ] && ls "$SCHEMES_DIR"/*.xcscheme >/dev/null 2>&1; then
  echo "[ci_post_clone] shared schemes:"
  ls "$SCHEMES_DIR" | sed 's/^/  - /'
else
  echo "!! FATAL: không có shared scheme — Xcode Cloud sẽ không chọn được scheme." >&2
  exit 1
fi

echo "[ci_post_clone] OK — sẵn sàng build."
