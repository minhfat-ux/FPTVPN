# http-socks-bridge — HTTP proxy → SOCKS5

Cầu nối cho **proxy mode**: hệ điều hành (Android TV system proxy, Windows WinINet/WinHTTP)
chỉ hiểu **HTTP proxy**, còn `flowvpnrelay` mở **SOCKS5**. Tool này nhận HTTP (CONNECT + plain)
rồi chuyển tiếp qua SOCKS5.

```bash
go build -o http-socks-bridge main.go

# flowvpnrelay mở SOCKS5 127.0.0.1:1081 (xem tools/hysteria-relay)
./http-socks-bridge -listen 127.0.0.1:18081 -socks 127.0.0.1:1081

# kiểm tra: IP phải là IP node Việt Nam
curl -x http://127.0.0.1:18081 http://ip-api.com/line/?fields=query,country,as
```

Chỉ dùng thư viện chuẩn của Go; không cần TUN, không cần quyền admin.

## Vì sao cần

- Android TV (Xiaomi, `CONFIG_TUN is not set`): VPNFlow bản TV chạy transport `http1081`
  — đúng cơ chế này nhưng nằm trong APK.
- Windows: khi TUN không dùng được (không admin / Smart App Control chặn binary chưa ký),
  proxy mode là đường dự phòng.

## Lưu ý vận hành

- Đặt system proxy xong **phải dọn khi thoát và khi khởi động máy**: proxy trỏ vào cổng
  đã chết ⇒ mất mạng toàn hệ thống.
- Chỉ app tôn trọng system proxy mới đi qua tunnel (FPT Play có tôn trọng — đã đo).
