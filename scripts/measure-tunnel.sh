#!/usr/bin/env bash
# measure-tunnel.sh — đo tốc độ/độ ổn định của đường VPN theo ĐÚNG cách nghiệm thu ở
# `docs/YEU_CAU_TOC_DO_ON_DINH.md` §5, để so được giữa các nền tảng (iOS · macOS · Android · Windows).
#
# Vì sao có script này: §5 chốt "dùng CHUNG một cách đo". Đo bằng speedtest web cho số rất khác nhau
# (đã sai một lần: speed.cloudflare.com trả 493 kbps trong khi đường thật > 8 Mbps) nên cách đo là
# **tải liên tục 1 luồng, file lớn, ghi tốc độ từng lượt** — script làm đúng như vậy.
#
# Dùng:
#   bash scripts/measure-tunnel.sh --label baseline          # VPN TẮT (đo trần nhà mạng)
#   bash scripts/measure-tunnel.sh --label tunnel            # VPN BẬT (đo qua tunnel)
#   bash scripts/measure-tunnel.sh --minutes 3               # chạy ngắn để thử script
#   bash scripts/measure-tunnel.sh --label tunnel --file https://.../10Mb.dat
#
# Kết quả: in bảng từng lượt + tổng kết, đồng thời ghi ra `--out` (mặc định /tmp/measure-<label>-<giờ>.log)
# để dán vào báo cáo. Mã thoát: 0 = ĐẠT (≥8 Mbps duy trì), 1 = KHÔNG ĐẠT, 2 = lỗi tham số/mạng.
#
# LƯU Ý QUAN TRỌNG
#   · Chạy CẢ HAI lần (baseline rồi tunnel) trong cùng buổi, cùng mạng — không có số gốc thì không
#     kết luận được "VPN làm chậm hay nhà mạng vốn đã chậm".
#   · Trên iPhone KHÔNG chạy được script này: lấy số ở thẻ **Diagnostics** của app (A10) và chụp ảnh.
#   · Ngưỡng §5: ≥ 8 Mbps duy trì ≥ 10 phút · 0 lần rời trạng thái Connected · ≤ 1 lần dựng lại
#     transport mỗi 30 phút (2 mục sau đọc từ log chẩn đoán của app, script không thấy được).

set -uo pipefail

MINUTES=10
LABEL="tunnel"
FILE="https://proof.ovh.net/files/10Mb.dat"
OUT=""
TARGET_MBPS=8
ROUND_TIMEOUT=60
BASELINE=""

while [ $# -gt 0 ]; do
  case "$1" in
    --minutes) MINUTES="${2:?}"; shift 2 ;;
    --label)   LABEL="${2:?}"; shift 2 ;;
    --file)    FILE="${2:?}"; shift 2 ;;
    --out)     OUT="${2:?}"; shift 2 ;;
    --target)  TARGET_MBPS="${2:?}"; shift 2 ;;
    --baseline) BASELINE="${2:?}"; shift 2 ;;
    -h|--help) sed -n '2,30p' "$0"; exit 0 ;;
    *) echo "tham so la khong hop le: $1" >&2; exit 2 ;;
  esac
done

case "$LABEL" in
  baseline|tunnel) ;;
  *) echo "LỖI: --label phải là 'baseline' (VPN tắt) hoặc 'tunnel' (VPN bật)" >&2; exit 2 ;;
esac

command -v curl >/dev/null 2>&1 || { echo "LỖI: thiếu curl" >&2; exit 2; }
if [ -z "$OUT" ]; then
  OUT="/tmp/measure-${LABEL}-$(date +%Y%m%d-%H%M%S).log"
fi

# Mỗi lượt tải trọn 1 file; in: mã HTTP · byte · tốc độ (B/s) · thời gian (s)
fetch_once() {
  curl -s -o /dev/null -m "$ROUND_TIMEOUT" \
    -w '%{http_code} %{size_download} %{speed_download} %{time_total}\n' "$FILE" 2>/dev/null
}

# Lấy RTT trung bình tới host của file (để biết đường có RTT cao bất thường không).
host_of() { printf '%s' "$1" | sed -E 's#^https?://##; s#/.*$##; s#:.*$##'; }
HOST="$(host_of "$FILE")"
ping_avg() {
  command -v ping >/dev/null 2>&1 || return 0
  local out avg
  out="$(ping -c 5 -W 2 "$HOST" 2>/dev/null)"
  # macOS/Linux: "round-trip min/avg/max/stddev = 1.2/3.4/5.6/0.7 ms"
  avg="$(printf '%s' "$out" | sed -nE 's#.*= [0-9.]+/([0-9.]+)/.*#\1#p' | head -1)"
  # Git Bash trên Windows (ping.exe): "Minimum = 1ms, Maximum = 2ms, Average = 1ms"
  if [ -z "$avg" ]; then
    avg="$(printf '%s' "$out" | sed -nE 's#.*Average = ([0-9]+)ms.*#\1#p' | head -1)"
  fi
  printf '%s' "$avg"
}

{
  echo "=== ĐO ĐƯỜNG VPN — theo docs/YEU_CAU_TOC_DO_ON_DINH.md §5 ==="
  echo "nhãn      : $LABEL  ($([ "$LABEL" = baseline ] && echo 'VPN TẮT — trần nhà mạng' || echo 'VPN BẬT — qua tunnel'))"
  echo "nguồn     : $FILE"
  echo "thời lượng: ${MINUTES} phút · mốc đạt: ≥ ${TARGET_MBPS} Mbps"
  echo "bắt đầu   : $(date '+%Y-%m-%d %H:%M:%S')"
  echo "máy       : $(uname -srm)"
  RTT="$(ping_avg)"
  [ -n "$RTT" ] && echo "RTT tới $HOST: ${RTT} ms" || echo "RTT tới $HOST: (không đo được)"
  echo
  printf '%-6s %-5s %-11s %-11s %-8s\n' "lượt" "HTTP" "byte" "Mbps" "giây"
  printf '%-6s %-5s %-11s %-11s %-8s\n' "-----" "----" "----------" "----------" "--------"
} | tee "$OUT"

# Vòng đo: chạy tới khi hết thời gian (mỗi lượt tải 1 file). Mỗi lượt ghi 1 dòng.
DEADLINE=$(( $(date +%s) + MINUTES * 60 ))
ROUND=0
SUM_MBPS=0
MIN_ROUND=""
GOOD_ROUNDS=0
FAILED_ROUNDS=0

while [ "$(date +%s)" -lt "$DEADLINE" ]; do
  ROUND=$((ROUND + 1))
  read -r CODE SIZE SPEED TOTAL < <(fetch_once)
  if [ -z "${CODE:-}" ]; then
    CODE="000"; SIZE=0; SPEED=0; TOTAL=0
  fi
  MBPS=$(awk -v s="$SPEED" 'BEGIN { printf "%.2f", s * 8 / 1000000 }')
  if [ "$CODE" != "200" ] || [ "${SIZE:-0}" -eq 0 ]; then
    FAILED_ROUNDS=$((FAILED_ROUNDS + 1))
    printf '%-6s %-5s %-11s %-11s %-8s  <-- LỖI\n' "$ROUND" "$CODE" "$SIZE" "$MBPS" "$TOTAL" | tee -a "$OUT"
    sleep 1
    continue
  fi
  printf '%-6s %-5s %-11s %-11s %-8s\n' "$ROUND" "$CODE" "$SIZE" "$MBPS" "$TOTAL" | tee -a "$OUT"
  SUM_MBPS=$(awk -v a="$SUM_MBPS" -v b="$MBPS" 'BEGIN { printf "%.4f", a + b }')
  [ -z "$MIN_ROUND" ] && MIN_ROUND="$MBPS"
  MIN_ROUND=$(awk -v a="$MIN_ROUND" -v b="$MBPS" 'BEGIN { print (b < a) ? b : a }')
  awk -v m="$MBPS" -v t="$TARGET_MBPS" 'BEGIN { exit (m + 0 >= t + 0) ? 0 : 1 }' && GOOD_ROUNDS=$((GOOD_ROUNDS + 1))
done

OK_ROUNDS=$((ROUND - FAILED_ROUNDS))
AVG=$(awk -v s="$SUM_MBPS" -v n="$OK_ROUNDS" 'BEGIN { printf (n > 0) ? "%.2f" : "0.00", (n > 0) ? s / n : 0 }')
PASS_RATE=$(awk -v g="$GOOD_ROUNDS" -v n="$OK_ROUNDS" 'BEGIN { printf (n > 0) ? "%.0f" : "0", (n > 0) ? g * 100 / n : 0 }')

{
  echo
  echo "--- TỔNG KẾT ($LABEL) ---"
  echo "số lượt            : $ROUND (lỗi: $FAILED_ROUNDS)"
  echo "tốc độ trung bình  : ${AVG} Mbps"
  echo "lượt thấp nhất     : ${MIN_ROUND:-n/a} Mbps"
  echo "đạt ≥ ${TARGET_MBPS} Mbps : $GOOD_ROUNDS/$OK_ROUNDS lượt (${PASS_RATE}%)"
  if [ -n "$BASELINE" ]; then
    RATIO=$(awk -v a="$AVG" -v b="$BASELINE" 'BEGIN { printf (b + 0 > 0) ? "%.0f" : "n/a", (b + 0 > 0) ? a * 100 / b : 0 }')
    echo "so với mạng gốc    : ${RATIO}% (gốc ${BASELINE} Mbps)"
    awk -v r="$RATIO" 'BEGIN { exit (r + 0 >= 80) ? 0 : 1 }' \
      && echo "  => tunnel giữ được ≥80% trần nhà mạng (đạt)" \
      || echo "  => tunnel CHỈ còn ${RATIO}% trần nhà mạng — VPN đang bóp tốc độ (KHÔNG đạt)"
  else
    echo "so với mạng gốc    : (chưa truyền --baseline <Mbps>; nên đo gốc trước, xem §5)"
  fi
  echo "kết thúc           : $(date '+%Y-%m-%d %H:%M:%S')"
  echo "log                : $OUT"
  echo
  echo "Dòng để dán vào báo cáo/log:"
  echo "bw: DO ${LABEL} net=${HOST} = ${AVG} Mbps (min ${MIN_ROUND:-n/a}, dat ${PASS_RATE}%, ${OK_ROUNDS} luot)"
  echo
  echo "NHẮC: §5 còn 2 điều kiện script KHÔNG thấy được — phải đọc log chẩn đoán của app:"
  echo "  · 0 lần rời trạng thái Connected trong suốt phiên"
  echo "  · ≤ 1 lần dựng lại transport mỗi 30 phút"
} | tee -a "$OUT"

if [ "$OK_ROUNDS" -eq 0 ]; then
  echo "KẾT QUẢ: KHÔNG ĐẠT — không có lượt nào tải được." | tee -a "$OUT"
  exit 1
fi
if awk -v r="$PASS_RATE" -v n="$OK_ROUNDS" 'BEGIN { exit !(r + 0 >= 95 && n + 0 >= 2) }'; then
  echo "KẾT QUẢ: ĐẠT (≥95% lượt đạt mốc ${TARGET_MBPS} Mbps)" | tee -a "$OUT"
  exit 0
fi
echo "KẾT QUẢ: KHÔNG ĐẠT — chỉ ${PASS_RATE}% lượt đạt ${TARGET_MBPS} Mbps (cần ≥95%)." | tee -a "$OUT"
exit 1
