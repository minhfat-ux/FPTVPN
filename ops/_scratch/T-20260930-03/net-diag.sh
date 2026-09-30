#!/usr/bin/env bash
echo "=== FIREWALL (node: $(hostname)) ==="
command -v ufw >/dev/null && ufw status verbose 2>/dev/null || echo "khong co ufw"
echo "--- iptables filter ---"
iptables -S 2>/dev/null | head -60
echo "--- iptables nat ---"
iptables -t nat -S 2>/dev/null | head -30
echo "--- nft ---"
nft list ruleset 2>/dev/null | head -40 || echo "khong co nft"
echo "=== wg0 counters ==="
cat /sys/class/net/wg0/statistics/rx_packets /sys/class/net/wg0/statistics/tx_packets /sys/class/net/wg0/statistics/rx_bytes /sys/class/net/wg0/statistics/tx_bytes 2>/dev/null
echo "=== ip -s link wg0 ==="
ip -s link show wg0
echo "=== socket :443 ==="
ss -lunp | grep -E ':443\b' || echo "khong thay UDP 443"
echo "=== nstat UDP ==="
nstat -az 2>/dev/null | grep -Ei 'UdpInDatagrams|UdpNoPorts|UdpInErrors|UdpRcvbufErrors' || echo "khong co nstat"
echo "=== tcpdump co san? ==="
command -v tcpdump || echo "khong co tcpdump"
echo "=== journal wg-quick@wg0 tu luc boot ==="
journalctl -u wg-quick@wg0 -b --no-pager 2>/dev/null | tail -25
echo "=== DONE ==="
