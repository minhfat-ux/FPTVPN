# Bàn giao → PUBLISHER (nghiệm thu iOS 1.4.3) — 23/09/2026

> Viết vào repo vì kênh inbox (node-2:22) **không gửi được từ Mac** lúc này (WiFi công ty chặn cổng 22).
> Sẽ gửi lại qua `flowvpn-notify --to publisher` khi Mac sang mạng khác.

## 0. Trạng thái mới (khác bản bàn giao đầu)

- **Relay đã được Windows deploy**: `relay-cf-vn1hy` giờ `udpErr=0`, đã chuyển **943 MB vào / 1,1 GB
  ra** (trước đó 100% `EINVAL`). ⇒ Không còn phải chờ việc này trước khi phát iOS.
- **Bản 1.4.3/20 đã cài sẵn trên iPhone** (credential hysteria OK; có fix MTU + watchdog + mốc bộ
  giám sát lưu lượng).

## 1. ⚠️ KHÔNG nghiệm thu trên WiFi công ty

Chủ dự án đã gặp ca "bấm Connect không được" và **nguyên nhân là mạng WiFi công ty**, không phải app.
Bằng chứng từ log máy (phép đo chạy TRƯỚC khi tunnel được áp):

```
17:23:51  đo mạng thật: CHƯA ĐỦ DỮ LIỆU từ https://meetflowai.site/v1/downloads/ios
17:23:54  đo mạng thật: CHƯA ĐỦ DỮ LIỆU từ https://speed.cloudflare.com/__down?bytes=1500000
17:23:54  KHÔNG đo được ở CẢ 2 NGUỒN        ← điện thoại không có internet
17:24:06  startTunnel thất bại: ws-relay không dựng được (WS không mở được trong 6s)
```

⇒ Nghiệm thu phải chạy trên **4G/hotspot**; test trên WiFi chặn sẽ fail và **kết luận oan là lỗi app**.

## 2. Bảng nghiệm thu — đạt CẢ 3 mới phát

Kéo log:
```
xcrun devicectl device copy from --device 33987D6F-5424-58C7-9CFC-7A0B1F60C717 \
  --domain-type appDataContainer --domain-identifier com.privatevpn.app.packet-tunnel \
  --source Documents/relay.log --destination /tmp/relay.log
```

1. Có `hysteria: áp network settings (… mtu 1300, dns 1.1.1.1,8.8.8.8)`.
2. Sau mỗi dòng `giám sát sống-còn: transport vừa thay (ramp băng thông)` **KHÔNG có**
   `QUYẾT ĐỊNH TỰ GỠ` trong ~90 giây kế tiếp (bug vừa fix: trước đó tunnel bị gỡ oan).
3. Connect → xem Netflix/tải lớn **≥5 phút**: `observed` > 0, `bỏ` < 1%, không `startTunnel thất bại`.

Số đã đo sẵn để đối chiếu: phiên 17:01 đạt **37,3 MB tải về**, `observed` 5404 kbps, `bỏ 211/36037` = 0,6%.

## 3. Còn treo (theo dõi, KHÔNG chặn phát)

Ca tiến trình extension **ngừng ghi log im lặng** 17:03:12 → 17:14:21 (11 phút; không crash, không
jetsam, không `stopTunnel`) — xảy ra khi đang ở WiFi công ty. Nếu tái diễn trên mạng tốt, báo lại Mac;
Mac sẽ cài công cụ đọc syslog iPhone (không cần Xcode) để bắt tận tay.
