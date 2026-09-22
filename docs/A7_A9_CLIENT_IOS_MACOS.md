# A7 + A9-client cho iOS/macOS — chốt cơ chế & bàn giao (22/09/2026)

> Trả lời task `T-20260922-10` / bus #143 (`A9-SERVER XONG: hop dong /v1/route-report (50ccf55)
> + PHAT HIEN A7 can chot co che`). Nguồn yêu cầu: `docs/YEU_CAU_TOC_DO_ON_DINH.md` §2d/§2f + A7/A9;
> kế hoạch: `docs/DEV_PLAN_IOS_MACOS_TOC_DO.md` §0b/§5b. Hợp đồng server:
> `control-plane/src/route-report.js` (commit `50ccf55`).

## 1. A7 — CHỐT CƠ CHẾ: chia theo ĐÍCH ĐẾN bằng dải IP TQ (`excludedRoutes`), KHÔNG dùng ACL hysteria2

### 1.1 Xác nhận core đã tích hợp (câu hỏi của yêu cầu §2d)

| Câu hỏi | Kết quả kiểm bằng code | Kết luận |
|---|---|---|
| Extension iOS/macOS dùng core nào? | `tools/hysteria-apple/build.sh` clone `apernet/hysteria` tag **`app/v2.12.2`**, `gomobile bind` với `tools/hysteria-android/mobile.go` ⇒ module `Hysteria` | **hysteria2 Go core** (không phải sing-box) |
| Có sing-box/libbox không? | `docs/SINGBOX_INTEGRATION_PLAN.md` §7.1: DRAFT, **chặn ở quyết định license**, "chưa có dòng code nào được sửa". Không có `Libbox.xcframework`/`libbox.aar` cho iOS | **KHÔNG có** |
| hysteria2 có ACL geoip/geosite không? | CÓ: `hysteria/extras/outbounds/acl/` (`matchers_v2geo.go`, `compile.go`) | Có, **nhưng…** |
| ACL đó có chạy trong framework nhúng không? | ACL chỉ nằm ở tầng app/proxy: `hysteria/app/cmd/server.go:1336-1361` dựng `outbounds.NewACLEngineFrom*`. Còn `mobile.go` (`:195` `client.NewClient`, `:252-260` `tun.Server{HyClient: c}`) đưa **thẳng `client.Client`** cho `tun.Server`; `tun.Server` (`app/internal/tun/server.go:20-40`) **không có field ACL nào** | **KHÔNG chạy** |

⇒ Muốn dùng ACL/geoip/geosite của hysteria2 phải sửa core Go + nhúng geo data + dựng lại
xcframework (việc lớn, không thuộc lượt này). Vì vậy chọn đường **không cần core**:

### 1.2 Cơ chế đã chốt (đã cài)

Chia theo **ĐÍCH ĐẾN** ở tầng utun: đưa danh sách dải IP Trung Quốc vào `excludedRoutes` của
`NEIPv4Settings` ⇒ gói tới IP TQ đi thẳng qua đường vật lý, **không vào tunnel** (byte tunnel không
tăng). Đây đúng là việc `cn-apps.txt` đã ghi sẵn cho iOS/Windows:

> "iOS/Windows không có API VPN theo từng app — hai nền tảng đó dùng danh sách IP Trung Quốc
> (`/dl/routes/cn.txt`) để đi thẳng, không qua tunnel."
> — `control-plane/assets/routes/cn-apps.txt`

và cùng nguyên tắc Windows 1.0.5 (`59c447c`: "Bypass Trung Quốc: 5.494 dải IP TQ đi thẳng") —
`.privatevpn/reports/2026-09-18-windows-1.0.5-handoff.md` §2/§3.

| Hạng mục | Cài đặt |
|---|---|
| Nguồn danh sách | `https://meetflowai.site/dl/routes/cn.txt` (sinh từ APNIC, hôm nay **5.494 dòng**; `scripts/upload-route-lists.sh`) |
| Parse/lọc | `iOS/PrivateVPNPacketTunnel/ChinaRouteBypass.swift` — bỏ comment/dòng trống, chuẩn hoá `network/prefix`, bỏ trùng, **loại `0.0.0.0/0`** (sẽ bỏ luôn cả tunnel), trần 8.000 dải |
| Áp vào tunnel | `HysteriaPacketTunnelProvider.networkSettings` (`#if os(iOS)`) nối dải TQ vào `ipv4.excludedRoutes` (đứng cạnh LAN/link-local sẵn có) |
| Không chặn connect | `startChinaBypass()` chạy **SAU `completeStart`**: (1) nạp bản nhớ trong `UserDefaults`, (2) tải bản mới ở nền, (3) chỉ `applySettings` lại khi số dải đổi. Đúng bài học Windows 1.0.4 "connecting mãi" khi thêm 5.494 route đồng bộ lúc connect |
| Giới hạn đã biết | iOS chỉ chia được theo **IP** (geoip). Không có engine domain nên `geosite:cn` (miền TQ trỏ IP ngoài TQ) **không** xử lý được ở lượt này — ghi rõ để không kỳ vọng sai. macOS CHƯA bật (`#if os(iOS)`) vì `HysteriaPacketTunnelProvider.swift:817` đã đo `excludedRoutes` làm lệch route trên macOS; làm riêng ở giai đoạn 2 (`DEV_PLAN` §5b) |
| Chưa làm được ở máy này | Chưa test trên iPhone thật (cần máy + profile đang vướng `T-20260922-04`): tiêu chí A7 "WeChat/Alipay đăng nhập + byte tunnel không tăng" chờ máy thật |

## 2. A9-client — đã viết module theo hợp đồng `POST /v1/route-report`

`iOS/PrivateVPNPacketTunnel/RouteReporter.swift` (thuần logic + gọi mạng):

| Hợp đồng server (`route-report.js`) | Client |
|---|---|
| `platform/app_version/device_id/credential` | `RouteReporter.Report` |
| `network{type,identity_hash,raw_kbps}` | `Network`; `identityHash()` = **sha256 hex** (CryptoKit) — chỉ gửi băm, không gửi SSID/IP/carrier thô (luật riêng tư §2f.3) |
| `current{transport,node,port,goodput_kbps,stable_kbps,rtt_ms,reconnects}` | `Current` |
| `candidates[≤6]{transport,port,node,connect_ms,rtt_ms,result}` | `Candidate`; `body()` tự cắt còn 6 |
| `→ {recommended{...},ttl_s}` / `{recommended:null}` | `decode()`; `recommended` thiếu/sai ⇒ coi như `null` |
| Chỉ đổi khi `recommended` khác đường đang dùng + `ttl_s` còn hạn | `shouldApply(_,current:receivedAt:now:)` |
| Nhịp ≤1 lần/5 phút/thiết bị | `Pacer` (300 s) |
| Chờ server ≤2000 ms, timeout/lỗi ⇒ app tự quyết | `decideTimeout = 2`; `post()` trả `nil` mọi nhánh lỗi, **không throw, không chặn tunnel** |

### Việc còn lại để A9-client chạy thật (chưa thuộc lượt này)

1. **Bơm `device_id` + `credential`**: app (`VPNManager.hysteriaConfiguration`) phải thêm 2 khoá vào
   `providerConfiguration` (credential = `peer_credential` của `/v1/peers/heartbeat`), extension đọc
   trong `hysteriaOptions()`. Hiện `providerConfiguration["hysteria"]` chưa có 2 khoá này.
2. **Chọn thời điểm báo**: theo A9 §2f.4 — sau STABLE, sau mỗi lần kênh dò kết thúc, khi suy giảm.
   Máy trạng thái START/RAMP/STABLE/PROBE/DEGRADED là việc `DEV_PLAN` §5b bước 2 (chưa có), nên
   chưa có chỗ gọi tự nhiên.
3. **Áp `recommended`**: dùng lại đúng cơ chế handoff §2c (`TransportLadder` + `GoodputMeter`), kèm
   "quay lại đường cũ 1 lần nếu đường mới không lên được".

## 3. Bằng chứng đã chạy

```bash
# Parse/chuẩn hoá A7 + toàn bộ logic A9 (thuần logic, không cần Xcode):
bash scripts/ios-pure-logic-tests/run.sh
#  -> KẾT QUẢ: 90/90 PASS, 0 FAIL   (trước đó 54/54; +36 check cho A7/A9)

# Cú pháp 5 file Swift đã đổi/viết:
swiftc -parse iOS/PrivateVPNPacketTunnel/HysteriaPacketTunnelProvider.swift   # OK
swiftc -parse iOS/PrivateVPNPacketTunnel/ChinaRouteBypass.swift              # OK
swiftc -parse iOS/PrivateVPNPacketTunnel/RouteReporter.swift                 # OK
swiftc -parse iOS/PrivateVPNTests/ChinaRouteBypassTests.swift                # OK
swiftc -parse iOS/PrivateVPNTests/RouteReporterTests.swift                   # OK

# Core A7 (đọc từ source hysteria đã clone):
grep -rn "\bacl\b" app/cmd/server.go            # ACL chỉ ở tầng app/proxy
sed -n '20,31p' app/internal/tun/server.go      # tun.Server KHÔNG có field ACL
wc -l <(curl -s https://meetflowai.site/dl/routes/cn.txt)   # 5494 dải IP TQ
```

## 4. Giới hạn / việc còn lại

- **A7**: chờ máy thật (A7 chưa nghiệm thu được vì profile/Keychain đang vướng `T-20260922-04`);
  `geosite:cn` chỉ xử lý được nếu sau này có engine domain (sing-box) — hiện chỉ `geoip:cn`.
- **A9-client**: chưa nối vào app/extension cho tới khi có (1) `device_id`/`credential` trong
  `providerConfiguration` và (2) máy trạng thái ở `DEV_PLAN` §5b bước 2.
- **macOS**: A7 chưa bật (chờ giai đoạn 2, cần cách vòng tunnel khác vì `excludedRoutes` đã gây lệch
  route — `HysteriaPacketTunnelProvider.swift:817`).

## 5. Follow-up bus #146 + commit `92f60c9` (WIN, 22/09): bundle sẵn; IPv6 đã làm rồi REVERT (bus #175)

### 5.1 Đã làm: bundle `cn.txt` + `cn6.txt` làm bản dự phòng

`ChinaRouteBypass.cached()` / `cachedIPv6()` nay theo thứ tự: **bản nhớ (`UserDefaults`)** →
**bản bundle sẵn** (tài nguyên `cn.txt` + `cn6.txt`, chép vào bundle của extension iOS/macOS + test
target trong `project.yml`). Nhờ vậy lần đầu chạy/mạng yếu/DNS bị chặn mà tải thất bại thì A7 **vẫn
có tác dụng** (app TQ không bị đẩy qua VPN). Bản mới vẫn được tải ở LUỒNG NỀN rồi ghi đè bản nhớ.

### 5.2 IPv6: ĐÃ REVERT (bus #175) — `ipv6Settings ::/0` làm iPhone mất mạng khi connect

Bản `18f8c82` đặt `settings.ipv6Settings` (`includedRoutes = [::/0]`, `excludedRoutes = cn6.txt`) để
"IPv6 TQ đi thẳng, IPv6 còn lại CHẶN", với giả định server không có IPv6. **Giả định đó SAI**: relay
`api.meetflowai.site` **CÓ bản ghi AAAA** ⇒ iOS ưu tiên IPv6 ⇒ gói tới relay bị hút vào tunnel (mà
tunnel/server không có IPv6 để đi ra) ⇒ **đen ⇒ mất mạng ngay khi connect** trên iPhone thật (bus
#175). Chủ dự án chốt 22/09: **bỏ phần ĐỊNH TUYẾN IPv6 của A7** — xem
`docs/DEV_PLAN_IOS_MACOS_TOC_DO.md` §5b bước 1c.

Đã revert ở commit `479a6d7` (origin/main):

| | Sau revert |
|---|---|
| Provider | Bỏ `chinaExcludedRoutesV6`, lời gọi `ChinaRouteBypass.refreshIPv6`, phần IPv6 của `applyChinaRoutes`, và khối `settings.ipv6Settings` ⇒ **IPv6 đi thẳng như trước, không chặn kết nối** |
| Giữ nguyên | A7 **IPv4** (`excludedRoutes` = `cn.txt`) — vẫn là cơ chế "app TQ đi thẳng" đang dùng |
| Còn lại (chưa dùng) | `ChinaRouteBypass.parseIPv6/cachedIPv6/excludedRoutesV6` + bundle `cn6.txt` — thuần logic, đã có test, để lần bịt rò sau dùng lại |
| Bằng chứng | `bash scripts/ios-pure-logic-tests/run.sh` → 94/94 PASS; `swiftc -parse` provider → OK |

**Hướng đúng cho lần bịt rò sau (chưa làm):** loại trừ **đúng địa chỉ relay/endpoint** khỏi tunnel
(kiểu WireGuard `endpointExcludedRoutes`: /32 IPv4 + /128 IPv6 của endpoint đã resolve) rồi mới được
đặt `::/0`; **không** đặt `::/0` khi chưa loại trừ AAAA của relay.

**macOS:** vẫn để nguyên (không bật `excludedRoutes`) như trước — đo cũ cho thấy `excludedRoutes`
làm lệch route trên macOS (`HysteriaPacketTunnelProvider.swift:817`); bật ở giai đoạn 2 kèm test máy thật.
