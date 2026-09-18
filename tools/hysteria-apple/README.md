# hysteria-apple — build framework hysteria2 cho iOS + macOS (VPNFlow)

Thư mục này giữ **nguồn tái lập** cho 2 xcframework mà app Apple dùng:

| Artifact (đường dẫn cài mặc định) | Slice | Module cho Swift |
|---|---|---|
| `iOS/Frameworks/Hysteria.xcframework` | `ios-arm64`, `ios-arm64_x86_64-simulator` | `import Hysteria` |
| `iOS/Frameworks/Hysteria-macos.xcframework` | `macos-arm64_x86_64` | `import Hysteria` |

Android đã có `android/app/libs/hysteria.aar` (xem `tools/hysteria-android/`), nhưng AAR
không dùng được cho iOS/macOS: cần `gomobile bind -target=ios|macos` sinh
`Hysteria.framework` (static archive + header ObjC). Cả 2 bản Apple dùng **cùng**
`mobile.go` và **cùng** patch TUN fd với Android, nên logic transport chỉ có 1 nguồn.

## Build

```bash
tools/hysteria-apple/build.sh                 # clone + patch + bind + cài vào iOS/Frameworks
HYSTERIA_SRC=/path OUT=/tmp/out tools/hysteria-apple/build.sh
tools/hysteria-apple/verify.sh                # kiểm chứng artifact + link & chạy thật
```

Script làm đúng các bước: clone hysteria tag `app/v2.12.2` (mặc định vào
`/tmp/hysteria-apple/hysteria`) → chạy `tools/hysteria-android/patch_tun_fd.py` → copy
`tools/hysteria-android/mobile.go` vào `app/mobile/` → `go get github.com/sagernet/gomobile@v0.1.13`
(module đích phải require fork này, xem bên dưới) → `gomobile bind` 2 lần
(`-target=ios,iossimulator` và `-target=macos`) → `ditto` sang `OUT` → in `lipo -info`
+ `shasum -a 256`.

Yêu cầu: Go ≥ 1.25 + Xcode + **gomobile fork của SagerNet**:

```bash
go install github.com/sagernet/gomobile/cmd/gomobile@v0.1.13
go install github.com/sagernet/gomobile/cmd/gobind@v0.1.13
```

Bản `golang.org/x/mobile` **không dùng được**: nó không có `-target=macos`, và `gobind`
của fork load package `github.com/sagernet/gomobile/bind` từ **module đích**, nên thiếu
bước `go get` sẽ lỗi `unable to import bind: no Go package in
github.com/sagernet/gomobile/bind`.

## API xuất sang Swift / ObjC

`mobile.go` chỉ export hàm (không export type) nên gomobile sinh **hàm C** (không phải
class `Mobile`), tất cả trong `Headers/Mobile.objc.h`:

```objc
BOOL MobileConnect(NSString *host, long port, NSString *password, NSString *obfsPass,
                   long sockFd, BOOL sockTcp, long upKbps, long downKbps, NSError **error);
BOOL MobileServe(long fd, long mtu, NSString *tunIpv4, NSString *tunIpv6, NSError **error); // BLOCKS
void MobileStop(void);
```

```swift
import Hysteria            // umbrella header: Hysteria.h
var err: NSError?
MobileConnect(host, port, password, obfsPass, sockFd, false, up, down, &err)   // port/sockFd/up/down: Int
MobileServe(tunFd, 1500, "100.100.100.101/30", "", &err)   // chạy tới khi MobileStop()
MobileStop()
```

Framework là **static archive** nhúng trong `.framework` (không phải dylib), nên chỉ cần
link vào target; **không cần cờ linker đặc biệt** (`-lresolv` không bắt buộc — đã test
link thiếu nó vẫn chạy; `libresolv.9.dylib` được kéo theo sẵn). `project.yml` đã khai báo
`framework: iOS/Frameworks/Hysteria-macos.xcframework` cho `PrivateVPNMacPacketTunnel`.

## Ghi chú cho phần iOS/macOS gọi vào

- `Serve(fd, ...)` nhận **fd của utun sẵn có**; NEPacketTunnelProvider lấy bằng KVC:
  `packetFlow.value(forKey: "socket") as? Int32`. `patch_tun_fd.py` + sing-tun
  (`tun_darwin.go`) hỗ trợ `Options.FileDescriptor` trên darwin y như Android, nên
  **không cần patch riêng cho Apple** — chỉ khác comment trong code.
- `Connect()` phải chạy **trước** khi tunnel up (giống Android): dial fail thì mạng máy
  không bị đen. `Serve()` block; `Stop()` an toàn từ mọi thread.
- Trên Apple, socket transport **không** cần `protect()` như Android: extension đã nằm
  trong tunnel process, `sockFd = 0` để Go tự mở UDP cũng được (đường relay TCP/UDP của
  app là logic nghiệp vụ riêng, xem `HysteriaVpnService.kt` bản Android để tham chiếu).
- Module của cả 2 xcframework đều là `Hysteria`. Nếu bind `-o Hysteria-macos.xcframework`
  trực tiếp, gomobile đặt tên module theo basename → `Hysteria-Macos`, **Swift không
  import được** (`no such module`); vì vậy `build.sh` bind thành `Hysteria.xcframework`
  rồi mới đặt tên container là `-macos`.

## Không commit binary

`iOS/Frameworks/` nằm trong `.gitignore` (dòng 89) và 2 xcframework nặng ~115 MB, nên
**không commit vào repo**. Máy khác cần thì chạy `tools/hysteria-apple/build.sh`; artifact
là build product cục bộ, không phải nguồn sự thật. Nguồn sự thật là `build.sh` +
`tools/hysteria-android/mobile.go` + `patch_tun_fd.py`.
