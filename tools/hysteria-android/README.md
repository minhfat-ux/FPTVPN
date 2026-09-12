# hysteria-android — build bộ AAR cho app VPNFlow Android

Thư mục này giữ **nguồn có thể tái lập** cho `android/app/libs/hysteria.aar`
(29 MB, đã commit trong repo). AAR chứa hysteria2 client chạy trong app, với
3 điểm khác upstream:

1. **Nhận TUN fd từ VpnService** — `patch_tun_fd.py` thêm `FileDescriptor` vào
   `tun.Server` (app/internal/tun/server.go) và truyền vào `tun.Options` của
   sing-tun (apernet fork đã hỗ trợ `Options.FileDescriptor`).
2. **Socket transport do Java tạo** — `Connect(..., sockFd, sockTcp)` nhận fd
   socket (UDP trực tiếp hoặc TCP relay) đã được app `protect()` khỏi VPN tunnel.
   Đây là fix cho bug "connected but no internet": socket của chính tunnel không
   được protect sẽ bị route vào tunnel chưa kết nối.
3. **Connect()/Serve() tách rời** — dial xong mới `establish()` VpnService, nên
   khi mọi transport fail thì mạng của máy **không bị mất** (không có tun chết).
4. **Brutal congestion control** — `upKbps`/`downKbps` → `client.BandwidthConfig`
   (`MaxTx`/`MaxRx`). Bật Brutal giúp tăng tốc mạnh trên mạng loss/high-RTT
   (China mobile). Đặt 0 = dùng CC mặc định.

Ngoài ra `Serve()` set `Timeout: 60` (UDP NAT timeout) — để 0 sẽ panic
`non-positive interval for NewTicker` trong sing-tun.

## Build

```bash
tools/hysteria-android/build.sh
```

Script sẽ: clone hysteria (tag `app/v2.12.2`) vào `/tmp/hysteria` → patch TUN fd →
copy `mobile.go` → `gomobile bind` → ghi đè `android/app/libs/hysteria.aar` →
in ra API Java để kiểm tra.

Yêu cầu: Go ≥ 1.22, gomobile, **NDK r25** (r26+ lỗi `meta/platforms.json`), JDK 17,
Android SDK.

## API xuất sang Kotlin (`mobile.Mobile`)

```java
static void connect(String host, long port, String password, String obfsPass,
                    long sockFd, boolean sockTcp, long upKbps, long downKbps) throws Exception;
static void serve(long tunFd, long mtu, String tunIpv4, String tunIpv6) throws Exception;
static void stop();
```

`android/app/src/main/java/com/privatevpn/app/vpn/HysteriaVpnService.kt` là nơi
gọi: tạo socket trong Java → `protect()` → `Mobile.connect(...)` → `establish()`
→ `Mobile.serve(...)`.
