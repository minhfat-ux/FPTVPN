# HANDOFF — Windows 1.4.7: bỏ hẳn `sing-box.exe`, đưa TUN vào chính `flowvpnrelay.exe`

- **Ngày:** 13/10/2026 · **Máy:** DESKTOP-852P1LT (mạng TQ) · **Commit:** `04a1af8` (đã push `origin/main`)
- **Loại:** fix lỗi khách + bỏ phụ thuộc binary bên thứ ba
- **Phạm vi:** Windows (app .NET, installer, assets) + `tools/hysteria-relay`

---

## 1. Vì sao

Khách báo (13/10/2026):

> "bản windows báo `sing-box.exe` đang phải có chữ ký"

Gốc: `sing-box.exe` là binary **bên thứ ba CHƯA KÝ**. Máy khách bật **Smart App Control**
(`VerifiedAndReputablePolicyState = 1`) thì policy WDAC `VerifiedAndReputableDesktop` đòi
signing level 2, nên mọi binary chưa ký mà Microsoft chưa có "uy tín" bị chặn:

- Event `CodeIntegrity` 3033 / 3077 / 3118, policy `{0283ac0f-fff1-49ae-ada1-8a933130cad6}`
- `Win32 4551` (`ERROR_ACCESS_DISABLED_BY_POLICY`) / `os error 4551`
- Trên máy harness: `sing-box.exe` bị chặn **16 lần / 30 ngày** (mới nhất 13/10 16:09:41)

Ta **không kiểm soát được chữ ký** của binary bên thứ ba ⇒ cách triệt để là **bỏ nó**.

### Đo trước khi quyết (cùng máy, cùng thời điểm)

| Binary | Chữ ký | Kết quả trên máy bật SAC |
|---|---|---|
| `sing-box.exe` | chưa ký (tự build từ v1.14.1) | ❌ bị chặn (`Application Control policy has blocked`) |
| `flowvpnrelay.exe` **hash mới, vừa build** | chưa ký | ✅ **chạy bình thường** |

Đây là bằng chứng quyết định: binary của chính mình **không** bị ISG gắn cờ, nên chỉ cần
chuyển việc của `sing-box` sang `flowvpnrelay` là hết lớp lỗi này — **không cần chứng chỉ**.

## 2. Cách làm

Hysteria v2 **vốn đã có** client TUN hoàn chỉnh (`app/internal/tun/server.go`, dùng
`apernet/sing-tun`), nhưng CLI chính thức chỉ mở nó khi khai khối `tun` trong YAML. Ta dùng
lại đúng package đó trong binary của mình:

```
flowvpnrelay.exe (Go, tự build từ tag app/v2.12.2)
├── transport hysteria2-over-WebSocket  (internal/wsrelay — giữ nguyên)
├── TUN + auto_route + bypass TQ        (internal/tun — MỚI, tools/hysteria-relay/tun.go)
└── SOCKS5 nội bộ                        (giữ lại cho chẩn đoán / đo băng thông)
```

**Không cần `wintun.dll` cạnh exe để dựng TUN**: `apernet/sing-tun` `//go:embed`
`wintun.dll` vào binary và nạp từ bộ nhớ (`internal/wintun/memmod`). (Đường WireGuard vẫn
dùng `wintun.dll` như cũ.)

### Hợp đồng với app C#

| Mốc | Ý nghĩa |
|---|---|
| `READY transport=… socks5=…` | SOCKS5 đã mở (giữ nguyên từ trước) |
| `TUNREADY if=<tên> mtu=<n> route=<yes\|no>` | **TUN đã có thật trong HĐH** — đây mới là mốc "tunnel dùng được" |
| `TUNFAIL <lý do ascii>` | Không dựng được TUN — app rơi đường khác NGAY |

Sau `TUNREADY`, app đặt DNS lên chính adapter đó bằng `netsh` (dùng lại
`WireGuardWindowsCommands.SetDns/AddDns` — cùng lệnh đường WireGuard đang dùng):
`1.1.1.1` + `8.8.8.8`. Truy vấn đi **trong tunnel** (hai IP này không nằm trong dải TQ bị
loại trừ) nên không bị GFW nhiễm độc — đúng bài học 1.4.6.

### Cổng sức khoẻ mới (thêm trong bản này)

`TryStartRelayTunnelAsync` **không nhận** đường relay chỉ vì TUN đã dựng: sau `TUNREADY` nó
gửi một request THẬT qua tunnel (`https://api.meetflowai.site/v1/health`) rồi mới kết luận.
Vì sao: TUN chiếm route `0.0.0.0/0` metric 0, nên một TUN "sống mà câm" là **cả máy mất
mạng** cho tới khi watchdog phát hiện (rảnh 60 s + 3 lần thử hỏng ≈ hơn 1 phút). Có cổng này
thì hỏng là rơi về WireGuard trong vài giây.

## 3. Files changed

| path | thay đổi |
|---|---|
| `tools/hysteria-relay/tun.go` | **MỚI.** Khối `tun` (JSON phẳng) + `buildTUN()` + `startTUN()` (chạy `Serve()` trong goroutine, poll `net.InterfaceByName` ≤ 15 s → in `TUNREADY`) + `TUNFAIL` |
| `tools/hysteria-relay/runner.go` | `config` thêm `Tun *tunConfig`; `serve()` mở SOCKS5 và/hoặc TUN, trả về khi một trong hai chết; gofmt lại |
| `tools/hysteria-relay/build.sh` | copy thêm `tun.go` vào checkout (2 → 3 file) |
| `tools/hysteria-relay/README.md` | §TUN: schema, mốc log, vì sao bỏ sing-box |
| `windows/.../Tunnel/HysteriaRelayDefaults.cs` | bỏ `SingBoxExeName`; thêm `TunName`/`TunAddress`/`TunMtu`/`TunDnsServers`/`TunReadyMarker`/`TunFailMarker` |
| `windows/.../Tunnel/SingBoxConfigBuilder.cs` | `BuildRelayConfig` sinh thêm khối `tun` (`route.ipv4`/`ipv6` RỖNG = auto-route toàn bộ; dải TQ vào `*Exclude`); tách v4/v6 đúng họ địa chỉ |
| `windows/.../Tunnel/HysteriaRelayTunnel.cs` | **MỘT** tiến trình con thay vì hai; chờ `TUNREADY`/`TUNFAIL` thay cho `READY`; đặt DNS lên adapter TUN; `ReadyTimeoutSeconds` 15 → 30 |
| `windows/.../ViewModels/VpnConnectionService.cs` | cổng sức khoẻ sau TUN; `RelayTunnelBudgetSeconds` 20 → 35; id transport `singbox-hy-relay` → `hy-ws-relay` |
| `windows/.../Tunnel/RelayHealthWatchdog.cs` | bỏ tín hiệu clash_api (không còn sing-box); `ForSingBox` → `ForRelayTunnel` (chỉ còn phép thử chủ động) |
| `windows/.../Tunnel/ApplicationControlGuard.cs` | thông báo cho khách: KHÔNG nhắc binary bên thứ ba, KHÔNG nói "cần ký số" |
| `windows/.../Services/SystemConflictProbe.cs` | dò `flowvpnrelay.exe` thay vì `sing-box.exe` |
| `windows/.../Views/SettingsView.axaml` | nhãn "Hysteria2 + sing-box (relay)" → "Hysteria2 over WebSocket (relay)" |
| `windows/.../PrivateVPNWindows.App.csproj` | bỏ `sing-box.exe`; `Version` 1.4.4 → **1.4.7** |
| `windows/installer/build.ps1` | danh sách asset/publish 4 → 3 binary |
| `windows/installer/VPNFlow.iss` | bỏ cổng `#error` + kiểm thiếu file của `sing-box.exe` |
| `windows/installer/verify-relay.ps1` | **viết lại**: `-ConfigOnly` (13 phép kiểm tĩnh, không cần admin) + chế độ đầy đủ (chờ `TUNREADY`, kiểm adapter/route/bypass TQ/DNS/egress/HTTP) |
| `windows/assets/fetch-assets.sh` | xoá toàn bộ phần tải/build `sing-box` |
| `windows/assets/THIRD_PARTY.md` | bỏ mục sing-box + license GPL-3.0; §4 ghi lại quyết định 13/10/2026 |
| `windows/assets/sing-box.exe` | **XOÁ** (59.290.624 B) |
| `windows/assets/flowvpnrelay.exe` | thay bản mới **12.729.856 B** · sha256 `0c51f2bb81dd194a2bbf54fe31a8f1ea928b4ce45c5e1f070e7a2778cd93de2e` |
| `docs/WINDOWS_HARNESS_TEST_PLAN.md` | cập nhật theo kiến trúc một binary (mục 0/1/2b/3/4) |
| Tests | `SingBoxConfigBuilderTests` (+2 test khối `tun`), `ApplicationControlGuardTests` (+1 test "không nhắc chữ ký"), `RelayHealthWatchdogTests` (+1 test hình dạng `-1`) |

## 4. Bằng chứng thật

### 4.1 Build lại relay từ source (Go 1.27.0, `CGO_ENABLED=0`, `-trimpath -ldflags "-s -w"`)

```
windows/amd64  bytes=12729856  sha256=0c51f2bb81dd194a2bbf54fe31a8f1ea928b4ce45c5e1f070e7a2778cd93de2e
darwin/arm64   bytes=11312562  sha256=0d364e68390e87d94bfbdd72565ea62c835aef98531dfb55fc26475f7a9bc191
linux/amd64    bytes=12144800  sha256=f6c6efa30e9a34848e855cb32828e57f9a821fb255f8805e5dd6d98cf5e5fffa
gofmt -l ./flowvpnrelay/ → (rong)      go vet ./flowvpnrelay/... → exit 0
```

Checkout hysteria `app/go.mod` **require block không đổi** trước/sau; repo không có `go.mod`
cho tool này ⇒ **không thêm dependency nào vào repo**.

### 4.2 Chế độ SOCKS5 cũ không hồi quy (không có khối `tun`, relay thật `vn2hy`)

```
[flowvpnrelay] đã nối 165.101.114.162:8443 qua wsrelay trong 11.671s (tx=0 udp=true ech=false)
[flowvpnrelay] READY transport=wsrelay server=165.101.114.162:8443 socks5=127.0.0.1:1081
curl --socks5-hostname 127.0.0.1:1081 https://api.ipify.org -> 165.101.114.162   (exit 0)
```
⇒ transport hysteria2-over-WS **thật sự chở được traffic** từ mạng TQ này.

### 4.3 Chế độ TUN khi KHÔNG có quyền admin (mong đợi fail sạch, không panic)

```
[flowvpnrelay] tun: đang dựng if=flowvpntun mtu=1500 ipv4=[100.100.100.101/30] ipv6=[] autoRoute=true strict=false excl4=2 excl6=0
[flowvpnrelay] TUNFAIL failed to create tun interface: Access is denied.
[flowvpnrelay] đường hầm dừng: failed to create tun interface: Access is denied. — dựng lại sau 1s
```
10 chu kỳ trong 45 s: `panic:` = 0, `goroutine N [` = 0, `.go:NN` = 0. `Get-NetAdapter`
trước == sau (không sót adapter/route/IP nào).

### 4.4 Cổng tĩnh của installer

```
verify-relay.ps1 -ConfigOnly  → KẾT LUẬN: ĐẠT — 13/13 phép kiểm tĩnh PASS   (EXIT=0)
  CIDR Trung Quốc: 7509 dải (IPv4 5494 + IPv6 2015)
  tun.name=flowvpntun · tun.ipv4=100.100.100.101/30 · tun.mtu=1500
  route.ipv4/ipv6 RỖNG · route.strict=false · ipv4Exclude=5494 · ipv6Exclude=2015
```
Kiểm âm (chứng minh cổng không bị nới): thiếu danh sách CIDR ⇒ `KHÔNG ĐẠT`, `EXIT=1`;
chạy chế độ đầy đủ khi không phải admin ⇒ từ chối, `EXIT=1`.

### 4.5 Unit test

```
dotnet test windows\VPNFlow.Windows.sln -c Release
Passed! - Failed: 0, Passed: 223, Skipped: 0, Total: 223
```

## 5. Quyết định & điểm chưa chắc

### 5.1 Đã chốt

1. **`AutoRoute` LUÔN bật khi có khối `tun`** (khác CLI hysteria: ở đó thiếu `route` thì
   `AutoRoute=false`). App luôn ghi khối `route`, nên "không khai" ≡ "khai rỗng" ≡ full-tunnel.
2. **Rỗng = toàn bộ** — xác nhận bằng `sing-tun/tun_rules.go BuildAutoRouteRanges`, không đoán.
   `ipv6` rỗng ⇒ KHÔNG gán IPv6 và KHÔNG sinh route `::/0` (mạng TQ phổ biến không có IPv6).
3. **Dùng mặc định của hysteria cho TUN**: `100.100.100.101/30` (CGNAT `100.64.0.0/10`) —
   không đụng LAN khách, không đụng `172.1x` mà Docker hay dùng.
4. **Giữ SOCKS5** trong TUN mode (dùng cho `verify-relay.ps1` và đo băng thông).
5. **Mất mát có ý thức**: bộ định tuyến theo **tên miền** TQ (57 mục WeChat/Tencent/`.cn`) của
   1.4.6 **không còn** vì hysteria TUN không có engine rule theo tên miền. Bypass nay chỉ theo
   **dải IP** (7.509 dải). Với dịch vụ TQ lớn, DNS trả về IP trong dải TQ nên rule `ip_cidr`
   vẫn phủ. Nếu khách báo một tên miền TQ cụ thể bị chậm ⇒ đây là chỗ xem đầu tiên.
6. **Thông báo cho khách** không còn nhắc `sing-box`, không còn nói "cần ký số" (khoá bằng test).

### 5.2 CHƯA nghiệm thu được trên máy này

> ⚠️ **Dựng TUN THÀNH CÔNG chưa được chạy thật** — phiên làm việc không có quyền
> Administrator nên `wintun.CreateAdapter` trả `Access is denied` trước khi có adapter.
> Vì vậy **chưa** quan sát được: `TUNREADY`, bảng route thật, bypass TQ thật, DNS qua tunnel,
> HTTP 200 qua tunnel. Cần **một lần chạy có quyền admin**:

```powershell
# (a) nghiệm thu độc lập, không cần mở app — tự dọn sạch sau khi xong
powershell -NoProfile -ExecutionPolicy Bypass -File .tmp\tun-e2e.ps1     # chỉ có trên máy harness
# hoặc bản chính thức trong repo:
powershell -NoProfile -ExecutionPolicy Bypass -File windows\installer\verify-relay.ps1 -Password <HY_PASSWORD> -Obfs <HY_OBFS>
```

- `TUNREADY if=flowvpntun mtu=1500 route=yes` trong ≤ 30 s
- `Get-NetRoute` có `0.0.0.0/0` (hoặc `/1`+`/1`) trỏ vào `flowvpntun`, metric 0
- `Find-NetRoute -RemoteIPAddress 110.242.68.66` **KHÔNG** trả `flowvpntun` (bypass TQ đúng)
- `Resolve-DnsName www.youtube.com` ra IP Google thật, **không** phải `69.171.235.22`
- `https://api.ipify.org` = `165.101.114.162`; google + baidu HTTP 200

Nếu `TUNFAIL` xuất hiện: lý do nằm ngay sau marker. Nếu TUN lên mà **không** chở được dữ
liệu, cổng sức khoẻ ở §2 sẽ tự rơi về WireGuard (khách vẫn có mạng) — khi đó đọc
`%APPDATA%\VPNFlow\vpnflow.log`.

### 5.3 Rủi ro đã biết

1. **7.509 dải bị trừ khỏi `0.0.0.0/0`** ⇒ Windows có thể nhận ~7.510 route trên adapter TUN
   (đường WireGuard đã làm đúng như vậy nên không phải cơ chế mới). Chưa đo thời gian dựng
   TUN với danh sách đầy đủ trên máy thật.
2. **Thứ tự `Auto`**: đường relay vẫn thử TRƯỚC WireGuard (giữ nguyên hành vi cũ). Trước đây
   máy bật SAC "may mắn" rơi về WireGuard; nay relay lên được nên **mọi máy bật SAC sẽ đi
   relay**. Nếu đo thấy relay chậm hơn UDP trực tiếp đáng kể thì phải đổi thứ tự — đây là
   quyết định sản phẩm, **chưa đổi** trong bản này.
3. Bản phát hành vẫn **CHƯA KÝ** (luật 11) — chưa có chứng chỉ trên máy này; yêu cầu đã gửi
   harness Mac (agent-bus `#298`). Bản này **không** làm tệ hơn: `sing-box.exe` bị SAC chặn,
   còn `flowvpnrelay.exe` thì không.
4. `darwin/arm64` cũng đã build lại (`0d364e68…`) nhưng **app macOS dùng bản của Mac harness** —
   bản Windows không đóng gói binary macOS.

## 6. Việc của publisher (harness Windows)

1. `dotnet test` phải xanh (223/223) và `verify-relay.ps1 -ConfigOnly` phải ĐẠT trước khi đóng gói.
2. Đóng gói: `powershell -ExecutionPolicy Bypass -File windows\installer\build.ps1 -Version 1.4.7 -Commit <sha>`
   → `windows\installer\out\VPNFlow-Setup-1.4.7.exe`.
3. **Luật 11**: bộ cài Windows **phải được ký số** trước khi phát. Chưa có chứng chỉ ⇒ cần
   chủ dự án ghi ngoại lệ như 1.4.5 **hoặc** chờ chứng chỉ.
4. Sau khi phát: cập nhật `/v1/app-version?platform=windows` và link `/buy` (`?v=<8 ký tự sha256>`),
   ghi một dòng vào `docs/PUBLISHER_PROCESS.md`, tag `windows-v1.4.7`.
5. Kích thước bộ cài sẽ **nhỏ đi rất nhiều** (bỏ 59 MB `sing-box.exe`, thêm ~2,4 MB relay mới).
