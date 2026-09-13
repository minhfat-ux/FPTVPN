#!/usr/bin/env bash
# So md5 + dung lượng của các APK giữa hai node (node-1 và node-2).
#
# VÌ SAO: 13/09/2026 lúc chuyển máy chính sang node-2, file APK bị copy qua máy trạm đứt giữa
# đường ⇒ node-2 có `VPNFlow-android7.apk` **cụt 27MB/96MB** mà endpoint vẫn phát cho khách
# (khách tải về sẽ báo "There was a problem parsing the package"). Chỉ phát hiện được nhờ so md5.
#
#   scripts/compare-nodes-apk.sh                     # node-1 vs node-2 (mặc định)
#   NODE1=root@a KEY1=~/.ssh/k1 NODE2=root@b KEY2=~/.ssh/k2 scripts/compare-nodes-apk.sh
#
# Trả mã 1 nếu có file ĐANG PHỤC VỤ khác nhau (hoặc thiếu ở một bên).
set -euo pipefail

NODE1="${NODE1:-root@103.173.155.50}"
NODE2="${NODE2:-root@103.6.234.233}"
KEY1="${KEY1:-$HOME/.ssh/fpt_tunnel}"
KEY2="${KEY2:-$HOME/.ssh/fpt_vpn_node}"
APK_DIR="${APK_DIR:-/root/flowvpn-apk}"
APK_DIR1="${APK_DIR1:-$APK_DIR}"   # cho phép so hai thư mục khác nhau (khi thử)
APK_DIR2="${APK_DIR2:-$APK_DIR}"

# Các file thật sự được endpoint phát (thiếu/lệch = khách bị ảnh hưởng ngay).
SERVED=(VPNFlow-latest.apk VPNFlow-android7.apk MeetFlowAI-latest.apk)

SSH_OPTS=(-o StrictHostKeyChecking=no -o BatchMode=yes -o ConnectTimeout=15)

list_side() {  # $1=key  $2=host  $3=dir  -> "md5 size name"
  ssh "${SSH_OPTS[@]}" -i "$1" "$2" \
    "cd $3 2>/dev/null || exit 3; md5sum *.apk 2>/dev/null | while read -r h f; do printf '%s %s %s\n' \"\$h\" \"\$(stat -c%s \"\$f\")\" \"\$f\"; done" \
    | sort -k3
}

if ! n1=$(list_side "$KEY1" "$NODE1" "$APK_DIR1"); then
  echo "Không đọc được $APK_DIR1 trên $NODE1"; exit 2
fi
if ! n2=$(list_side "$KEY2" "$NODE2" "$APK_DIR2"); then
  echo "Không đọc được $APK_DIR2 trên $NODE2"; exit 2
fi

echo "So APK giữa $NODE1:$APK_DIR1 và $NODE2:$APK_DIR2:"
printf '  %-34s %-12s %-12s %s\n' "file" "node-1" "node-2" "kết quả"
bad=0
for name in $( { echo "$n1"; echo "$n2"; } | awk '{print $3}' | sort -u ); do
  m1=$(echo "$n1" | awk -v n="$name" '$3==n {print substr($1,1,10)}')
  s1=$(echo "$n1" | awk -v n="$name" '$3==n {print $2}')
  m2=$(echo "$n2" | awk -v n="$name" '$3==n {print substr($1,1,10)}')
  s2=$(echo "$n2" | awk -v n="$name" '$3==n {print $2}')
  served=0
  for f in "${SERVED[@]}"; do [ "$f" = "$name" ] && served=1; done
  if [ -n "$m1" ] && [ -n "$m2" ] && [ "$m1" = "$m2" ]; then
    verdict="khớp"
  elif [ -z "$m1" ] || [ -z "$m2" ]; then
    verdict="THIẾU ở $( [ -z "$m1" ] && echo node-1 || echo node-2 )"
    [ "$served" = "1" ] && bad=1
  else
    verdict="KHÁC NHAU"
    [ "$served" = "1" ] && bad=1
  fi
  [ "$served" = "1" ] && verdict="$verdict (đang phục vụ)" || verdict="$verdict (lưu trữ)"
  printf '  %-34s %-12s %-12s %s\n' "$name" "${m1:-—}/${s1:-—}" "${m2:-—}/${s2:-—}" "$verdict"
done

echo
if [ "$bad" = "1" ]; then
  echo "KẾT LUẬN: có file ĐANG PHỤC VỤ khác nhau/thiếu ⇒ khách có thể tải nhầm bản hoặc file cụt."
  echo "Cách sửa (chạy TRONG node-1, đừng pipe qua máy trạm):"
  echo "  ssh $NODE1 'tar -C /root -cf - flowvpn-apk/<file> | ssh $NODE2 \"tar -C /root -xf - && chmod 644 /root/flowvpn-apk/*.apk\"'"
  exit 1
fi
echo "KẾT LUẬN: mọi APK đang phục vụ khớp nhau giữa hai node."
