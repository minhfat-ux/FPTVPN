# Agent Handoff

- **Agent:** main
- **Task ID:** TASK-20260913-001
- **Date:** 2026-09-13
- **Status:** needs_review

## Summary

Tiếp nhận `docs/HANDOVER_2026-09-13_china_ip_block_and_funnel.md` và làm xong cả 5 hạng mục,
12 commit (`7ab38d7`..`5b911bf`). Dọn WIP dashboard còn treo trong cây (control-plane + iOS
relay) thành 3 commit sạch để diff Tầng 1 không bị lẫn. Tầng 1 trên Android: sửa **gốc** lỗi
"connected nhưng không có mạng" — `WSRelayBridge` mất kết nối thì báo chết về service để
`Mobile.stop()` làm `serve()` trả về và `runTunnel()` dựng lại transport, cộng watchdog dựa
trên gói thật, cộng trần thời gian bắt tay và đổi thứ tự thử đường; đường WS relay được khai
brutal CC riêng. iOS: bù phần còn thiếu — API dự phòng qua Tailscale Funnel và WS bridge cổng
10000 cho WireGuard, có review phát hiện và sửa một lỗ hổng thật ở `NodeHealthReporter`. Tầng 2:
viết `docs/SINGBOX_INTEGRATION_PLAN.md` và tự kiểm chứng lại các claim chịu lực — kết luận quan
trọng nhất là **giấy phép GPL-3.0 của sing-box là blocker với App Store**, phải do owner quyết
trước khi viết dòng code nào.

## Files Changed

| Path | Change Summary |
|---|---|
| `android/.../vpn/WSRelayBridge.kt` | Thêm callback `onDead`, gọi từ `onFailure`/`onClosed`/`onClosing`; gác `running` + `opened`; chỉ báo một lần |
| `android/.../vpn/HysteriaVpnService.kt` | `onDead` → `Mobile.stop()`; watchdog từ `probeThroughTunnel()` trả `Boolean`; `armAttemptBudget()`; đổi thứ tự thử transport; brutal CC riêng cho đường relay; `TCP_CONNECT_TIMEOUT_MS` 2500→1200 |
| `android/.../Config.kt` | Thêm `HY_RELAY_UP_KBPS=800` / `HY_RELAY_DOWN_KBPS=4000` |
| `control-plane/src/{admin-page,wireguard,connection-stats}.js` | (WIP có sẵn của phiên trước) dashboard live connections + sửa `wg` đọc qua `ssh_target` |
| `control-plane/test/{connection-stats,wireguard-remote}.test.js` | Test cho hai phần trên |
| `iOS/PrivateVPN/Services/ControlAPIClient.swift` | `ControlAPIHosts.fallbackBaseURLs`, `sendWithFallback`, `URLRequest.rewritten(to:)`; định tuyến mọi chỗ gọi |
| `iOS/PrivateVPNPacketTunnel/WSRelayClient.swift` | **MỚI** — UDP↔WS bridge tới `wss://fcnvpn.tail303be3.ts.net:10000` |
| `iOS/PrivateVPNPacketTunnel/PacketTunnelProvider.swift` | Chuỗi TCP relay → WS relay → UDP trực tiếp, một chiều; health report đọc transport đang hoạt động |
| `iOS/PrivateVPNPacketTunnel/NodeHealthReporter.swift` | Dùng chung danh sách host dự phòng (lỗ hổng do review phát hiện) |
| `iOS/PrivateVPNTests/ControlAPIClientTests.swift` | +3 test cho cơ chế dự phòng |
| `docs/SINGBOX_INTEGRATION_PLAN.md` | **MỚI** — kế hoạch Tầng 2, 713 dòng, §1–§10 + 2 phụ lục |
| `docs/HANDOVER_2026-09-13_...md` | Cập nhật trạng thái Tầng 1 (mục 1,2,3,5 ✅ / mục 4 ❌) kèm lý do chỗ làm khác |
| `.privatevpn/memory/DECISIONS.md` | Ghi quyết định Tầng 1 |
| `evidence/2026-09-13-tier1-android-tunnel-recovery.log` | Bằng chứng Tầng 1 (build + trace code + bẫy đo APK) |
| `evidence/2026-09-13-ios-api-fallback-and-ws-relay.log` | Bằng chứng iOS (build + test + byte-search artifact) |
| `evidence/2026-09-13-dashboard-live-connections.log` | Bằng chứng dashboard (WIP phiên trước, nay đã commit) |
| `.gitignore` | Bỏ qua `.dd-ios-ipad/` |

## Decisions Made

| Decision | Reason | Persisted In |
|---|---|---|
| Sửa lỗi "connected nhưng không có mạng" ở tầng bridge (callback `onDead`) chứ không ở tầng service | Chỉ bridge biết chắc cầu đã từng mở rồi mới chết; service không phân biệt được "chưa từng lên" với "vừa chết" | `DECISIONS.md`, comment trong `WSRelayBridge.kt` |
| Watchdog đo gói thật qua tunnel, không đo "WS im lặng" | Đo độ im sẽ dương tính giả khi tunnel khoẻ mà người dùng không tải gì; đo gói thật bao được cả đường TCP relay/UDP | `DECISIONS.md`, `HysteriaVpnService.kt` |
| Chấp nhận watchdog phản ứng ~30–60s thay vì ~10s như handover | Cần 2 vòng probe liên tiếp để không dựng lại tunnel chỉ vì mạng mất gói một cú. **Deviation có chủ ý, đã ghi rõ trong handover** | `HANDOVER_...md` mục 4, comment `DEAD_PROBE_LIMIT` |
| KHÔNG đưa WS relay lên đầu danh sách thử | Người không bị chặn sẽ bị bắt đi vòng qua Tailscale/Cloudflare oan trong khi đường trực tiếp đang <1s; chọn nhánh "hạ timeout" mà handover cho phép | `HANDOVER_...md` mục 4 |
| Trần bắt tay tự vô hiệu theo token, không đọc cờ `DiagnosticsLog.tunnelUp` | Cờ đó chỉ được dọn ở `reportReconnecting()`/`onDestroy()`, có thể còn giá trị cũ và làm timer không bao giờ nổ | `HysteriaVpnService.kt` |
| iOS: chỉ thử host dự phòng khi lỗi transport, không khi có HTTP response | POST trùng sẽ nhân đôi tác dụng phụ (đăng ký thiết bị, gửi mã email) | `ControlAPIClient.swift`, test |
| iOS: giữ chuỗi transport một chiều, mỗi bước 8s | Giữ đúng tính chất chống flapping của `scheduleDirectFallback` có sẵn | `PacketTunnelProvider.swift` |
| Ghi bẫy đo vào file bằng chứng | `grep` trên APK ra 0 cho mọi chuỗi tiếng Việt kể cả chuỗi có từ trước → dễ kết luận sai là "mã không vào artifact" | 2 file `evidence/` |

## Evidence

| Evidence ID | Verification Level | Result |
|---|---|---|
| EVID-20260913-001 | test_checked | `node --test` control-plane: **62 pass / 0 fail** |
| EVID-20260913-002 | build_checked | `:app:compileModernReleaseKotlin` + `:app:assembleModernRelease` (gồm R8 + lintVital): BUILD SUCCESSFUL |
| EVID-20260913-003 | build_checked | Byte-search `classes.dex` trong APK: đủ mọi chuỗi log của Tầng 1 (`ws-relay: cầu WS chết`=1, `dừng client để dựng lại transport`=2, `lần liên tiếp không có gói nào qua`=1, `hy-attempt-budget`=1, `hết hạn bắt tay`=1) |
| EVID-20260913-004 | build_checked | iOS: `xcodegen generate` + `xcodebuild -destination 'generic/platform=iOS'`: **BUILD SUCCEEDED** (exit 0) |
| EVID-20260913-005 | test_checked | iOS: đọc thẳng `.xcresult`: **result=Passed, 43 passed, 0 failed, 0 skipped** (CI-iPhone17-iOS26.5); test func 9→12 |
| EVID-20260913-006 | build_checked | Byte-search `PrivateVPNPacketTunnel.debug.dylib`: `wss://fcnvpn.tail303be3.ts.net:10000`=1, `ws-relay`=11, `health:`=3, `ControlAPIHosts`=13 |
| EVID-20260913-007 | static_review | Ví dụ config §5.1 của plan validate **0 lỗi** bằng JSON Schema chính thức sing-box v1.14.0 (`jsonschema` Draft 2020-12), do tôi tự chạy lại; không lọt secret |
| EVID-20260913-008 | static_review | GitHub API `releases/latest`: tag **v1.14.0**, 167 asset, **0** asset khớp `libbox\|aar\|xcframework`; kích thước 34.87 / 121.11 / 28.07 MB khớp đúng bảng §7.2 |
| EVID-20260913-009 | static_review | `docs/configuration/shared/tls.md`: uTLS đúng nguyên văn `Not Recommended` … `unsuitable for censorship circumvention` |
| EVID-20260913-010 | e2e_not_run | **Chưa test trên thiết bị Android thật** — `adb devices` rỗng suốt phiên |
| EVID-20260913-011 | e2e_not_run | **Chưa test trên thiết bị iOS thật** — không có thiết bị; toàn bộ đường dữ liệu chưa được chứng minh |

## Validation Performed

```text
$ cd control-plane && node --test
ℹ tests 62 | ℹ pass 62 | ℹ fail 0

$ cd android && JAVA_HOME=~/jdk/jdk-17.0.20.1+1/Contents/Home ./gradlew :app:assembleModernRelease
BUILD SUCCESSFUL in 46s   (52 actionable tasks)

$ xcodegen generate && xcodebuild -scheme PrivateVPN -destination 'generic/platform=iOS' \
    -derivedDataPath .dd-ios-ipad build
** BUILD SUCCEEDED **   (exit=0)

$ xcodebuild test -scheme PrivateVPN -destination 'platform=iOS Simulator,name=CI-iPhone17-iOS26.5'
result=Passed  passed=43  failed=0  skipped=0
```

Result:

```text
Cả 4 lệnh đều pass. Không có bước nào fail cần xử lý.
Hai lần "0 kết quả" khi tìm chuỗi trong artifact (APK Android, .appex iOS) đều là
LỖI CỦA PHÉP ĐO, không phải mã thiếu — đã đổi sang tìm theo byte và ghi lại bẫy.
```

## Validation Not Performed

| Check | Reason |
|---|---|
| E2E Tầng 1 trên máy Android thật (cầu WS chết → tự dựng lại; watchdog; thời gian tới WS) | `adb devices` rỗng suốt phiên — không có thiết bị nào kết nối. Theo `docs/DEVELOPMENT.md` §5 (RULE-TEST-002: "Real E2E mandatory for final acceptance; mocks do not count") nên Tầng 1 **chưa được coi là accepted**. 3 phép đo đã ghi sẵn ở mục 3 file bằng chứng Android |
| E2E iOS trên iPad thật (Funnel :10000 nhận WS; 1 message = 1 datagram; WireGuard đổi endpoint bắt tay xong; đo băng thông/độ trễ) | Không có thiết bị iOS. `WSRelayClient` cũng **không có unit test** vì file không thuộc target test và `project.yml` ngoài brief |
| Đo `ATTEMPT_UP_BUDGET_MS=4s` và `HY_RELAY_*_KBPS` trên mạng TQ thật | Số chọn theo lý thuyết; cần mạng bị chặn thật để chỉnh. Đã ghi rõ là "mức khởi điểm bảo thủ" trong code và handover |
| Trạng thái sống của server (Funnel/wsrelay/cloudflared/`nodes.db`) | `AGENTS.md` §1 cấm `ssh`/sửa production — chỉ xác minh được phía repo |
| Build target `PrivateVPNMacPacketTunnel` | `project.yml` khai thiếu `WGRelayClient`/`RelayDiagnostics`/`NodeHealthReporter`/`WSRelayClient` nên target này không build được. **Tình trạng có từ trước**, `project.yml` ngoài brief |

## Risks

- **Tầng 1 có thể chưa thật sự hết lỗi trên máy thật.** Toàn bộ bằng chứng là build + trace code
  tĩnh. Nếu luồng `onDead → Mobile.stop() → serve() trả về → outcome 2` không đúng như tôi suy
  luận từ code, triệu chứng treo tunnel sẽ còn nguyên. Cách kiểm nhanh nhất đã ghi ở mục 3 file
  bằng chứng Android.
- **Watchdog chậm hơn handover yêu cầu** (~30–60s thay vì ~10s). Có nút chỉnh nhưng mặc định là
  đánh đổi có chủ ý.
- **Timing của iOS chưa đo:** mỗi bước chuyển transport tốn một lần restart adapter WireGuard,
  worst case ~16s mới rơi xuống UDP trực tiếp.
- **`NodeHealthReporter` nhân bản logic retry** của `ControlAPIClient` (dùng chung
  `ControlAPIHosts` và `request.rewritten(to:)`, nhưng vòng lặp thử lại là bản sao riêng) và
  **không có test**. Nếu sửa quy tắc retry ở một chỗ mà quên chỗ kia thì hai đường lệch nhau.
- **Blocker giấy phép cho Tầng 2** — rủi ro pháp lý/thương mại, chặn P1–P7 của plan.

## Open Questions

1. **Giấy phép — owner phải quyết (chặn toàn bộ Tầng 2).** sing-box là GPL-3.0-or-later, không có
   dual-license công khai; đóng gói `Libbox.xcframework` lên App Store là không được phép theo GPL
   (tiền lệ VLC 2011, chỉ quay lại sau khi đổi sang MPLv2), còn trên Play thì liên kết tĩnh
   `libbox.aar` buộc phải mở source client. Chọn: mở source / xin exception / đổi engine
   permissive / dừng. Chi tiết 7 phương án ở §7.1 + §8 của plan.
2. Có cắm được máy Android (và iPad) để chạy E2E không? Đây là điều kiện duy nhất còn thiếu để
   đóng Tầng 1 theo RULE-TEST-002.
3. Câu `For TLS fingerprint resistance, use NaiveProxy instead` mà plan trích từ docs sing-box
   **tôi chưa xác minh được**: `sing-box.sagernet.org` phân giải DNS nhưng HTTPS trả rỗng từ máy
   này; bản mirror cũ hơn không có câu đó. Phần chịu lực (`Not Recommended` / `unsuitable for
   censorship circumvention`) thì đã xác minh nguyên văn.
4. Có nên thêm relay VPS Hồng Kông không? Tôi đã tư vấn **chưa nên**, và plan xác nhận độc lập:
   sự cố 13/09 là chặn theo **IP**, nên giao thức/vị trí không cứu được — cái cứu được là hạ tầng
   dùng chung + tự chuyển đường. Cần đo nút cổ chai ở chặng nào trước khi mua.
5. `PROBE_INTERVAL_MS` / timeout trong `probeThroughTunnel()` có nên hạ để watchdog nhanh hơn
   (~10s) không, đổi lại là rủi ro dựng lại tunnel khi mạng chỉ mất gói một cú?

## Next Recommended Step

Cắm một máy Android vào máy này rồi chạy 3 phép đo ở mục 3 của
`evidence/2026-09-13-tier1-android-tunnel-recovery.log` để đóng Tầng 1 theo RULE-TEST-002:

```bash
adb devices
adb shell tail -f /sdcard/Android/data/com.privatevpn.app/files/diagnostics.log
```

Đạt khi thấy `ws-relay: cầu WS chết` đi kèm `... -> dừng client để dựng lại transport` và
`transport ended ... -> reconnecting`, và thời gian từ lúc bấm Connect tới
`ws-relay: connected` nằm trong khoảng ~7–11s (trước khi sửa là ~25s).

Song song, owner cần chốt **quyết định giấy phép** trước khi bất kỳ phần nào của Tầng 2 được bắt
đầu — vì nó quyết định toàn bộ P1–P7 của `docs/SINGBOX_INTEGRATION_PLAN.md` có đi tiếp hay không.
