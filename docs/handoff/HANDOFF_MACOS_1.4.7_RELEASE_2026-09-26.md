# BÀN GIAO — **macOS 1.4.7 (build 28)** cho COMMITTER + PUBLISHER · 26/09/2026

> Người soạn: harness Mac (main agent). Luật: `PUBLISHER_PROCESS.md` §0/§1/§2b/§4 · `AGENTS.md` §7e · `VERSIONING.md`.
> **Thay thế** `HANDOFF_PUBLISHER_MACOS_1.4.7_2026-09-26.md` (đã cũ: bản đó còn nói profile/portal).

## 0. Vì sao loạt này tồn tại (ngắn)
Kênh macOS đang phát **1.4.6/21 KHÔNG MỞ ĐƯỢC** (và cả 1.4.0/14 cũng vậy): profile Developer ID của Apple **không cấp `packet-tunnel-provider`** cho appex plugin ⇒ AMFI chặn. Đã chuyển tunnel macOS sang **System Extension** (đúng thứ profile cấp) + sửa 4 lỗi thật khác. Kênh đã hạ `minimum_mac_version=0.0.0` và đã gửi email đính chính 21/21 khách (26/09).

## 1. Nội dung bản 1.4.7/28 (đã đo trên máy thật)
| # | Thay đổi | Bằng chứng máy thật |
|---|---|---|
| 1 | **System Extension** thay appex plugin (`Contents/Library/SystemExtensions/…systemextension`) | `systemextensionsctl list` = `* * (1.4.7/28) [activated enabled]`; app mở được; cập nhật đè **không** phải duyệt lại |
| 2 | **IPv6 fail-fast** (ICMPv6 **code 4**) | `curl -6` lùi IPv4 **0,21–0,30 s** (trước 5–12 s); log `ipv6-reject … code=4`; Google/YouTube IPv4 **200** |
| 3 | **Failover khi relay chết hẳn** (`RelayUnreachableWatch` 20 s) | relay chặn ⇒ **đổi node/đường sau ~26 s** (`vn2hy → vn1hy`), handshake 28,9 s, **tunnel không rơi `Disconnected`** (0/24 mẫu) |
| 4 | **Tự nối lại session** (backoff 2→60 s, cờ ý định người dùng) | sau test: tunnel `Connected`; không còn cảnh "Disconnected im lặng 18 phút" |
| 5 | **Bộ nhớ macOS tách nền tảng** (200/400 MB) | RSS 32–58 MB suốt 25 phút, không tự hạ tunnel |
| 6 | **A7/Tencent đi thẳng** | tải Tencent 9.211 B/s → **5.872.018 B/s**; route Tencent qua `en0` |
| 7 | **Cảnh báo xung đột mạng** (bám bản Windows) | chỉ đo DNS khi tunnel Connected; nền = Info im lặng; VPN khác Connected/giữ route/proxy = Blocking (nêu tên app); có "Không nhắc lại" |
| 8 | **Log cho hỗ trợ**: `~/Library/Group Containers/G6XW3RN6LJ.com.privatevpn.shared/relay.log` | file 8 KB user đọc được, mtime ~2 s (extension root không ghi được container user ⇒ app ghi hộ qua `sendProviderMessage`) |

Nghiệm thu khác: `ios-pure-logic-tests` **657/657 PASS** · `ios-lint-locks.py` **ĐẠT** · `ios-typecheck.sh` **0 lỗi** · `xcodebuild` **BUILD SUCCEEDED** · `spctl` **Notarized Developer ID** · cổng quyền app **6/6**, sysext **5/5**.

## 2. COMMITTER — commit + push (KHÔNG phải publisher)
Nhóm A (system extension + IPv6 + log): `project.yml` (2 target macOS = `1.4.7/28`; iOS giữ `57/1.4.6`) · `mac/PrivateVPNMacPacketTunnel/**` (Info.plist mới, `main.swift` mới, entitlements) · `mac/PrivateVPNMac/**` (VPNManagerMac, ContentViewMac, VPNThemeMac, NetworkConflictDetector/Probe, entitlements) · `mac/tools/network-conflict-probe/**` · `iOS/PrivateVPNPacketTunnel/**` (HysteriaPacketTunnelProvider, HysteriaTransport, LivenessWatchdog, IPv6Reject, RelayDiagnostics) · `iOS/PrivateVPN/Services/HysteriaDefaults.swift`, `ControlAPIClient.swift`, `VPNManager.swift` · `scripts/ios-pure-logic-tests/{main.swift,run.sh}`.
Nhóm B (công cụ/cổng): `scripts/mac-sign-notarize.sh` (APFS + cổng 4b/6b) · `scripts/mac-check-profile-entitlements.py` (mới) · `scripts/asc-mac-devid-profiles.mjs` (mới) · `scripts/send-mac-correction-2026-09-26.py` (mới).
Nhóm C (docs): `docs/SERVER_RECOVERY_RUNBOOK.md` (mới) · `docs/MACOS_SIGN_NOTARIZE.md` · `docs/PUBLISHER_PROCESS.md` (§6 dòng 26/09 + §7.10 + §8) · `docs/AGENTS.md` → **`AGENTS.md` §7e** (mới) · `docs/handoff/HANDOFF_MACOS_IPV6_REJECT_2026-09-26.md`, `HANDOFF_PUBLISHER_MACOS_1.4.7_2026-09-26.md`, file này, `docs/RELEASE_ARTIFACTS_2026-09-26.md`.
**KHÔNG commit:** `release/releases.jsonl` (publisher ghi), `.privatevpn/memory|reports/**`, `scripts/security/mac-selfdefense/**`, `build/**`, `/Volumes/BIWIN/.macbuild-dd*/**`.
⚠️ `main.swift` có **1 case cũ đổi kỳ vọng** (case 7 `.warning → .info`) — chủ dự án đã duyệt (đó là hệ quả yêu cầu "tiền trình nền = Info").

## 3. PUBLISHER — phát hành macOS **1.4.7 / build 28**
```bash
# 1) DMG từ CHÍNH artifact đã đo (ký + notarize + staple app & DMG, APFS)
bash scripts/mac-sign-notarize.sh /Volumes/BIWIN/.macbuild-dd28/Build/Products/Release/VPNFlow.app 1.4.7-28 --dmg
# 2) cổng chặn version (đọc version TỪ TRONG DMG)
python3 scripts/check-publish-version.py --platform macos \
  --file ~/.vpnflow-macrelease/VPNFlow-mac-1.4.7-28.dmg --version 1.4.7 --build 28      # exit 0
# 3) MỞ THỬ APP THẬT + bấm Allow (máy sạch) rồi Connect — cổng §4a KHÔNG bắt được lỗi quyền
# 4) upload NGUYÊN TỬ -> /root/flowvpn-mac/VPNFlow-mac.dmg ; verify sha256/size trên server
# 5) cổng §4a trên CHÍNH file đang phát ; sau đó set mốc:
#    latest_mac_version=1.4.7  (KHÔNG có route admin cho mốc macOS: sửa app_config trên node-2, backup DB trước)
#    RỒI MỚI minimum_mac_version=1.4.7 (chốt chủ dự án 25/09 "force khách update nếu đã cài")
# 6) email toàn bộ khách macOS (3 ngôn ngữ): NÓI RÕ lần đầu bấm Connect macOS sẽ hỏi cài "system extension" -> bấm Allow
# 7) ghi PUBLISHER_PROCESS §6 + release/releases.jsonl + tag macos-v1.4.7
```
⛔ Không phát lại 1.4.6 (đã chiếm sha `c95b4fab…`). ⛔ Chưa ĐẠT cổng 2/3/5 ⇒ không phát, không gửi email.

## 4. CÒN NỢ trước khi phát (nói thật)
1. **Chưa cài 28 lên máy chủ dự án** (đang chạy 27) — bản 28 chỉ khác phần cảnh báo xung đột; **cài trước khi phát** để mắt người kiểm 4 kịch bản UI: Info ⇒ không hiện gì · Warning ⇒ hiện 1 lần, mở lại app không hiện · bấm Connect ⇒ hiện lại · "Không nhắc lại" ⇒ im và không chặn Connect.
2. **Chưa test cài MỚI hoàn toàn trên máy sạch** (bước khách bấm **Allow** cho system extension) — cần 1 máy/1 user mới.
3. **Biên an toàn failover mỏng**: 26 s so với mục tiêu <30 s ⇒ có thể hạ ngưỡng 20 s → 15 s (build 29) nếu muốn dư.
4. **Sự cố SSH node-2** (đang bị brute-force, đường SSH quản trị đang tắc do rule iptables tôi chèn sai thứ tự) ⇒ **chưa gửi được file này vào `/var/lib/flowvpn-coord/inbox/{committer,publisher}/`**; đã gửi qua Telegram. Agent an toàn đang chờ `tailscale up` để vào sửa.
