# HANDOFF — Windows 1.4.8: bỏ hẳn `sing-box.exe`, đưa TUN vào chính `flowvpnrelay.exe`

- **Ngày:** 13/10/2026 (kiểm máy thật 19/10/2026) · **Máy:** DESKTOP-852P1LT (mạng TQ)
- **Loại:** fix lỗi khách + bỏ phụ thuộc binary bên thứ ba
- **Phạm vi:** Windows (app .NET, installer, assets) + `tools/hysteria-relay`

> **Vì sao 1.4.8 mà không phải 1.4.7:** Windows **1.4.7 đã phát 24/09/2026** (bản vá "thử lại API
> 3 vòng", sha256 `73660031…`, đang là `latest_version` của `/v1/app-version?platform=windows`).
> Bản này là bản kế tiếp nên mang số **1.4.8** — dùng lại 1.4.7 sẽ làm sai phép so sánh phiên bản
> và đường tự cập nhật của khách.

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
| `windows/.../PrivateVPNWindows.App.csproj` | bỏ `sing-box.exe`; `Version` 1.4.4 → **1.4.8** |
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

### 5.2 Nghiệm thu TUN THẬT (đã chạy có quyền admin, 19/10/2026)

Máy harness, mạng TQ, relay `vn2hy` thật, danh sách bypass đầy đủ **7.509 dải**
(5.494 IPv4 + 2.015 IPv6). Chạy `.tmp\tun-e2e-b.ps1` dưới UAC:

```
TUNREADY=True sau 4.1s (TUNFAIL=)
  [DAT] TUN dung duoc (TUNREADY) chi voi 7509 dai loai tru
  [DAT] adapter flowvpntun ton tai — status=Up ifIndex=39
  [DAT] dia chi TUN = 100.100.100.101
  [DAT] co route tren adapter TUN — so route: 23975
  [DAT] co route phu nua DUOI 0.0.0.0/1 (38 route)
  [DAT] 110.242.68.66    di thang (qua Wi-Fi)      [DAT] 8.8.8.8        vao TUN
  [DAT] 223.5.5.5        di thang (qua Wi-Fi)      [DAT] 1.1.1.1        vao TUN
  [DAT] 114.114.114.114  di thang (qua Wi-Fi)      [DAT] 142.251.154.4  vao TUN
  [DAT] 1.0.1.0          di thang (qua Wi-Fi)
  [DAT] 180.101.50.242   di thang (qua Wi-Fi)
  [DAT] www.youtube.com -> 142.251.152.4, 142.251.154.4, … (IP that, khong bi nhiem doc)
  [DAT] exit IP = 165.101.114.162 (dung IP node)
      https://www.google.com  HTTP 200  1379 ms
      https://www.baidu.com   HTTP 200  26217 ms   <-- XEM 5.4
      https://weixin.qq.com   HTTP 200  471 ms
      https://api.meetflowai.site/v1/health  HTTP 200  658 ms
  [DAT] adapter flowvpntun da mat sau khi kill (may van co mang)
KET LUAN: DAT — tat ca phep kiem PASS
```

⇒ TUN + auto-route + bypass TQ + DNS-qua-tunnel + egress **đều chạy thật**. Đây là bằng chứng
mà trước đó chưa có.

### 5.3 Rủi ro / quan sát từ lần chạy thật

1. **23.975 route** trên adapter TUN (do trừ 7.509 dải khỏi `0.0.0.0/0`). Dựng TUN hết **4,1 s**
   (kể cả 2,5 s bắt tay WS) — chấp nhận được; đường WireGuard cũng thêm ~7.500 route. Đổi lại
   `Get-NetRoute` liệt kê chậm (~8 s) — chỉ ảnh hưởng chẩn đoán, không ảnh hưởng đường truyền.
2. **`https://www.baidu.com` 26.217 ms** — xem 5.4: đây là lý do phải thêm bộ chia DNS.
3. **Thứ tự `Auto`**: đường relay vẫn thử TRƯỚC WireGuard (giữ nguyên hành vi cũ). Trước đây máy
   bật SAC "may mắn" rơi về WireGuard; nay relay lên được nên mọi máy bật SAC sẽ đi relay. Nếu đo
   thấy relay chậm hơn UDP trực tiếp đáng kể thì phải đổi thứ tự — quyết định sản phẩm, **chưa đổi**.
4. Bản phát hành vẫn **CHƯA KÝ** (luật 11) — chưa có chứng chỉ trên máy này; yêu cầu đã gửi harness
   Mac (agent-bus `#298`). Bản này **không** làm tệ hơn: `sing-box.exe` bị SAC chặn còn
   `flowvpnrelay.exe` thì không.
5. `darwin/arm64` cũng build lại nhưng **app macOS dùng bản của Mac harness**.

### 5.4 Bộ chia DNS trong `flowvpnrelay.exe` (thêm trong bản này, CÙNG ngày)

Lần chạy thật ở §5.2 lộ ra một hồi quy so với 1.4.6: bản 1.4.6 dùng **rule theo tên miền** của
sing-box nên tên miền TQ được phân giải bằng resolver nội địa. Hysteria TUN không có engine rule,
nên bản đầu của 1.4.8 đặt thẳng `1.1.1.1` lên adapter ⇒ **tên miền TQ nhận IP CDN nước ngoài**,
không khớp dải TQ ⇒ bị đẩy vào tunnel.

Đo được (mạng TQ, 19/10/2026):

| Tên miền | qua `1.1.1.1` | trong dải TQ? | Hệ quả |
|---|---|---|---|
| `www.baidu.com` | `103.235.47.188` (Baidu HK) | ✗ | vào tunnel — **26.217 ms** vs 116 ms đi thẳng |
| `www.taobao.com` | `43.109.163.153` | ✗ | vào tunnel |
| `www.qq.com` | `129.226.102.190` | ✗ | vào tunnel |

⇒ **15/23 tên miền TQ lớn** bị vậy (baidu, taobao, jd, qq, alipay, 163, ctrip, meituan,
xiaohongshu, zhihu, aliyun, huawei, iqiyi, youku, pinduoduo). Đồng thời **không thể** dùng resolver
nội địa cho tất cả: `223.5.5.5` / `114.114.114.114` / `119.29.29.29` đều trả **kết quả nhiễm độc**
cho `www.google.com` (`185.45.5.35`) và `www.youtube.com` (`104.244.42.197`).

**Cách xử lý:** `flowvpnrelay.exe` mở bộ chia DNS tại chính địa chỉ TUN; app đặt DNS của adapter TUN
về địa chỉ đó (`100.100.100.101`). Mỗi truy vấn:

1. nếu qname khớp danh sách `cnSuffixes` (23 mục: Tencent/WeChat + `cn`) → hỏi resolver **nội địa**
   cho MỌI loại bản ghi;
2. nếu qtype là A/AAAA → hỏi resolver **nội địa** trước, chỉ nhận khi **mọi** bản ghi A/AAAA trả về
   nằm trong dải TQ (khi đó route đi-thẳng mới khớp); không đạt thì hỏi resolver **công cộng qua
   tunnel**;
3. loại bản ghi khác → resolver công cộng qua tunnel.

Nhờ vậy **không cần danh sách tên miền nào để bảo trì** cho nhóm (2), mà tên miền TQ vẫn nhận IP TQ.

### 5.5 Bộ chia DNS — đã kiểm tới đâu

**Đã kiểm THẬT** (chạy binary trên cổng loopback `127.0.0.1:53`, `Resolve-DnsName -Server 127.0.0.1`):

```
[flowvpnrelay] dns: splitter 127.0.0.1:53 cn=223.5.5.5:53 remote=1.1.1.1:53 cnSuffixes=4 cnRanges=0
www.baidu.com      -> 183.2.172.177
www.taobao.com     -> 183.3.204.52, 183.3.204.53
qq.com             -> 123.150.76.218, 113.108.81.189
www.google.com     -> 142.251.155.119, 142.251.150.119, …        (KHONG phai 31.13.92.37 / 185.45.5.35)
www.youtube.com    -> 142.251.150.4, 142.251.156.4, …            (KHONG phai 104.244.42.197 / 174.132.167.252)
```
Đối chứng hai upstream cho thấy bộ chia **loại** đáp án nhiễm độc (223.5.5.5 trả `31.13.92.37` cho
google) và **chỉ nhận** đáp án nằm trong `cn.txt`; tách bạch 3 quy tắc đã được chứng minh bằng một
instance có `remote` chết (MX `qq.com` vẫn NOERROR; TXT ngoài danh sách và google đều SERVFAIL).
TCP (khung 2 byte) cũng chạy; `DNSFAIL` in đúng khi cổng bận.

**CHƯA kiểm trên máy thật:** cặp "TUN + bộ chia DNS nghe ở `100.100.100.101:53`" (nhánh bind SAU
khi adapter được gán địa chỉ) và hiệu quả `www.baidu.com` 26.217 ms → ~116 ms. Lần chạy admin cuối
cùng còn thiếu — lệnh:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File windows\installer\verify-relay.ps1 -Password <HY_PASSWORD> -Obfs <HY_OBFS>
```
Kỳ vọng mục 8b: `www.baidu.com` và `www.taobao.com` ra IP TQ **và** `Find-NetRoute` KHÔNG trỏ vào
`flowvpntun`. (`TUNREADY`/route/bypass/DNS-qua-tunnel đã ĐẠT ở §5.2 với binary trước khi thêm bộ chia.)

### 5.6 Đã sửa trong lần rà cuối

1. `DNSFAIL` nay được app hiểu (`HysteriaRelayDefaults.DnsFailMarker`): TUN lên mà bộ chia DNS không
   bind được thì app rơi đường khác NGAY thay vì chờ hết `ReadyTimeoutSeconds`.
2. Bộ chia DNS bị **đóng khi TUN chết**: socket đang bind vào địa chỉ của TUN, địa chỉ đó biến mất
   khi TUN chết — giữ lại thì vòng sau bộ chia "tưởng" đã sẵn sàng nhưng socket không nhận gói nữa
   (DNS câm). TUN chết là lúc duy nhất nó bị đóng nên không tạo khoảng trống trong phiên đang chạy.
3. Quy tắc 1 (tên miền TQ) khi resolver nội địa **không trả lời** thì rơi về resolver công cộng thay
   vì trả SERVFAIL: chậm còn hơn hỏng (WeChat/thanh toán TQ chết hẳn trong khi mạng vẫn còn).

## 6. Việc của publisher (harness Windows)

1. `dotnet test` phải xanh (**225/225**) và `verify-relay.ps1 -ConfigOnly` phải ĐẠT (**18/18**).
2. Đóng gói: `powershell -ExecutionPolicy Bypass -File windows\installer\build.ps1 -Version 1.4.8 -Commit <sha>`
   → `windows\installer\out\VPNFlow-Setup-1.4.8.exe`.
3. **Luật 11**: bộ cài Windows **phải được ký số** trước khi phát. Chưa có chứng chỉ ⇒ cần
   chủ dự án ghi ngoại lệ như 1.4.5 **hoặc** chờ chứng chỉ.
4. Sau khi phát: cập nhật `/v1/app-version?platform=windows` và link `/buy` (`?v=<8 ký tự sha256>`),
   ghi một dòng vào `docs/PUBLISHER_PROCESS.md`, tag `windows-v1.4.8`.
5. Bộ cài **nhỏ đi ~14 MB** (bỏ 59 MB `sing-box.exe`, thêm ~2,4 MB relay mới).

---

## 7. Artifact đã dựng sẵn (chờ chủ dự án test + publisher phát)

| File | Kích thước | sha256 |
|---|---|---|
| `windows\installer\out\VPNFlow-Setup-1.4.8.exe` | 38.676.163 B | `18db6ee87deb6c16ad91aed5b8c199f1fed4ef75b7eb2f8c54eb3cc82dcc2f9a` |
| `VPNFlow-1.4.8-portable-win64.zip` | 52.663.633 B | `144ab00f19061ed178db06375dc89d13067acc81c3b59f80a27cc74b8168bf95` |

Bản sao để chủ dự án cài thử: `C:\Users\Minhn\Desktop\VPNFlow-1.4.8\`.
Bộ publish **không còn** `sing-box.exe`; lowvpnrelay.exe = 12.788.736 B ·
`ce6fd67c7407979bb8db4dd0acc809ceef77f21b5336076d2053d322ba3c974e`.
Bộ cài **chưa ký** (luật 11 vẫn cần ngoại lệ hoặc chứng chỉ).
