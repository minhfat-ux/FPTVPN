#!/usr/bin/env bash
# upload-windows-release.sh — đưa bộ cài Windows lên kênh tải công khai (1 lệnh),
# rồi kiểm tra lại đúng thứ khách sẽ tải.
#
# Vì sao cần script: bộ cài phải nằm đúng thư mục web phục vụ, đúng quyền (644 + user web),
# nếu không khách nhận 403; và phải verify size + sha256 ở ĐÍCH (bài học vụ IPA 0 byte).
#
# Dùng:
#   scripts/upload-windows-release.sh <file-Setup.exe> [version]
#   scripts/upload-windows-release.sh windows/installer/out/VPNFlow-Setup-1.0.0.exe 1.0.0
#
# Sau khi xong, script in ra link tải + sha256 để dán vào trang buy / gửi khách.
set -euo pipefail

FILE="${1:?Dùng: $0 <file-Setup.exe> [version]}"
VERSION="${2:-}"
[ -f "$FILE" ] || { echo "LỖI: không thấy file $FILE" >&2; exit 2; }

NODE1="${NODE1:-root@103.173.155.50}"     # máy trung chuyển (Mac không SSH thẳng node-2 được)
NODE2="${NODE2:-165.101.114.162}"         # máy phục vụ file tải
DOCROOT_IP="${DOCROOT_IP:-/var/www/dl}"   # kênh tải theo IP (khách TQ/VN vào được dù domain bị chặn)
# Kênh /dl/* của Caddy: Caddyfile có `handle /dl/* { root * /var/www/flowvpn; file_server }`
# nên URL /dl/<file> map tới /var/www/flowvpn/dl/<file> — PHẢI có thêm "/dl".
# (Từng để thiếu "/dl" ⇒ file vào /var/www/flowvpn/<file>, Caddy trả 404 dù script báo OK.)
DOCROOT_CDN="${DOCROOT_CDN:-/var/www/flowvpn/dl}"
IP_HOST="${IP_HOST:-165.101.114.162}"
CDN_HOST="${CDN_HOST:-meetflowai.site}"   # domain chính (Caddy phục vụ /dl/*)

# Tên file công khai: giữ đúng tên nhưng luôn có 1 bản "latest" cho link cố định.
BASE="$(basename "$FILE")"
LATEST="VPNFlow-Setup-latest.exe"

LOCAL_MD5="$(md5sum "$FILE" | cut -d' ' -f1)"
LOCAL_SHA="$(sha256sum "$FILE" | cut -d' ' -f1)"
LOCAL_SIZE="$(stat -c %s "$FILE" 2>/dev/null || stat -f %z "$FILE")"
echo "== nguồn: $BASE (${LOCAL_SIZE} bytes)"
echo "   md5=$LOCAL_MD5"
echo "   sha256=$LOCAL_SHA"

echo "== 1) đẩy lên $NODE1 rồi sang $NODE2"
scp -q -o BatchMode=yes "$FILE" "$NODE1:/tmp/$BASE"
ssh -o BatchMode=yes "$NODE1" "scp -q -o BatchMode=yes /tmp/$BASE root@$NODE2:/tmp/$BASE && ssh -n -o BatchMode=yes root@$NODE2 '
  set -e
  install -m 644 -o caddy -g caddy /tmp/$BASE $DOCROOT_IP/$BASE
  install -m 644 -o caddy -g caddy /tmp/$BASE $DOCROOT_IP/$LATEST
  install -m 644 -o caddy -g caddy /tmp/$BASE $DOCROOT_CDN/$BASE
  install -m 644 -o caddy -g caddy /tmp/$BASE $DOCROOT_CDN/$LATEST
  rm -f /tmp/$BASE
'"

echo "== 2) kiểm tra tại đích (size + sha256 phải khớp nguồn, ở CẢ HAI docroot)"
for d in "$DOCROOT_IP" "$DOCROOT_CDN"; do
  REMOTE="$(ssh -o BatchMode=yes "$NODE1" "ssh -n -o BatchMode=yes root@$NODE2 'stat -c %s $d/$BASE 2>/dev/null; sha256sum $d/$BASE 2>/dev/null | cut -d\" \" -f1'")"
  R_SIZE="$(echo "$REMOTE" | sed -n 1p)"; R_SHA="$(echo "$REMOTE" | sed -n 2p)"
  [ "$R_SIZE" = "$LOCAL_SIZE" ] || { echo "LỖI: $d/$BASE size ở đích ($R_SIZE) khác nguồn ($LOCAL_SIZE) — KHÔNG phát" >&2; exit 1; }
  [ "$R_SHA" = "$LOCAL_SHA" ] || { echo "LỖI: $d/$BASE sha256 ở đích khác nguồn — KHÔNG phát" >&2; exit 1; }
  echo "   OK: $d/$BASE (size + sha256 khớp)"
done

echo "== 3) thử tải công khai như khách"
# Dùng URL THEO PHIÊN BẢN cho kênh /dl/: Cloudflare cache /dl/* tới 4 giờ, nên link "-latest"
# có thể còn phục vụ bản CŨ (hoặc 404 đã cache) tới 4h sau khi upload.
for u in "http://$IP_HOST/$BASE" "http://$IP_HOST/$LATEST" "https://$CDN_HOST/dl/$BASE"; do
  code_size="$(curl -s -o /dev/null -w '%{http_code} %{size_download}' -m 60 -r 0-1048575 "$u")"
  echo "   $u → HTTP ${code_size% *} (đã đọc ${code_size#* } bytes đầu)"
  case "${code_size% *}" in 200|206) ;; *) echo "LỖI: link chưa tải được (${code_size% *})" >&2; exit 1;; esac
done

echo "== 4) cập nhật link tải trên trang /buy (kèm ?v= để không dính cache Cloudflare 4h)"
# Vì sao có bước này: /buy và /v1/app-version lấy link từ windows_installer_url của control plane.
# Không tự cập nhật thì sau mỗi lần phát hành phải PATCH tay, và link cũ còn bị Cloudflare cache 4h.
# Thêm ?v=<sha8> ⇒ mỗi bản là một URL mới ⇒ cache không phục vụ bản cũ, khách tải đúng bản mới ngay.
if [ "${SKIP_BUY_UPDATE:-0}" = "1" ]; then
  echo "   bỏ qua (SKIP_BUY_UPDATE=1)"
else
  ssh -o BatchMode=yes "$NODE1" "ssh -n -o BatchMode=yes root@$NODE2 'test -x /usr/local/bin/flowvpn-set-windows-url'" \
    || { echo "LỖI: node-2 thiếu /usr/local/bin/flowvpn-set-windows-url (helper đặt windows_installer_url)" >&2; exit 1; }
  PUB="https://$CDN_HOST/dl/$BASE?v=${LOCAL_SHA:0:8}"
  echo "   URL mới: $PUB"
  ssh -o BatchMode=yes "$NODE1" "ssh -n -o BatchMode=yes root@$NODE2 'flowvpn-set-windows-url \"$PUB\"'"
  BUY_LINK="$(curl -s -m 30 "https://$CDN_HOST/buy" | grep -o "https://[^\"]*$BASE[^\"]*" | head -1)"
  echo "   /buy đang trỏ: ${BUY_LINK:-(không đọc được)}"
  case "$BUY_LINK" in
    *"?v=${LOCAL_SHA:0:8}"*) echo "   OK: trang buy đã trỏ đúng bản vừa phát" ;;
    *) echo "LỖI: trang buy chưa trỏ link mới — kiểm tra windows_installer_url" >&2; exit 1 ;;
  esac
  DL_SHA="$(curl -s -L -m 900 "https://$CDN_HOST/dl/$BASE?v=${LOCAL_SHA:0:8}" | sha256sum | cut -d' ' -f1)"
  [ "$DL_SHA" = "$LOCAL_SHA" ] || { echo "LỖI: bản tải qua CDN có sha256 khác nguồn — KHÔNG phát" >&2; exit 1; }
  echo "   OK: tải qua CDN khớp sha256 nguồn"
fi

echo
echo "XONG. Link gửi khách / dán vào trang buy:"
echo "   http://$IP_HOST/$LATEST          (link cố định, luôn trỏ bản mới nhất)"
echo "   http://$IP_HOST/$BASE            (link theo phiên bản)"
[ -n "$VERSION" ] && echo "   version: $VERSION"
echo "   sha256 : $LOCAL_SHA"
echo
echo "Nhắc:"
echo "  · Trang /buy + /v1/app-version đã được script trỏ sang: https://$CDN_HOST/dl/$BASE?v=${LOCAL_SHA:0:8}"
echo "    (mỗi bản một ?v= nên Cloudflare không phục vụ bản cũ; token Cloudflare hiện KHÔNG có quyền purge)."
echo "  · Bỏ qua bước đó khi cần: SKIP_BUY_UPDATE=1 $0 <file>"
echo "  · Kiểm tra lại bằng: curl -sI \"https://$CDN_HOST/dl/$BASE?v=${LOCAL_SHA:0:8}\" | head -3"
