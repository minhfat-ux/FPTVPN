#!/usr/bin/env bash
# Bước C: dựng interface wgtest tren node-2, handshake that toi node-1:443
N1=103.173.155.50
N1PUB='N0vGtqZ2SARCXkvVUU/KfAZMvfwszkvF/ROLL4DLIQ8='
TESTPUB=$(cat /tmp/wgtest.pub)
echo "test pubkey (node-2 tam): $TESTPUB"

ip link del wgtest 2>/dev/null
ip link add wgtest type wireguard
wg set wgtest private-key /tmp/wgtest.key peer "$N1PUB" endpoint "$N1:443" allowed-ips 10.77.0.254/32 persistent-keepalive 5
ip addr add 10.77.0.250/32 dev wgtest
ip link set wgtest up

echo "=== cho 10s de handshake ==="
sleep 10
echo "=== wg show wgtest ==="
wg show wgtest
echo "=== transfer ==="
wg show wgtest transfer
echo "=== ping 10.77.0.254 (dia chi phu tam tren wg0 node-1) qua tunnel ==="
ping -c 10 -W 2 -I 10.77.0.250 10.77.0.254 2>&1 | tail -5
echo "=== transfer sau ping ==="
wg show wgtest transfer
