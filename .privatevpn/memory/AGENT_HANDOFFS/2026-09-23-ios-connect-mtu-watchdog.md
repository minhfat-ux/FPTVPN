# Agent Handoff

- **Agent:** main (Senior dev / orchestrator — DSH harness Mac)
- **Task ID:** TASK-20260923-IOS-CONNECT-MTU-WATCHDOG
- **Date:** 2026-09-23
- **Status:** done — đã UỶ QUYỀN: committer commit, publisher nghiệm thu + phát hành

## Summary

Khách báo iPhone "Connected nhưng không có mạng" và "chạy vài phút thì disconnect". Đo trên
**iPhone thật** (kéo `relay.log` bằng `devicectl`) và truy ra **3 lỗi độc lập**, cả ba đã sửa và
đã đo lại trên máy thật:

1. **MTU 1500 quá lớn với Hysteria (QUIC)** ⇒ gói LỚN bị drop, gói nhỏ vẫn qua ⇒ "Connected
   nhưng không có mạng" (khớp `docs/TUNNEL_MTU_DNS_BUGREPORT.md` §4.1). Sửa: MTU **1300** +
   resolver thứ 2.
2. **Watchdog sống-còn im lặng**: mọi đường thoát đều không log nên khi vòng lặp ngừng chạy thì
   không có dấu vết và không ai tự cứu (đo được: im lặng 14 phút). Sửa: đồng hồ chết ở hàng đợi
   riêng + nhịp tim 60 s + bật lại khi transport bị thay.
3. **Bộ giám sát LƯU LƯỢNG gỡ tunnel oan** sau khi ramp dựng lại transport: `supervisorStart`
   giữ mốc transport CŨ còn bộ đếm cầu MỚI = 0 ⇒ kết luận "90 s không có gói" ⇒ **GỠ tunnel**
   (đúng ca "đang xem Netflix thì mất mạng"). Bản vá nằm trong cây làm việc của phiên song song
   (`resetTrafficSupervisorBaselineAfterSwap()`).

## Files Changed

| Path | Change Summary |
|---|---|
| `iOS/PrivateVPN/Services/HysteriaDefaults.swift` | `mtu` 1500 → **1300**; `dnsServers` thêm `8.8.8.8`; comment ghi rõ ngoại lệ có chủ ý với Android (bản vá Android còn trong stash) |
| `iOS/PrivateVPNPacketTunnel/HysteriaPacketTunnelProvider.swift` | (a) đồng hồ chết `startWatchdogGuard()` + nhịp tim 60 s + log các đường thoát im lặng (commit `ff08f5b`); (b) **2 dòng sửa của task này**: 2 chỗ gọi trỏ đúng `restartLivenessAfterTransportSwap` (xem §Decisions) |
| `.privatevpn/memory/AGENT_HANDOFFS/2026-09-23-ios-connect-mtu-watchdog.md` | **MỚI** — báo cáo này |

## Decisions Made

| Decision | Reason | Persisted In |
|---|---|---|
| Hạ MTU iOS xuống 1300 (không chờ Android) | Đo trên máy: 661 KB/17 phút (`observed≈0`) → **16,1 MB/80 giây**, gói bỏ 0,47%; giữ 1500 là khách tiếp tục mất mạng | `HysteriaDefaults.swift` + commit `6fa8b1a` (nhánh `mac/ios-mtu-1300`) |
| Không tự publish | Chủ dự án chốt: sửa xong thì giao committer + publisher theo workflow | báo cáo này + inbox `publisher` |
| Ghi nhận thẳng lỗi của mình | Khi sửa cùng file với phiên song song, một lệnh đổi tên hàm thất bại nhưng lệnh sửa chỗ gọi thành công ⇒ sinh lời gọi tới hàm không tồn tại. Đã phát hiện, sửa 2 chỗ gọi, verify lại (0 tham chiếu chết, parse OK, test 258/258) | §Risks + commit message |

## Evidence

| Evidence ID | Verification Level | Result |
|---|---|---|
| EVID-20260923-201 | runtime_checked (iPhone thật) | passed — MTU 1500: 661 KB vào / 314 KB ra trong 17 phút, `observed≈0`, cầu bỏ gói `write=1504 errno=35` ×100 |
| EVID-20260923-202 | runtime_checked (iPhone thật) | passed — MTU 1300: **2,4 MB vào / 16,1 MB ra trong 80 giây** (đang xem Netflix), `observed` đỉnh 5096 kbps, `bỏ 77/16454` = 0,47%, TCP SYN 134/SYN-ACK 134 |
| EVID-20260923-203 | runtime_checked (iPhone thật) | passed — log chứng minh bug gỡ oan: dựng lại transport 15:47:59 → `QUYẾT ĐỊNH TỰ GỠ tunnel sau 90.0s` → `ĐÃ gỡ network settings` lúc 15:48:03 |
| EVID-20260923-204 | runtime_checked (iPhone thật) | passed — fix watchdog chạy đúng: `watchdog NGỪNG chạy (46s không có nhịp) — bật lại` và `đủ 1 strike — TỰ DỰNG LẠI transport` |
| EVID-20260923-205 | build_checked | passed — `ARCHIVE SUCCEEDED` + `EXPORT SUCCEEDED` bản 1.4.3/20; IPA có `HysteriaPassword` dài 21, `HysteriaObfs` dài 12; marker `supervisorStart` có trong binary; đã cài lên iPhone |
| EVID-20260923-206 | test_checked | passed — `swiftc -parse` OK cả `arm64-apple-macos14.0` và `arm64-apple-ios17.0`; `scripts/ios-pure-logic-tests/run.sh` **258/258 PASS** |
| EVID-20260923-207 | runtime_checked (máy Mac, ký Android) | passed — `vpnflow-release.jks` có chứng thư SHA-256 `dc6e484b…5e46` **khớp mốc Windows đưa**; `vpnflow-release.keystore` mật khẩu không mở được (file cũ) |

## Validation Performed

```bash
# Đo trên iPhone thật (không cần người bấm gì):
xcrun devicectl device copy from --device 33987D6F-... --domain-type appDataContainer \
  --domain-identifier com.privatevpn.app.packet-tunnel --source Documents/relay.log --destination /tmp/relay.log
# Kiểm chứng build:
xcodebuild ... archive && bash scripts/ios-adhoc-export.sh --no-upload
xcrun devicectl device install app --device 33987D6F-... .privatevpn/tmp/ios-test5/unpacked/Payload/FlowVPN.app
swiftc -parse -target arm64-apple-ios17.0 iOS/PrivateVPNPacketTunnel/HysteriaPacketTunnelProvider.swift
bash scripts/ios-pure-logic-tests/run.sh
# Kiểm chứng keystore Android (cho Windows publish):
keytool -list -v -keystore ~/keystores/vpnflow-release.jks -storepass:env KP
```

Result:

```text
MTU 1500: 661 KB vào / 314 KB ra (17 phút), observed≈0, bỏ gói write=1504 errno=35 x100
MTU 1300: 2,4 MB vào / 16,1 MB ra (80 giây), observed max 5096 kbps, bỏ 0,47%
ARCHIVE SUCCEEDED · EXPORT SUCCEEDED · app 1.4.3 build 20 · extension build 20
swiftc -parse: exit 0 (macOS) / exit 0 (iOS)
ios-pure-logic-tests: 258/258 PASS, 0 FAIL
vpnflow-release.jks: SHA256 DC:6E:48:4B:...:5E:46 == moc Windows
```

## Validation Not Performed

| Check | Reason |
|---|---|
| Phiên Netflix **dài ≥5 phút** sau khi có fix gỡ-oan | Cần người bấm Connect trong app; đã giao publisher theo bảng nghiệm thu trong inbox |
| Bắt syslog `neagent` để giải thích vì sao iOS treo tiến trình extension khi khoá máy | `devicectl` không stream được syslog; cần Xcode Devices hoặc thiết bị mở khoá |
| Xác nhận relay `vn1hy/vn1wg` hết lỗi `EINVAL` sau deploy | Việc của Windows/server (commit `84d4f93` đã ở `origin/main`, chưa deploy) |

## Risks

- **Nếu publisher không chạy bảng nghiệm thu**: bug gỡ-oan có thể vẫn còn ở một nhánh khác
  (ví dụ khi transport bị thay vì HOLD) — bảng nghiệm thu trong inbox publisher ghi rõ dấu hiệu
  phải kiểm (`QUYẾT ĐỊNH TỰ GỠ` sau dòng `transport vừa thay`).
- **Cây làm việc đang có 24 file chưa commit** (23 file của phiên song song + báo cáo này).
  Commit theo nhóm; đừng `git add -A` mù vì có `.privatevpn/tmp/` và file build.
- **Secret**: keystore Android đã gửi node-2 dạng mã hoá AES-256, mật khẩu **chỉ qua Telegram**
  (không có trong inbox/báo cáo/tin nhắn nào). Windows phải xoá bản trên node-2 sau khi giải mã.
  Mật khẩu keystore của Mac (`~/keystores/vpnflow-keystore-password.txt`) vẫn là nợ bảo mật cũ.

## Open Questions

1. Có cần vá tương tự cho **macOS** (MTU 1300 + 2 resolver) không? — `HysteriaDefaults` dùng chung
   iOS/macOS nên macOS **đã** nhận MTU 1300 theo commit này; cần đo lại trên Mac thật.
2. `vpnflow-release.keystore` (file cũ, mật khẩu không khớp) có nên xoá khỏi `~/keystores/` để
   tránh gửi nhầm lần nữa?

## Next Recommended Step

**Publisher**: theo bảng nghiệm thu trong
`/var/lib/flowvpn-coord/inbox/publisher/20260923T081246Z-mac-ban-giao-fix-ios-mtu-1300--watchdog--moc.md`
— Connect → xem Netflix ≥5 phút → kéo log → đạt cả 3 tiêu chí thì mới phát hành.
**Committer**: commit cây làm việc theo nhóm và push kèm 2 commit của Mac (`6fa8b1a`, `ff08f5b`).
