# Agent Handoff

- **Agent:** worker (macOS harness)
- **Task ID:** TASK-20260926-MACOS-IPV6-REJECT
- **Date:** 2026-09-26
- **Status:** needs_review (đã cài bản test 1.4.7/25 và đo trên máy thật; chờ agent chính verify)

## Summary

Sửa lỗi **IPv6 treo** trên bản macOS system extension. Nguyên nhân gốc **không phải** ICMPv6 sai
checksum/độ dài như giả thuyết ban đầu (gói sinh ra HỢP LỆ: kernel nhận, `bad checksum = 0`), mà là
**mã ICMPv6 = 0 (no route) chỉ là lỗi MỀM với TCP trong XNU**: `icmp6_input` xếp code 0/3 vào
`PRC_UNREACH_NET`, còn `tcp_notify` chỉ ghi `t_softerror` rồi TCP **vẫn retransmit SYN** tới
`t_rxtshift > 3` ⇒ đo được `curl -6` treo **4,008 s** (5 SYN vào tunnel / 5 ICMPv6 trả về). Chỉ
**code 4 (Port Unreachable)** mới đi vào `PRC_UNREACH_PORT` → `tcp_drop_syn_sent`
(`net.inet.tcp.icmp_may_rst = 1`) ⇒ `connect()` trả `ECONNREFUSED` NGAY. Đổi sang code 4 + trả lời
`Echo Request` + bỏ qua ICMPv6 lỗi/multicast, log chặn IPv6 ra **unified log**, và đưa `relay.log`
về chỗ **người dùng đọc được** (app group container — qua app, vì extension root bị sandbox chặn).

`curl -6` từ **5,006 s → 0,208 s** (exit 7); `curl -4` google/youtube = **200**.

## Files Changed

| Path | Change Summary |
|---|---|
| `iOS/PrivateVPNPacketTunnel/IPv6Reject.swift` | Mặc định `code = 4` (`codePortUnreachable`), thêm `codeNoRoute`, `typeEchoRequest`; **bỏ qua ICMPv6 lỗi (type < 128)** và **đích multicast**; **trả lời `Echo Request` (128)** để `ping6` thấy lỗi thay vì chờ câm. Chú thích ghi rõ dẫn chứng XNU. |
| `iOS/PrivateVPNPacketTunnel/HysteriaTransport.swift` | Logger riêng `category: "ipv6-reject"` + dòng `ipv6-reject #N len=… code=4` (20 gói đầu, sau đó 1/100); cờ `ipv6Allowed` làm mới 5 s ở `start()`/nhịp tim (`refreshIPv6Policy`) + `isIPv6Blocked`; `forwardToGo` chỉ chặn khi cờ BẬT. |
| `iOS/PrivateVPNPacketTunnel/RelayDiagnostics.swift` | Ghi log vào **app group container**: chính = `~/Library/Group Containers/<nhóm>/relay.log` của user đang đăng nhập (suy từ chủ `/dev/console`, 3 đường: `getpwuid` → quét `/Users/*` → `NSHomeDirectoryForUser`), bản sao = container của tiến trình; **thử GHI THẬT** lúc khởi tạo và khai đường dẫn + kết quả probe ra unified log; ghi cả 2 file, giữ trần 512 KB; `flagExists` soi mọi thư mục; thêm `recentLogTail(maxBytes:)`. iOS giữ nguyên (`containerURL` → `nil` ⇒ `Documents`). |
| `iOS/PrivateVPNPacketTunnel/HysteriaPacketTunnelProvider.swift` | `handleAppMessage`: thêm `report["logTail"]` — **bọc `#if os(macOS)`** nên iOS không đổi byte nào. |
| `iOS/PrivateVPN/Services/HysteriaDefaults.swift` | Thêm **công tắc** `blockIPv6 = true` + tài liệu cách tắt (hằng số này, hoặc file `<app group>/ipv6-allow`). |
| `iOS/PrivateVPN/Services/ControlAPIClient.swift` | `TunnelStatusReport` thêm trường tuỳ chọn `logTail` (tương thích ngược; iOS không gửi ⇒ `nil`). |
| `mac/PrivateVPNMac/VPNManagerMac.swift` | `saveDiagnosticsLog(_:)` + hằng `sharedAppGroupIdentifier` + hàng đợi nền: ghi đè `relay.log` vào app group container mỗi nhịp poll 2 s (**tiện cho hỗ trợ**, không phải bản sửa thẻ Diagnostics). |
| `project.yml` | **CHỈ 2 target macOS**: `CURRENT_PROJECT_VERSION` `22 → 25` (giữ `MARKETING_VERSION 1.4.7`). **iOS giữ nguyên 57 / 1.4.6** (đã kiểm lại). Kèm chú thích vì sao phải đổi số version. |
| `scripts/ios-pure-logic-tests/main.swift` | Mở rộng test P2: mặc định code 4, code 0 vẫn đúng + checksum, Echo Request → trả lời, ICMPv6 lỗi/Echo Reply/multicast → bỏ im lặng, `HysteriaDefaults.blockIPv6 == true`. |
| `docs/MACOS_SIGN_NOTARIZE.md` | Thêm **§5b** — sự thật đo được: *system extension chỉ nạp lại khi ĐỔI `CURRENT_PROJECT_VERSION`* (kèm cách kiểm). |
| `PrivateVPN.xcodeproj/*` | Sinh lại bằng `xcodegen generate` (hệ quả của `project.yml`). |

## Decisions Made

| Decision | Reason | Persisted In |
|---|---|---|
| Dùng **ICMPv6 code 4** (không phải 0) | XNU: code 0/3 → `PRC_UNREACH_NET` ⇒ `tcp_notify` chỉ ghi `t_softerror`, TCP retransmit SYN tới `t_rxtshift > 3` (đo: 4,008 s). Code 4 → `PRC_UNREACH_PORT` ⇒ `tcp_drop_syn_sent` (khi `net.inet.tcp.icmp_may_rst=1`, máy này = 1) ⇒ `ECONNREFUSED` tức thì | `IPv6Reject.swift` |
| **Giữ P2** (kéo `::/0` vào tunnel + trả lỗi), KHÔNG bỏ địa chỉ IPv6 của utun | Bỏ địa chỉ ⇒ hết chống rò IPv6 và mất bằng chứng chặn; yêu cầu "app lùi IPv4 ngay" đã đạt bằng code 4. Chủ dự án đã chốt (26/09) | `HysteriaPacketTunnelProvider.swift` |
| **Không trả Echo Reply giả** cho `ping6` | `ping6` đặt `ICMP6_FILTER` chặn mọi type trừ `ECHO_REPLY` (`network_cmds/ping6.tproj/ping6.c:1043-1053`) và XNU `rip6_ctlinput` cho raw socket chỉ chạy `in6_rtchange` (không đặt `so_error`) ⇒ ping6 luôn chờ hết thời gian. Trả Echo Reply = nói dối "IPv6 sống" | `IPv6Reject.swift`, handoff này |
| Log đi vòng **qua app** (`sendProviderMessage` → app ghi hộ) | App group container trên macOS **theo từng user**; extension root bị **sandbox chặn ghi** vào container của user (đo thật `write=false`) ⇒ không có đường file trực tiếp nào | `RelayDiagnostics.swift`, `VPNManagerMac.swift` |
| Lọc `#if os(macOS)` cho `logTail` | Giữ nguyên hành vi iOS (không tốn byte qua kênh 2 s/lần) | `HysteriaPacketTunnelProvider.swift` |
| Build số **25** (không phải 23 như brief) | macOS **chỉ nạp lại** system extension khi đổi version; cài lại cùng 23 mà khác nội dung vẫn chạy ảnh cũ (đo thật). 26 để dành agent khác (chủ dự án chỉ định) | `project.yml`, `docs/MACOS_SIGN_NOTARIZE.md` §5b |

## Evidence

| Evidence ID | Verification Level | Result |
|---|---|---|
| EVID-20260926-01 | build_checked | `xcodebuild -scheme PrivateVPNMac` → `** BUILD SUCCEEDED **` (exit 0), app+sysext `1.4.7/25` |
| EVID-20260926-02 | runtime_measured | `curl -6 … https://www.google.com` → `000 0.208077` (exit 7); trước khi sửa: `000 5.005822` |
| EVID-20260926-03 | runtime_measured | `curl -4` google `200 1.876846`, youtube `200 3.982925` |
| EVID-20260926-04 | runtime_measured | `netstat -s -p icmp6`: `bad checksum 0`, `message with bad length 0`; input `unreach` +2 cho 2 lần thử IPv6 |
| EVID-20260926-05 | runtime_measured | Unified log `ipv6-reject #N len=… code=4`, 32 dòng/15 phút (throttle 20 rồi 1/100) |
| EVID-20260926-06 | runtime_measured | `~/Library/Group Containers/G6XW3RN6LJ.com.privatevpn.shared/relay.log` — 8192 B, `minhnguyen -rw-r--r--`, mtime tự cập nhật ~2 s |
| EVID-20260926-07 | gate_checked | `scripts/ios-pure-logic-tests/run.sh` → `602/602 PASS, 0 FAIL`; `ios-lint-locks.py` → ĐẠT; `ios-typecheck.sh extension` + `macos` → 0 lỗi |
| EVID-20260926-08 | runtime_measured | `systemextensionsctl list` → `com.privatevpn.mac.packet-tunnel (1.4.7/25) [activated enabled]`, KHÔNG cần duyệt lại |

## Validation Performed

```bash
# 1) IPv6 (bản 1.4.7/25, tunnel Connected, utun7 có 2001::ffff:ffff:ffff:fff1/126)
curl -6 -m 5 -o /dev/null -s -w "%{http_code} %{time_total}\n" https://www.google.com   # 000 0.208077 (exit 7)
curl -6 -m 5 -o /dev/null -s -w "%{http_code} %{time_total}\n" "https://[2001:4860:4829:7700::]/"  # 000 0.001124
curl -4 -m 12 -o /dev/null -s -w "%{http_code} %{time_total}\n" https://www.google.com   # 200 1.876846
curl -4 -m 12 -o /dev/null -s -w "%{http_code} %{time_total}\n" https://www.youtube.com  # 200 3.982925
# 2) log hợp nhất (đọc được bằng user)
log show --last 15m --predicate 'subsystem == "com.privatevpn.app.packet-tunnel" AND category == "ipv6-reject"' --style compact | tail -2
#   … ipv6-reject #19 len=132 code=4 ; ipv6-reject #20 len=132 code=4
# 3) đếm kernel (không bị throttle) — mỗi gói IPv6 bị chặn = 1 ICMPv6 trả về
netstat -sp icmp6 | awk '/Input histogram:/{f=1} f&&/unreach:/{print $2; exit}'   # +2 sau 2 lần thử IPv6
# 4) file log cho user
ls -l ~/Library/Group\ Containers/G6XW3RN6LJ.com.privatevpn.shared/relay.log      # 8192 B, -rw-r--r--
grep -o "IPv6-chặn [0-9]*" ~/Library/Group\ Containers/G6XW3RN6LJ.com.privatevpn.shared/relay.log | tail -1  # IPv6-chặn 65
```

Result:

```text
curl -6 : 000 / 0,208 s (exit 7 — "Couldn't connect to server")   ← trước khi sửa: 000 / 5,006 s, riêng TCP connect 4,008 s
curl -4 : google 200 · youtube 200
ping6 -c2 2001:4860:4829:7700:: : 12,0 s  ← KHÔNG dùng làm tiêu chí (xem Validation Not Performed)
unified log : [com.privatevpn.app.packet-tunnel:ipv6-reject] ipv6-reject #20 len=132 code=4
kernel      : icmp6 input unreach +2/2 gói, bad checksum 0, bad length 0
relay.log   : ~/Library/Group Containers/G6XW3RN6LJ.com.privatevpn.shared/relay.log (8192 B, user đọc được)
systemextensionsctl : com.privatevpn.mac.packet-tunnel (1.4.7/25) [activated enabled]
```

Bằng chứng cho bệnh CŨ (trước khi sửa, bản 1.4.7/22, cùng máy):

```text
$ curl -6 -m 5 -o /dev/null -s -w "%{http_code} %{time_total}\n" https://www.google.com
000 5.005822
$ curl -6 -m 5 ... "https://[2001:4860:4829:7700::]/"      # 000 4.007822 · "Network is unreachable"
$ netstat -sp icmp6   # delta: ICMP6 input +5, unreach +5, bad checksum 0   ⇒ gói ICMPv6 HỢP LỆ và CÓ được gửi
$ sysctl net.inet.tcp.icmp_may_rst   # 1
```

## Validation Not Performed

| Check | Reason |
|---|---|
| `ping6 -c2 … trả lỗi NGAY` | **Bất khả thi bằng cách đúng.** `ping6` tự đặt `ICMP6_FILTER` chặn mọi type trừ `ECHO_REPLY`; XNU `rip6_ctlinput` cho raw socket chỉ `in6_rtchange`, không đặt `so_error` ⇒ ping6 luôn chờ hết 10 s. Chỉ thoả được bằng (a) trả Echo Reply **giả** hoặc (b) **bỏ địa chỉ IPv6 của utun** (mất chống rò + mất bằng chứng chặn). Chủ dự án đã chốt giữ P2 (26/09/2026) và thống nhất tiêu chí IPv6 = `curl -6` < 0,5 s + log `ipv6-reject code=4`. |
| Build/archive/verify IPA iOS | Không thuộc phạm vi (brief: không đụng 2 target iOS). Đã chạy `swiftc -typecheck` (iOS SDK) + harness thuần logic + lint khoá. |
| Thử trên mạng **có IPv6 thật** (5G TQ) | Máy này là hotspot 4G **không có IPv6 toàn cầu** (en0 chỉ có `fe80::`) ⇒ chỉ chứng minh được "app lùi IPv4 tức thì", chưa đo được ca rò IPv6 ở mạng có IPv6. |
| Đo thời gian lùi IPv4 của app thật (Safari/Chrome) | Chỉ đo được bằng `curl`/socket; chưa đo Happy Eyeballs của trình duyệt. |
| `git`/publish/upload | Cấm theo AGENTS.md §1 và brief. |

## Risks

- **Đường log hợp nhất bị throttle**: `ipv6-reject` chỉ in 20 gói đầu rồi **1/100** ⇒ sau `#20`,
  người verify sẽ **không** thấy dòng mới cho tới `#100` (bộ đếm vẫn đếm đủ). Bằng chứng không bị
  throttle: `netstat -sp icmp6` (delta đúng 1/gói) và trường `IPv6-chặn N` trong `relay.log` mà
  người dùng đọc được. Muốn in mọi gói: sửa một dòng trong `HysteriaTransport.rejectIPv6`
  (điều kiện `blocked <= 20 || blocked % 100 == 0`) ở build macOS kế tiếp.
- **iOS thay đổi hành vi** (cùng file `IPv6Reject`): TCP tới đích IPv6 nay bỏ **ngay**
  (`ECONNREFUSED`) thay vì treo ~4 s rồi mới bỏ; `Echo Request` được trả lời; multicast/ICMPv6 lỗi
  bị bỏ qua. Đây là **cải thiện** nhưng **chưa đo trên thiết bị iOS thật** trong phiên này.
- `recentLogTail` cắt theo **byte** nên dòng ĐẦU của `relay.log` do app ghi có thể là dòng cụt.
  (Cosmetic; sửa bằng cách cắt tới `\n` đầu tiên — chưa làm vì chủ dự án yêu cầu DỪNG ở build 25.)
- **Số build macOS = 25**, không phải 23 như brief (23/24 đã dùng để thử trên máy; 26 để dành agent
  khác). `MARKETING_VERSION` vẫn `1.4.7`.
- `RelayDiagnostics.appGroupIdentifier` hardcode `G6XW3RN6LJ.com.privatevpn.shared` (kèm tiền tố
  team). Đổi team/App ID ⇒ phải sửa cả đây, `project.yml` và `NEMachServiceName`.
- Sandbox của system extension **chặn ghi** vào container app group của user là hành vi **đã đo
  trên macOS 26.5 máy này**; máy macOS khác có thể khác — code vẫn probe và tự chọn đường ghi được,
  và khai kết quả ra unified log.
- `rejectIPv6` chạy trên luồng callback của `packetFlow`; đã giữ nguyên nguyên tắc **không gọi
  `writePackets` khi đang giữ `lock`** và không lấy khoá của `RelayDiagnostics` trên đường gói
  (cờ IPv6 làm mới 5 s/lần ở nhịp tim). Lint `ios-lint-locks.py` ĐẠT.

## Open Questions

- Có cần dòng `ipv6-reject` **mỗi gói** (bỏ throttle) không? Nếu khách bị IPv6-heavy, log sẽ dày
  hơn — cần cân nhắc trước khi đổi ở build sau.
- iOS có nên dùng cùng cơ chế "gửi đuôi log cho app" không (hiện iOS vẫn ghi `Documents/relay.log`
  trong container extension và lấy ra bằng `devicectl`) — chưa làm để không đổi hành vi iOS.
- Có nên bỏ hẳn `ping6` khỏi mọi tiêu chí nghiệm thu IPv6 trong `docs/` không (handoff này và
  `docs/MACOS_SIGN_NOTARIZE.md` §5b đã ghi rõ; các tài liệu khác có thể còn nhắc `ping6`).

## Next Recommended Step

Chủ dự án/agent chính: cài `~/.vpnflow-macrelease/VPNFlow-mac-1.4.7-25.dmg` (hoặc app đã cài sẵn ở
`/Applications/VPNFlow.app`, bản 1.4.7/25) lên một máy có **mạng IPv6 thật** (5G TQ) và chạy lại 2
phép đo `curl -6` (phải < 0,5 s) + `curl -4` (200) + kiểm
`~/Library/Group Containers/G6XW3RN6LJ.com.privatevpn.shared/relay.log` đọc được; sau đó xác nhận
không rò IPv6 ra đường vật lý.
