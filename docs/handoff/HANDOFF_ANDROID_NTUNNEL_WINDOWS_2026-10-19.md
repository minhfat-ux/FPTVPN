# BÀN GIAO — Android đã port **N-tunnel (hút băng thông)** — 19/10/2026

- **Từ:** harness Windows (dev Android) · **Cho:** chủ dự án + harness Mac (đối chiếu iOS)
- **Nguồn yêu cầu:** `docs/handoff/HANDOFF_ANDROID_NTUNNEL_WINDOWS_2026-10-20.md` (commit `80052c1`),
  tham chiếu iOS `167ba9d` (build 79) + `3522c6a` (đa ngôn ngữ) + `26c0f37` (nút Connect)
- **Trạng thái:** code + test + build **XONG**; **nghiệm thu trên máy thật CHƯA chạy** (không có thiết bị
  nào bật ADB trong lúc build — xem §6)

## 1. Files changed

| path | thay đổi |
|---|---|
| `tools/hysteria-android/mobile.go` | + `multiClient` (chia LUỒNG vòng tròn), `ConnectSlot`, `SlotCount`, map `slots`; `Serve()` gộp **active + slots** (và xử lý ca chỉ có 1 slot); `Stop()` đóng cả slots; chặn `nil` khi `Stop()` chen giữa `Connect()` và `ConnectSlot()` (nil trong `multiClient` sẽ panic) |
| `tools/hysteria-android/build.sh` | ghi chú build trên **Windows** (NDK r25c, gomobile fork v0.1.13, `JAVA_TOOL_OPTIONS` UTF-8, shim `python3`) — đúng 4 lỗi đã gặp khi build |
| `android/app/libs/hysteria.aar` | **build lại**: 30.527.366 B → **33.813.881 B**; 4 ABI `arm64-v8a / armeabi-v7a / x86 / x86_64` |
| `android/.../vpn/HysteriaVpnService.kt` | N-tunnel: field `multiTunnelCount`/`extraBridges`/`multiTunnelServing`; đọc N từ Intent **hoặc** prefs; `wsRelayAttempt()` thành dispatcher → `wsRelaySingleAttempt()` (giữ nguyên bản cũ) / `wsRelayMultiAttempt(n)`; helpers `newProtectedRelaySocket`, `awaitBridge`, `connectClientSlot`, `stopExtraTunnels`, `onExtraBridgeDead` |
| `android/.../Config.kt` | `MULTI_TUNNEL_MAX=8`, `MULTI_TUNNEL_CHOICES={2,4,6,8}`, `MULTI_TUNNEL_DEFAULT_ON=4`, `KEY_MULTI_TUNNEL="multi_tunnel_count"` (khoá RIÊNG, không dùng chung với iOS) |
| `android/.../vpn/MultiTunnelPolicy.kt` | **mới** — luật thuần logic: kẹp N, số khai = một-luồng × N, số tunnel phụ |
| `android/.../vpn/VPNManager.kt` | truyền `EXTRA_MULTI_TUNNEL` khi start service (đọc prefs lúc Connect) |
| `android/.../ui/SettingsScreen.kt` | mục **“Tăng tốc”**: công tắc + chọn 2/4/6/8 (**mặc định TẮT**), ghi chú “áp dụng ở lần kết nối sau” |
| `android/.../l10n/L10n.kt` | +4 khoá (`boost`, `boostNTunnel`, `boostCount`, `boostHint`) cho **5 ngôn ngữ** (en/vi/zh/ja/ko) |
| `android/app/build.gradle.kts` | `versionCode 36 → 37`, `versionName "1.4.3" → "1.4.5"` |
| `android/app/src/test/.../MultiTunnelPolicyTest.kt` | **mới** — 7 test |

## 2. Lệnh đã chạy + kết quả thật

### 2a. Build core AAR (Go) — điều kiện tiên quyết
```
# hysteria: C:\Users\Minhn\hy-src  HEAD=619a6f8  tag=app/v2.12.2
python tools/hysteria-android/patch_tun_fd.py   → patched app/internal/tun/server.go
cp tools/hysteria-android/mobile.go  hy-src/app/mobile/mobile.go
go get github.com/sagernet/gomobile/bind@v0.1.13
JAVA_TOOL_OPTIONS=-Dfile.encoding=UTF-8 gomobile bind -target=android -androidapi=26 \
  -ldflags="-extldflags=-Wl,-z,max-page-size=16384" -o android/app/libs/hysteria.aar ./mobile
→ exit=0, hysteria.aar = 33.813.881 B
```
API Java sau khi bind (javap `mobile.Mobile`):
```
connect(String, long, String, String, long, boolean, long, long)
connectSlot(long, String, long, String, String, long, boolean, long, long)
serve(long, long, String, String) ; stop() ; slotCount()
```
ABI trong AAR: `arm64-v8a 15.480.368`, `armeabi-v7a 15.346.916`, `x86 15.646.652`, `x86_64 16.663.616`.

### 2b. Unit test (3 flavor)
```
gradlew :app:testModernDebugUnitTest :app:testLegacyDebugUnitTest :app:testTvDebugUnitTest
→ BUILD SUCCESSFUL
modern: tests=64 failures=0 skipped=0
legacy: tests=64 failures=0 skipped=0
tv:     tests=64 failures=0 skipped=0
MultiTunnelPolicyTest: tests=7 failures=0   (7/7 ok)
```
Baseline TRƯỚC khi sửa cũng 3/3 xanh — nên đây là so sánh cùng điều kiện.

### 2c. Build 6 APK (mọi version Android)
```
gradlew :app:assemble{Modern,Legacy,Tv}{Debug,Release}
→ BUILD SUCCESSFUL in 2m41s
```
| APK | package | versionCode / versionName | minSdk | size | sha256 (đầu) |
|---|---|---|---|---|---|
| modern-debug | `com.privatevpn.app.dev` | 37 / 1.4.5-dev | 26 | 112.646.443 | `2C720208…` |
| legacy-debug | `com.privatevpn.app.dev` | 37 / 1.4.5-dev | 24 | 112.662.827 | `DCB12F24…` |
| tv-debug | `com.privatevpn.app.tv.dev` | 37 / 1.4.5-tv-dev | 26 | 112.646.443 | `AF72CB57…` |
| modern-release | `com.privatevpn.app` | 37 / 1.4.5 | 26 | 79.106.252 | `212D7EE0…` |
| legacy-release | `com.privatevpn.app` | 37 / 1.4.5 | 24 | 79.122.640 | `A33447D1…` |
| tv-release | `com.privatevpn.app.tv` | 37 / 1.4.5-tv | 26 | 79.106.419 | `7252EBDF…` |

Release ký bằng keystore VPNFlow: `CN=Minh Nguyen Binh, OU=VPNFlow, O=VPNFlow, L=Hanoi, C=VN`
(`SHA-256 dc6e484b…`).

## 3. Quyết định & giả định (kèm lý do)

1. **N=1 phải y hệt bản đang phát:** `wsRelayAttempt()` thành dispatcher; nhánh `n<=1` gọi
   `wsRelaySingleAttempt()` — **không sửa một dòng nào** trong thân hàm cũ. Mặc định prefs = 1.
2. **Tunnel CHÍNH đi `Mobile.connect`, tunnel PHỤ đi `Mobile.connectSlot`** (giống iOS). Lý do phụ:
   nếu app gọi `connectSlot` cho cả slot 0 thì bên Go `active == nil` + `len(slots)==1` ⇒ bản iOS đầu
   tiên trả “hysteria not connected”; nhánh đó đã được vá trong `Serve()` nên cả hai cách đều chạy.
3. **Số khai = (một luồng) × N, nhưng KHÔNG nhân số đo/ramp.** Handoff §2.4 yêu cầu “năng lực tổng”;
   trên Android có hai loại mốc: nấc tĩnh `REASON_PROFILE` (30/100 Mbps của MỘT luồng ⇒ nhân N) và
   số đo/ramp — vòng lấy mẫu đọc lưu lượng `tun0` = **tổng của cả N tunnel**, nên nhân N nữa là khai
   vống N lần. Đã khóa bằng test.
4. **Cầu phụ là best-effort:** mở/bắt tay lỗi thì bỏ riêng cầu đó, **không** làm hỏng tunnel chính.
   Nhưng khi **đang chạy** mà một cầu phụ chết thì dựng lại cả transport (giống đường 1 cầu), vì
   `multiClient` vẫn chia luồng vào cầu chết ⇒ hỏng âm thầm một phần phiên.
5. **`protect()` cho DatagramSocket của cầu phụ:** nếu false thì `ensureTun()` rồi protect lại —
   đúng cách chữa v36 cho TV Xiaomi (protect trả false khi chưa có TUN).
6. **Version:** `37 / 1.4.5`. Android đã phát `1.4.4/32`; các bản dev 33–36 giữ `1.4.3` nên đây là
   mốc kế tiếp. `versionCode` +1 đơn điệu theo `docs/VERSIONING.md`.
7. **Đối chiếu phần còn lại của bản iOS cập nhật:**
   - “đa ngôn ngữ cho mục Hút băng thông” (`3522c6a`) ⇒ đã làm 5 ngôn ngữ.
   - “nút Connect không bị nuốt khi đang Disconnecting” (`26c0f37`): đường Hysteria của Android
     **không có** guard `isTransitioning` (đã đọc `VPNManager.connect/consentAndStartHysteria/
     claimDeviceThenStart`) ⇒ lỗi này không tồn tại bên Android, không cần sửa.

## 4. Luật bất biến đã giữ

- **F3 — cùng exit node:** N cầu dùng **cùng `relayUrl`** của node đang chạy (`hostRelays[runHost]`),
  không mở cầu sang node khác ⇒ IP khách không đổi giữa phiên.
- **Chia theo LUỒNG, không chia theo gói:** round-robin ở `multiClient.TCP/UDP` (Go), mỗi luồng đi
  trọn một tunnel ⇒ không đảo thứ tự.
- **Một `tun.Server` / một `serve(tunFd)`**, không mở N TUN.
- **Trap #1 của handoff (phân biệt “chưa đặt” với “đặt = 0”):** dùng `Intent.hasExtra` +
  `getInt(key, 1)`; giá trị 0/âm/>8 đều bị `MultiTunnelPolicy.clampCount` kẹp.

## 5. Còn lại

1. **Publish** chưa làm (đúng phân vai: harness Windows phát Windows + Android; bản release đã sẵn
   trong `~/.vpnflow-build/app/outputs/apk/*/release/`). Nhãn/phát hành chờ chủ dự án chốt.
2. **Trần server:** nếu N=4 không nhanh hơn N=1 thì trần nằm ở relay/WS phía server (handoff §5.2),
   không phải ở app.

## 6. Điểm CHƯA chắc — cần máy thật (blocker)

Lúc build (11:57–12:04 ngày 19/10) **không có thiết bị nào online**: `adb devices` rỗng, 3 TV
`.110/.111/.112` và điện thoại `SM-F9460` đều không bật ADB. Vì vậy **chưa chạy được nghiệm thu §5 của
handoff**:

- N=1: log phải y hệt bản v36 (1 dòng `ws-relay: local udp …`, `transport: ws`).
- N=4: log phải có **4 dòng** `ws-relay: local udp 127.0.0.1:<port>` khác cổng +
  `n-tunnel: 4/4 tunnel sẵn sàng … serve() start`, và tốc độ tải tăng theo bậc.

Cách chạy ngay khi có 1 thiết bị (đã chuẩn bị sẵn APK):
```
adb install -r VPNFlow-phone-v37.apk        # hoặc VPNFlow-tv-v37.apk cho TV
# bật công tắc trong Settings → Tăng tốc → chọn 4
adb logcat -s VPNFLOW_DEBUG | findstr /I "n-tunnel ws-relay"
```
APK test đã đưa lên server: `https://meetflowai.site/dl/test/VPNFlow-phone-v37.apk`,
`…/VPNFlow-tv-v37.apk`, `…/VPNFlow-legacy-v37.apk`.
