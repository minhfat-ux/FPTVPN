# Gateway OpenWrt tren Xiaomi AX3000T RD03v2

Bo file cho router da flash OpenWrt (ADCDS `openwrt-xiaomi-ax3000t-rd03v2` v2.0.2).

## Vai tro
- `sing-box-selective.json`: TPROXY (7893) + HTTP/SOCKS (18081). Chi cac domain
  bi chan (FPT Play, TV360, YouTube/Google, Facebook/Instagram, TikTok, X,
  Telegram, WhatsApp, Signal) di qua node-1/node-2; **con lai di thang WAN**
  => tunnel chet khong lam mat internet ca nha.
- `health.sh`: moi 30 s do do tre 2 relay qua socks; chi doi node khi node hien
  tai chet hoac node kia nhanh hon >=25%; ca 2 fail 3 lan -> restart relay.

## Cai tren router
```
mkdir -p /etc/flowvpn
cp node1.json node2.json /etc/flowvpn/     # file credential, KHONG commit
cp health.sh /etc/flowvpn/health.sh
cp sing-box-selective.json /etc/sing-box/config.json
# init.d: flowvpnrelay1 (node-1, socks 1085), flowvpnrelay2 (node-2, socks 1081),
#          flowvpnhealth, tproxynft (nft tproxy, loai tru DHCP 67/68 va broadcast)
```

## Luu y da gap
1. **nft TPROXY phai loai tru DHCP** (`udp dport 67/68`, `255.255.255.255`) va
   dai private, neu khong client moi (TV) khong nhan duoc IP.
2. Toan bo traffic qua tunnel la thiet ke sai: tunnel chet => mat internet ca
   nha. Dung dinh tuyen chon loc nhu `sing-box-selective.json`.
3. TV co the bi Guard/Launcher tro proxy vao gateway da chet (vd Windows
   `192.168.1.106:18081`) => app timeout 15 s. Kiem tra:
   `adb shell settings get global http_proxy`; sua:
   `adb shell settings put global http_proxy 192.168.1.1:18081`.
