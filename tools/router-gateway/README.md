# Router → gateway VPN (sing-box + TUN/TPROXY) — Xiaomi AX3000T **RD03v2**

> Trạng thái 24/10/2026: **chưa flash**. Máy đang chạy firmware Xiaomi `2.0.28`, cấu hình
> LAN `192.168.50.1` + WAN DHCP (`192.168.100.x` từ SK-D749). Flash cần **UART** (xem §2).
> Bộ cài dưới đây để sau khi có OpenWrt thì chạy một lần là xong.

## 1. Vì sao phải OpenWrt

- Máy là **RD03v2 (Qualcomm IPQ5018)**, không phải RD03/MT7981. OpenWrt **chính thức không hỗ trợ**.
- Firmware gốc **không có** root/TUN/package ⇒ không chạy được sing-box.
- Port cộng đồng dùng được: `ADCDS/openwrt-xiaomi-ax3000t-rd03v2` (release **v2.0.2**), RAM sau khi
  2 radio lên chỉ còn **~30 MB** khả dụng ⇒ phải chọn bản **gọn** hoặc chấp nhận rủi ro OOM.
- Đường cài **không dây** (xmir-patcher) **đã chết trên máy này**: `cap_init` báo `DISARMED`
  (`NETMODE=whc_cap`, one-shot đã bị đốt), các exploit khác bị `hackCheck v3` chặn.
  Tài liệu port cũng ghi rõ: **UART + TFTP là đường duy nhất cho lần cài đầu.**

## 2. Flash lần đầu (UART) — cần đồ

| Vật tư | Ghi chú |
|---|---|
| USB-TTL **3.3 V** (CP2102/CH340) | nối TX↔RX, RX↔TX, GND↔GND, **không** nối VCC |
| Tua vít + mở vỏ | 4 vít đáy + khe cạy; pad UART ở mặt trên board |
| Laptop **có cổng LAN** (hoặc adapter USB–LAN) | để chạy TFTP; Wi-Fi không dùng được cho U-Boot |
| TFTP server (`tftpd64`/`dnsmasq`) + ảnh | `initramfs-factory-wifi.ubi`, `squashfs-sysupgrade.bin` (sha256 trong `sha256sums.txt`) |
| Ảnh cứu hộ | `miwifi_rd03v2_*_2.0.28.bin` (stock) — **giữ trước khi flash** |

Trình tự (theo `RD03v2-INSTALL.md` của patcher fork):

```text
1) UART console 115200 8N1, giữ phím khi boot để vào U-Boot
2) setenv boot_wait on ; setenv uart_en 1 ; saveenv
3) TFTP: tftpboot <initramfs-factory-wifi.ubi> ; bootm        # chạy RAM, phát SSID OpenWrt-RD03v2-Installer (rd03v2install)
4) ssh root@192.168.1.1  →  . /lib/upgrade/common.sh; rootfs_type   # PHẢI là tmpfs
5) cat sysupgrade-fptminh.bin | ssh root@192.168.1.1 'cat > /tmp/fw.bin'
   ssh root@192.168.1.1 'sha256sum /tmp/fw.bin'      # đối chiếu
   ssh root@192.168.1.1 'sysupgrade -n /tmp/fw.bin'
```

Ảnh `sysupgrade-fptminh.bin` (đã dựng ở `node-2:/root/rd03v2/`) có sẵn `/etc/uci-defaults/99-fptminh`
⇒ sau khi cài tự bật Wi-Fi `FPT_Minh` + LAN `192.168.50.1` (mặc định OpenWrt bật lên với Wi-Fi TẮT).

Cứu brick: TFTP recovery của bootloader (giữ Reset khi cắm điện, router xin file tên theo IP được cấp,
vd `C0A81F02.img`) chỉ nhận **firmware Xiaomi chính hãng có chữ ký**.

## 3. Cài gateway sau khi có OpenWrt

```sh
# trên máy build (Windows/macOS/Linux có Go 1.25+)
bash tools/router-gateway/build-arm64.sh          # tạo dist/: flowvpnrelay arm64 + sing-box apk

# copy dist/ + 2 file config relay sang router rồi:
scp -r dist/* root@192.168.50.1:/tmp/gw/
ssh root@192.168.50.1 'cd /tmp/gw && sh setup.sh full'   # 'full' = 2 relay (node2+node3)
                                                          # 'slim' = 1 relay (node-2) cho RAM yếu
```

`setup.sh` làm: cài binary + config (quyền 600), tạo procd init cho 1–2 relay, bật sing-box TPROXY
(`7893`) + mixed (`7890`), nạp nft `tproxy` cho traffic LAN, thêm `ip rule/route` cho mark `0x1`,
bật DNS trong sing-box (UDP 53 vào tproxy), rồi in checklist nghiệm thu.

## 4. Định tuyến theo tên miền (giống gateway laptop)

`sing-box-router.json`:

| Đích | Ra bằng | Vì sao |
|---|---|---|
| `*.tv360.vn` | **node-3** (`socks5://127.0.0.1:1083`) | TV360 cần đường node-3 (như gateway Mac `.6`) |
| `fptplay.net/.vn`, `fpt.vn` | **node-2** (`1081`) | FPT Play chặn node-3 |
| `youtube.com`, `googlevideo.com`, `ytimg.com`, `ggpht.com`, `googleapis.com` | node-2 | |
| `ip_is_private` | `direct` | không đẩy LAN vào tunnel |
| còn lại | node-2 | |

Bản `slim` (RAM yếu): bỏ outbound `node3` và rule `tv360` ⇒ TV360 đi node-2 (chậm hơn, vẫn xem được).

## 5. Nghiệm thu

```sh
free -m | awk 'NR<3'                                # MemAvailable phải > 10 MB
logread -e flowvpnrelay | tail -5                   # phải có "READY"
curl -s -o /dev/null -w '%{http_code}\n' --socks5-hostname 127.0.0.1:1081 https://www.youtube.com/   # 200
curl -s -o /dev/null -w '%{http_code}\n' --socks5-hostname 127.0.0.1:1083 https://tv360.vn/          # 301/200 (bản full)
curl -s https://1.1.1.1/cdn-cgi/trace | grep -E '^ip=|^loc='                                        # phải là IP VN
```

TV: nối Wi-Fi/LAN của router, **xoá proxy cũ** (`adb shell settings delete global http_proxy`) và kiểm
FPT Play + YouTube ≥ 5 phút, TV360 ≥ 2 phút.

## 6. Rollback

- Flash lỗi → TFTP recovery với stock `2.0.28` (giữ file trước khi flash).
- Gateway lỗi nhưng router vẫn sống → `ssh root@192.168.50.1 '/etc/init.d/sing-box stop'` và bật lại
  cờ DHCP/router như cũ; TV quay lại gateway dự phòng (laptop `.5` / điện thoại `.101` — app tự dò).

## 7. Bí mật không nằm trong repo

`node2.json` / `node3.json` chứa mật khẩu + obfs của tunnel. Repo chỉ có **template**
`relay-node2.json.tmpl` / `relay-node3.json.tmpl` với `${HYST_PASSWORD}` / `${HYST_OBFS}`.
Điền bằng biến môi trường lúc chạy `build-arm64.sh`, **không commit** file thật.
