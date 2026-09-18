#!/usr/bin/env bash
# deploy-landing-page.sh — deploy trang chủ FlowTech (control-plane/src/home-page.js) lên production.
#
# Vì sao có script: file trên server đã được KHOÁ IMMUTABLE (chattr +i) để máy khác không ghi đè
# mất bản mới nhất (sự cố 18/09/2026). Muốn deploy phải: mở khoá -> backup bản đang chạy ->
# ghi file mới -> khoá lại -> restart CP -> verify.
#
# Dùng:
#   bash scripts/deploy-landing-page.sh [file-home-page.js]
# Mặc định lấy control-plane/src/home-page.js trong repo (phải commit trước khi deploy).
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

SRC="${1:-control-plane/src/home-page.js}"
JUMP="${JUMP:-root@103.173.155.50}"
NODE2="${NODE2:-root@165.101.114.162}"
REMOTE="/root/flowvpn-cp/src/home-page.js"
TS="$(date +%Y%m%d-%H%M%S)"

[ -f "$SRC" ] || { echo "LỖI: không thấy $SRC" >&2; exit 2; }
LOCAL_SHA="$(sha256sum "$SRC" | cut -d' ' -f1)"
echo "== nguồn: $SRC  $(stat -c %s "$SRC") byte"
echo "   sha256: $LOCAL_SHA"

# 0) Cảnh báo nếu file nguồn khác bản đang commit (deploy bản chưa commit là bản dễ mất nhất)
if git rev-parse --git-dir >/dev/null 2>&1; then
  if ! git diff --quiet -- "$SRC" 2>/dev/null; then
    echo "   !! $SRC đang có thay đổi CHƯA COMMIT — nên commit trước (rule §8)."
  fi
  HEAD_SHA="$(git cat-file blob "HEAD:$SRC" 2>/dev/null | sha256sum | cut -d' ' -f1 || true)"
  if [ -n "$HEAD_SHA" ] && [ "$HEAD_SHA" != "$LOCAL_SHA" ]; then
    echo "   !! bản trong HEAD khác bản đang deploy (HEAD ${HEAD_SHA:0:12} / nguồn ${LOCAL_SHA:0:12})."
  fi
fi

echo "== 1) mở khoá + backup bản đang chạy"
ssh -o BatchMode=yes -J "$JUMP" "$NODE2" "chattr -i $REMOTE 2>/dev/null || true; cp -a $REMOTE $REMOTE.bak-$TS; echo '   backup:' $REMOTE.bak-$TS"

echo "== 2) ghi bản mới + khoá lại + restart"
scp -q -o BatchMode=yes -J "$JUMP" "$SRC" "$NODE2:/tmp/home-page.deploy.js"
ssh -o BatchMode=yes -J "$JUMP" "$NODE2" "install -m 600 -o root -g root /tmp/home-page.deploy.js $REMOTE && rm -f /tmp/home-page.deploy.js && chattr +i $REMOTE && systemctl restart flowvpn-cp && sleep 4 && echo -n '   service: ' && systemctl is-active flowvpn-cp && lsattr $REMOTE"

echo "== 3) verify"
ssh -o BatchMode=yes -J "$JUMP" "$NODE2" bash -s <<'EOF'
F=/root/flowvpn-cp/src/home-page.js
sha256sum "$F" | cut -c1-32
curl -4 -s -o /dev/null -w '   https://meetflowai.site/ -> HTTP %{http_code}\n' -m 30 https://meetflowai.site/
for u in "https://meetflowai.site/?lang=en" "https://meetflowai.site/?lang=zh" "https://meetflowai.site/buy"; do
  printf '   %-42s HTTP %s\n' "$u" "$(curl -4 -s -o /dev/null -w '%{http_code}' -m 30 "$u")"
done
EOF

echo
echo "XONG. Nếu sha256 ở trên khác $LOCAL_SHA thì deploy sai — kiểm tra lại."
