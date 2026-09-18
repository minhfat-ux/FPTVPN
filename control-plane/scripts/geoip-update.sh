#!/usr/bin/env bash
# Cập nhật bảng GeoIP offline trên VPS (DB-IP Lite, giấy phép CC BY 4.0).
#
# Vì sao: dashboard admin cần "IP thật + vị trí" của thiết bị đang kết nối, nhưng KHÔNG được
# gửi IP khách sang API bên thứ ba. Bảng mmdb nằm tại chỗ nên tra cứu offline, không giới hạn.
#
# Cách dùng:
#   scripts/geoip-update.sh              # cập nhật bảng của tháng hiện tại
#   scripts/geoip-update.sh 2026-08      # ghim một tháng cụ thể (khi tháng này chưa phát hành)
# Cron gợi ý (mùng 3 hằng tháng, 04:30):
#   30 4 3 * * /root/flowvpn-cp/scripts/geoip-update.sh >> /var/log/geoip-update.log 2>&1
set -euo pipefail

DEST_DIR="${GEOIP_DIR:-/usr/share/GeoIP}"
SRC="https://download.db-ip.com/free"
CHECKER="${GEOIP_CHECKER:-/root/flowvpn-cp/src/mmdb.js}"
MONTHS="${1:-}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

log() { printf '[%s] %s\n' "$(date '+%F %T')" "$*"; }

# Thử tháng chỉ định, rồi lùi dần về các tháng trước (DB-IP phát hành đầu mỗi tháng).
if [ -z "$MONTHS" ]; then
  for back in 0 1 2; do
    candidate="$(date -d "-${back} month" '+%Y-%m')"
    if curl -sfI --max-time 20 "${SRC}/dbip-city-lite-${candidate}.mmdb.gz" >/dev/null; then
      MONTHS="$candidate"; break
    fi
  done
fi
[ -n "$MONTHS" ] || { log "LỖI: không tìm được bản phát hành nào của DB-IP"; exit 1; }
log "bản phát hành: ${MONTHS}"

mkdir -p "$DEST_DIR"
updated=0
for db in city asn; do
  file="dbip-${db}-lite.mmdb"
  url="${SRC}/dbip-${db}-lite-${MONTHS}.mmdb.gz"
  log "tải ${url}"
  if ! curl -sf --max-time 900 -o "${WORK}/${file}.gz" "$url"; then
    log "BỎ QUA ${db}: không tải được (giữ bảng cũ)"
    continue
  fi
  gunzip -c "${WORK}/${file}.gz" > "${WORK}/${file}"

  # Kiểm tra bảng mới ĐỌC ĐƯỢC trước khi thay bảng đang chạy — bảng hỏng làm dashboard trắng.
  if [ -f "$CHECKER" ]; then
    if ! node --input-type=module -e "
      const { MmdbReader } = await import('${CHECKER}');
      const r = MmdbReader.open('${WORK}/${file}');
      const meta = r.meta();
      if (!meta.node_count || !meta.record_size) throw new Error('metadata thiếu');
      const probe = r.lookup('8.8.8.8');
      if (!probe) throw new Error('không tra được IP thử nghiệm');
      console.log('OK', meta.database_type, meta.node_count, JSON.stringify(probe.country?.iso_code));
      r.close();
    " ; then
      log "LỖI ${db}: bảng mới không đọc được — giữ nguyên bảng cũ"
      continue
    fi
  fi

  [ -f "${DEST_DIR}/${file}" ] && cp -f "${DEST_DIR}/${file}" "${DEST_DIR}/${file}.prev"
  mv -f "${WORK}/${file}" "${DEST_DIR}/${file}"   # mv cùng ổ đĩa = thay thế nguyên tử
  log "đã cập nhật ${DEST_DIR}/${file} ($(du -h "${DEST_DIR}/${file}" | cut -f1))"
  updated=$((updated + 1))
done

[ "$updated" -gt 0 ] || { log "LỖI: không cập nhật được bảng nào"; exit 1; }

# Bảng đã thay trên đĩa nhưng tiến trình control-plane giữ file descriptor cũ ⇒ cần restart
# để lần mở kế tiếp đọc bảng mới (dashboard vẫn chạy bình thường trong lúc đó).
if systemctl is-active --quiet flowvpn-cp; then
  log "restart flowvpn-cp để nạp bảng mới"
  systemctl restart flowvpn-cp
fi
log "xong"
