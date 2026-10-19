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
| APK | package | versionCode / versionName | minSdk | size | sha256 |
|---|---|---|---|---|---|
| modern-debug | `com.privatevpn.app.dev` | 37 / 1.4.5-dev | 26 | 112.646.443 | `37E0B4C9DCE7F8A76B8A9030DD29ABB4CEA787282C24F9B8176D2476EC31837A` |
| legacy-debug | `com.privatevpn.app.dev` | 37 / 1.4.5-dev | 24 | 112.662.827 | `484608ACB136E586BF3069E8407A127CB89732181CAC1FB601DC24282F0FBAEB` |
| tv-debug | `com.privatevpn.app.tv.dev` | 37 / 1.4.5-tv-dev | 26 | 112.646.443 | `D4C712A750C043E5E2C422BADE4747855A60991C1052887028B807C08B15FC25` |
| modern-release | `com.privatevpn.app` | 37 / 1.4.5 | 26 | 79.106.244 | `C195EB6A99D058F89DB0973A20ECC1469899C3D81ADB8858185C61EB81C1D663` |
| legacy-release | `com.privatevpn.app` | 37 / 1.4.5 | 24 | 79.122.645 | `098902DEDAE154511504F70167B02BEC9D123B5E4B4B10D805DA42AF2DCE9B55` |
| tv-release | `com.privatevpn.app.tv` | 37 / 1.4.5-tv | 26 | 79.106.409 | `265D46B49AD3E9381A2DCA95C3A39ABDA5FC930ACEC99B26070D472BB980B2C2` |

Release ký bằng keystore VPNFlow: `CN=Minh Nguyen Binh, OU=VPNFlow, O=VPNFlow, L=Hanoi, C=VN`
(`SHA-256 dc6e484b…`).

## 3. Quyết định & giả định (kèm lý do)

1. **N=1 phải y hệt bản đang phát:** `wsRelayAttempt()` thành dispatcher; nhánh `n<=1` gọi
   `wsRelaySingleAttempt()` — **không sửa một dòng nào** trong thân hàm cũ. Mặc định prefs = 1.
2. **Tunnel CHÍNH đi `Mobile.connect`, tunnel PHỤ đi `Mobile.connectSlot`** (giống iOS). Lý do phụ:
   nếu app gọi `connectSlot` cho cả slot 0 thì bên Go `active == nil` + `len(slots)==1` ⇒ bản iOS đầu
   tiên trả “hysteria not connected”; nhánh đó đã được vá trong `Serve()` nên cả hai cách đều chạy.
3. **Số khai = (một luồng) × N — LUÔN nhân, kể cả số đo** (chốt lại sau khi đo trên máy thật):
   `NetworkPreMeasure.measureOnce` mở **đúng MỘT** kết nối (giống `measureOnce` bên iOS) nên số đo là
   năng lực một luồng; nấc tĩnh 30/100 Mbps cũng là số một luồng. Không nhân ⇒ Brutal CC khoá ở mức
   một luồng, bật N không nhanh hơn (handoff §2.4).
   **Bẫy đo được trên máy thật:** `refreshMeteredState()` (chạy khi đổi mạng VÀ trong `reportUp()`)
   ghi đè `attemptUpKbps/attemptDownKbps` về số MỘT luồng ⇒ đọc lại field sau đó là mất phần ×N
   (log thật 19/10: `up=2081 down=6938` dù N=4). Nay chốt vào biến cục bộ `declaredUp/declaredDown`
   và gán lại NGAY trước mỗi lần `connect`/`connectSlot`.
4. **Bộ đếm byte của vòng lấy mẫu phải CỘNG mọi cầu WS** (`wsRxBytes()/wsTxBytes()`): ở N>1 byte nằm
   rải trên N cầu, chỉ đọc cầu chính thì Diagnostics báo thiếu đúng N lần và ramp tưởng mạng yếu rồi
   hạ số khai oan.
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

## 6. NGHIỆM THU TRÊN MÁY THẬT — ĐẠT (19/10/2026, Samsung `SM-F9460`, Android 16)

Thiết bị: `SM-F9460` (Android 16), gói debug `com.privatevpn.app.dev`, app **Premium Active**, kết nối
qua wireless debugging `10.193.44.100:41719` (cổng do mDNS `_adb-tls-connect` trả về, KHÔNG phải 5555).

Bối cảnh đo: LAN của máy build **đi được đường trực tiếp**, mà N-tunnel chỉ nằm trên đường WS, nên bản
test được build với `HY_TCP_RELAY_PORTS = HY_PORTS = intArrayOf(9)` để ép mọi cửa trực tiếp chết.
**Sau khi đo xong đã revert `Config.kt` về `8443` và build lại 6 APK chính thức** (§2c).

### 6a. N=4 — log thật (`/sdcard/Android/data/com.privatevpn.app.dev/files/diagnostics.log`)
```
13:25:32.945 I n-tunnel: N=4 (hút băng thông BẬT)
13:25:39.101 I ws-relay: local udp 127.0.0.1:37194 -> wss://api.meetflowai.site/relay/vn1hy
13:25:39.107 I ws-relay: local udp 127.0.0.1:40070 -> wss://api.meetflowai.site/relay/vn1hy
13:25:39.110 I ws-relay: local udp 127.0.0.1:42910 -> wss://api.meetflowai.site/relay/vn1hy
13:25:39.113 I ws-relay: local udp 127.0.0.1:51585 -> wss://api.meetflowai.site/relay/vn1hy
13:25:39.557 I ws-relay: connected
13:25:39.611 I ws-relay: connected
13:25:39.647 I ws-relay: connected
13:25:40.014 I ws-relay: connected
13:25:41.516 I tunnel: UP (ws-n4)
13:25:41.517 I n-tunnel: 4/4 tunnel sẵn sàng (up=8324 down=27752 kbps, đã ×4) serve() start
```
⇒ **4 cầu WS mở THẬT** (4 cổng UDP local khác nhau), **cùng một relay** của node (bất biến F3),
**một** `serve()`; số khai 8324/27752 = 2081/6938 × 4. UI hiện **Connected**. Lặp lại 3 lần, cả 3 đều
`4/4` (13:20, 13:23, 13:25).

### 6b. N=1 — "y hệt bản đang phát"
Lần chạy N=1 trên cùng máy: lên bằng `hy-tcp:8443` (đường trực tiếp), **không** mở cầu phụ, **không** có
dòng log nào của nhánh N — đúng thiết kế dispatcher (nhánh `n<=1` gọi nguyên hàm cũ).

### 6c. Diagnostics — số là LIVE, rảnh thì 0 (trả lời câu hỏi của chủ dự án 19/10)
`Download speed` / `Upload speed` cập nhật **1 giây/lần** theo lưu lượng thật, nên tunnel rảnh thì hiện
`0 kbps` — không phải lỗi. Khi có traffic thật (mở 1 file 150 MB qua Chrome):
```
13:33:32.887 bw: sample net=wifi-gw-10.193.44.1 observed=3357 active=5753/7 declared=6938 rtt=416ms loss=0% src=2
13:33:48.366 bw: sample ... observed=408 active=763/6 declared=6938 ...
probe: THROUGH TUNNEL http 1.1.1.1:80 ok=HTTP/1.1 301 Moved Permanently
```
Hai lỗi THẬT đã sửa trong cùng lần đo này: (1) số khai bị `refreshMeteredState()` ghi đè về số một
luồng (mất ×N) — nay chốt vào biến cục bộ; (2) bộ đếm byte chỉ đọc cầu WS chính (Diagnostics báo thiếu
N lần khi N>1) — nay cộng `wsRxBytes()/wsTxBytes()` trên **mọi** cầu.

### 6d. Việc còn lại
1. **Publish** chưa làm (đúng phân vai harness Windows); 6 APK release đã sẵn trong
   `~/.vpnflow-build/app/outputs/apk/*/release/`.
2. **Mức tăng băng thông** chỉ đo được trên mạng bị giới hạn theo từng kết nối (mạng TQ / TV Xiaomi):
   ở đó so `N=1` vs `N=4` với mốc 1 luồng 4–12 Mbps, 8 luồng 72–81 Mbps (handoff §5.2). Trên LAN VN
   đường trực tiếp nhanh nên N-tunnel không được dùng tới.
3. APK test đã đưa lên server: `https://meetflowai.site/dl/test/VPNFlow-phone-v37.apk`,
   `…/VPNFlow-tv-v37.apk`, `…/VPNFlow-legacy-v37.apk`.
