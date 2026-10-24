# Router OpenWrt cho TV Xiaomi — thay cho gateway Mac/Windows

## Kiến trúc

Một router chạy **sing-box** làm toàn bộ việc định tuyến theo tên miền:

| Đích | Đi ra | Vì sao |
|---|---|---|
| `*.tv360.vn` | **node-3** (`103.6.235.39`) | TV360 cần exit riêng (node-3), node khác bị chậm/chặn |
| `fptplay.net` / `fptplay.vn` / `fpt.vn` | **node-2** (`165.101.114.162`) | FPT Play |
| `youtube.com`, `googlevideo.com`, `ytimg.com`, `ggpht.com`, `googleapis.com` | **node-2** | FPT Tubeflow / YouTube |
| LAN nội bộ | direct | — |

TV/điện thoại nối Wi-Fi router ⇒ **không cần proxy, không cần app scan gateway**. Chỉ cần TV bật là có mạng (dưới 2 s).

## Chuẩn bị

1. Router có OpenWrt / ImmortalWrt (Xiaomi AX3000T V1 = RD03; Redmi AX6000; GL-MT6000).
2. Cài gói: `sing-box` (hoặc `mihomo`). Với OpenWrt 23.05+: `opkg update && opkg install sing-box` (có trong feed), hoặc tải binary chính thức.
3. Điền `tools/router/sing-box-template.json` → `/etc/sing-box/config.json` trên router.
   **KHÔNG commit bản đã điền mật khẩu** — file template chỉ có `<SECRET_*>`.
4. Bật TPROXY + redirect traffic LAN vào sing-box (script `route-setup.sh`, xem dưới).

## Bật định tuyến trong suốt (nftables)

```sh
# /etc/nftables.d/10-singbox.nft (hoặc đặt trong firewall include)
table inet singbox {
  chain prerouting {
    type filter hook prerouting priority mangle; policy accept;
    ip daddr { 0.0.0.0/8, 10.0.0.0/8, 127.0.0.0/8, 169.254.0.0/16, 172.16.0.0/12, 192.168.0.0/16, 224.0.0.0/4 } return
    meta l4proto { tcp, udp } tproxy ip to :7893 meta mark set 0x1 accept
  }
}
```

```sh
ip rule add fwmark 1 table 100
ip route add local default dev lo table 100
```

## Kiểm tra sau khi cài

```sh
# Từ router
curl -s -o /dev/null -w "%{http_code}\n" https://tv360.vn/          # 200
curl -s -o /dev/null -w "%{http_code}\n" https://www.fptplay.net/   # 200/403/503 (bất kỳ, quan trọng là có phản hồi)
# Từ TV: mở FPT Play + TV360 + FPT Tubeflow, KHÔNG đặt proxy
adb shell settings delete global http_proxy
```

## Ghi chú bảo mật

- Mật khẩu hysteria/obfs KHÔNG được nằm trong repo. Template chỉ có placeholder.
- Sau khi dùng router, có thể tắt hẳn gateway Mac/Windows và xoá `http_proxy` trên TV; khi đó các app
  TVFlow Home/Guard chỉ còn là dự phòng khi dùng mạng ngoài.
