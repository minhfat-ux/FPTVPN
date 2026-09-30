#!/usr/bin/env bash
# Chẩn đoán wg0 của một node (chạy qua ssh, không phụ thuộc quoting của PowerShell).
echo "=== HOST ==="
hostname; uptime
echo "=== WG INTERFACE ==="
wg show wg0 | head -8
echo "=== SO PEER (dump) ==="
wg show wg0 dump | tail -n +2 | wc -l
echo "=== SO PEER CO allowed-ips THAT (khac '(none)') ==="
wg show wg0 dump | tail -n +2 | awk '$4 != "(none)" && $4 != ""' | wc -l
echo "=== PEER CO allowed-ips THAT ==="
wg show wg0 dump | tail -n +2 | awk '$4 != "(none)" && $4 != "" { printf "%s allowed=%s last_hs=%s endpoint=%s\n", substr($1,1,12), $4, $5, $3 }'
echo "=== PEER KHONG co allowed-ips (dem) ==="
wg show wg0 dump | tail -n +2 | awk '$4 == "(none)" || $4 == ""' | wc -l
echo "=== THIET BI WINDOWS (pubkey 57M1tFEi...) ==="
wg show wg0 dump | grep -F '57M1tFEiOuTI' || echo 'KHONG CO trong wg0'
echo "=== HANDSHAKE TRONG 10 PHUT GAN NHAT ==="
wg show wg0 latest-handshakes | awk -v now="$(date +%s)" '$2 > 0 && now - $2 < 600 { printf "%s  %ss ago\n", substr($1,1,12), now - $2 }' | sort -k2 -n | tail -20
echo "=== SO PEER CO HANDSHAKE TRONG 10 PHUT ==="
wg show wg0 latest-handshakes | awk -v now="$(date +%s)" '$2 > 0 && now - $2 < 600' | wc -l
echo "=== CONFIG NGUON ==="
ls -la /etc/wireguard/ 2>/dev/null
echo "=== SYNC PEERS / CRON ==="
crontab -l 2>/dev/null
ls -la /opt 2>/dev/null | head -40
echo "=== SERVICE LIEN QUAN ==="
systemctl list-units --type=service --state=running 2>/dev/null | grep -Ei 'wg|wireguard|sync|peer|relay|control|fbuddy|meetflow|hysteria|sing'
echo "=== JOURNAL wg 30 dong cuoi ==="
journalctl -u wg-quick@wg0 -n 15 --no-pager 2>/dev/null || journalctl -u wgrelay -n 15 --no-pager 2>/dev/null
echo "=== DONE ==="
