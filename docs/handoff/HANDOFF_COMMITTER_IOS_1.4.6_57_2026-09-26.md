# BÀN GIAO COMMITTER — nhánh iOS 1.4.6 (build 57) + vá cổng publisher

- **Từ:** agent chính (Mac) · **Đến:** committer · **Ngày:** 26/09/2026
- **Trạng thái:** ✅ iOS 1.4.6/57 **đã phát xong** (xem `HANDOFF_PUBLISHER_IOS_1.4.6_57_2026-09-26.md`). Việc còn lại là **commit**.
- ❌ **KHÔNG `git add -A`** — cây làm việc đang trộn **4 luồng** của nhiều session.

## 0. ⚠️ ĐỌC TRƯỚC: cây đang bị session khác sửa SONG SONG

Trong lúc phiên này làm việc, `project.yml` đã **tự đổi** phần macOS: `CURRENT_PROJECT_VERSION` 23 → **24**
(build macOS 1.4.7). Nghĩa là **session macOS vẫn đang ghi file**. Hệ quả:

1. Nếu commit `project.yml` ngay bây giờ, bạn **chụp một mục tiêu đang di chuyển** của luồng macOS.
2. `project.yml` là **file dùng chung** cho cả iOS và macOS — không tách được bằng pathspec. Commit nó một lần,
   và thông điệp commit phải nói rõ nó chứa **cả hai** thay đổi.
3. Cổng `ios-typecheck.sh` từng đọc **ĐỎ 4 lỗi** giữa phiên chỉ vì session khác đang ghi dở
   `RelayDiagnostics.swift`. **Chấm cổng lại ngay trước khi commit**, đừng tin số cũ.

⇒ **Đề nghị:** commit **nhóm A + B** (iOS + cổng publisher) trước, **để `project.yml` lại sau cùng** và chấp nhận
nó mang theo số version macOS hiện thời; hoặc chờ session macOS báo xong rồi commit gộp. Chọn cách nào cũng phải
**chạy lại cổng iOS** ngay trước khi commit.

## A. Nhánh iOS build 57 (việc của phiên này)

| path | thay đổi |
|---|---|
| `iOS/PrivateVPN/Services/HysteriaDefaults.swift` | `sessionStartBudget` (= `relayOpenGrace × maxRelayDoorsPerNode + 5` = 25 s) · `sameNodeRelayAlternates(for:)` · dải IPv6 Cloudflare bị loại trừ · `tunIPv6Address`/`tunIPv6PrefixLength` |
| `iOS/PrivateVPN/VPNManager.swift` | F3: nối relay **cùng node** (không mượn relay của node khác) |
| `iOS/PrivateVPNPacketTunnel/HysteriaPacketTunnelProvider.swift` | ngân sách phiên 25 s · áp `ipv6Settings` (`::/0` + loại trừ) · `rejectIPv6` · dòng log chẩn đoán IPv6 |
| `iOS/PrivateVPNPacketTunnel/HysteriaTransport.swift` | `forwardToGo` chặn IPv6 → `rejectIPv6`; bộ đếm `toGoIPv6Blocked` |
| `iOS/PrivateVPNPacketTunnel/IPv6Reject.swift` | **MỚI** — logic thuần `destinationUnreachable(...)` + `icmpv6Checksum` (**P2**) |
| `iOS/PrivateVPNPacketTunnel/RelayDiagnostics.swift` | ⚠️ **KHÔNG phải việc của phiên này** — session dev sửa (hàng đợi + `autoreleasepool` + `flagDirectories`). Xem §C |
| `scripts/ios-typecheck.sh` | **MỚI** — cổng typecheck 3 target (shim `WireGuardKit`, `NWPath`, lọc `._*`) |
| `scripts/ios-pure-logic-tests/main.swift` · `run.sh` | case cho `IPv6Reject` + van bộ nhớ (**532/532 PASS**) |
| `scripts/check-relay-ipv6-exclusion.py` | **MỚI** — kiểm AAAA của relay ⊂ dải loại trừ (đã chứng minh hai chiều) |
| `project.yml` | ⚠️ **file dùng chung** — iOS 2 target: `CURRENT_PROJECT_VERSION` 54 → **57** (giữ `MARKETING_VERSION` 1.4.6) · `IPv6Reject.swift` vào 2 target extension · **và** phần macOS 1.4.7/24 của session khác |

Commit đề nghị:
```
fix(ios): chan IPv6 chu dong (P2) + relay cung node (F3) + ngan sach phien (F4)

P2: goi IPv6 khong con roi vao khoang khong - tra ICMPv6 Destination Unreachable
de ung dung lui ve IPv4 ngay (truoc day goi bien mat => app treo cho).
F3: chi noi relay CUNG node, khong muon relay cua node khac; thieu hy_relay_url
thi di UDP truc tiep. F4: sessionStartBudget = relayOpenGrace x maxRelayDoorsPerNode + 5.
Cong: ios-typecheck 3 target 0 loi, pure-logic 532/532, lint-locks DAT,
check-relay-ipv6-exclusion DAT. Build 1.4.6/57 da phat (sha a4fec707...).
```

## B. Vá cổng publisher (`scripts/publish-ios.sh`)

Ba lỗi có thật, đã chứng minh hai chiều:

1. **Chết giữa đường** — script không truyền `--allow-rehash`, mà bước ghi sổ (7c) nằm **sau** bước đã thay file
   đang phát (4) + PATCH mốc (6) ⇒ kênh đã đổi cho khách mà sổ trống. Đã thêm **bước 1e** chạy
   `release-record --dry-run` **trước khi upload**.
2. **Dòng sổ trỏ đường dẫn chết** — hardcode `--evidence release/ios/RELEASE_NOTES_1.4.6.md`, file này **không tồn tại**
   (thư mục chỉ có `RELEASE_NOTES_1.4.0/1.4.1`). Đã cho mặc định `--evidence` = file `--device-test`.
3. **Tên bản sao lưu mất version** — bước đọc version bản cũ dùng heredoc trong chuỗi nháy kép, mà `"...\n..."` trong bash
   **không** thành xuống dòng ⇒ lệnh tới server hỏng ⇒ `OLDV` rỗng ⇒ `VPNFlow-latest.bak--<ts>.ipa` (ca thật hôm nay).
   Đã viết lại bằng `python3 -c` một dòng + **bỏ `2>/dev/null`** (nuốt lỗi chính là thứ làm nó im lặng) + cảnh báo rõ khi rỗng.
   Kiểm chứng trên production (chỉ đọc): `OLDV = [1.4.6 57]` ⇒ `...bak-1.4.6-b57-<ts>.ipa`.

Commit đề nghị:
```
fix(publish-ios): chan so phat hanh TRUOC khi upload + --allow-rehash/--reason/--notes/--evidence + sua ten backup

Buoc ghi so (7c) nam SAU khi da thay file dang phat (4) va PATCH moc (6): neu so tu choi
(cung version khac sha256 - VERSIONING 3.3) thi script chet giua duong, kenh da doi ma so
trong. Them buoc 1e chay release-record --dry-run truoc khi upload. --evidence mac dinh =
file --device-test (truoc day hardcode release/ios/RELEASE_NOTES_<v>.md, khong ton tai).
Sua ten ban sao luu: heredoc trong chuoi nhay kep khong thanh xuong dong => OLDV rong.
```

## C. Luồng session dev — **KHÔNG** gộp vào hai commit trên

`iOS/PrivateVPNPacketTunnel/RampStatus.swift` · `WSRelayClient.swift` · `RelayUDPListener.swift` · `RelayDiagnostics.swift`
là việc **van bộ nhớ / hàng đợi** (`BUG-IOS-JETSAM-001`) của session dev. Cần **session đó xác nhận đã xong** rồi commit riêng.
Lưu ý: `RelayDiagnostics.swift` đổi **sau** lúc đóng gói build 57 (14:31 > 13:55) ⇒ **cây hiện tại ≠ mã của build 57** ở file này.

## D. Luồng macOS 1.4.7 — commit riêng, **không** trộn

`mac/**` · `mac/PrivateVPNMac/NetworkConflictDetector.swift` (mới) · `mac/PrivateVPNMacPacketTunnel/main.swift` (mới) ·
`scripts/mac-sign-notarize.sh` · `scripts/mac-check-profile-entitlements.py` (mới) · `scripts/asc-mac-devid-profiles.mjs` (mới) ·
`docs/MACOS_SIGN_NOTARIZE.md` · `docs/handoff/HANDOFF_PUBLISHER_MACOS_1.4.7_2026-09-26.md` · `scripts/send-mac-correction-2026-09-26.py`.
⚠️ **macOS CHƯA nghiệm thu được** (chủ dự án nói rõ) — commit mã thì được, nhưng **chưa được phát**.

## E. Luồng mac-selfdefense — commit riêng

`scripts/security/mac-selfdefense/**` (README, config.example.json, install.sh, lib/detect.mjs, selfdefense.mjs, test/detect.test.js,
`sync-config-allowlist.py` + test mới). Không liên quan iOS.

## F. Tài liệu / sổ

| path | ghi chú |
|---|---|
| `docs/PUBLISHER_PROCESS.md` | 1 dòng nhật ký §6 cho 26/09 (iOS 1.4.6/57) do publisher ghi |
| `release/releases.jsonl` | dòng `ios 1.4.6 (57)` do `publish-ios.sh` bước 7c ghi |
| `scripts/send-ios-1.4.6-57-announcement.py` | **MỚI** — email build 57 (3 ngôn ngữ) |
| `docs/handoff/HANDOFF_PUBLISHER_IOS_1.4.6_57_2026-09-26.md` | **MỚI** — bàn giao publisher |
| `docs/handoff/HANDOFF_COMMITTER_IOS_1.4.6_57_2026-09-26.md` | **MỚI** — file này |
| `docs/handoff/PLAN_IOS_MACOS_ARCH_REVIEW_2026-09-26.md` | **MỚI** — kế hoạch xử review |
| `docs/handoff/HANDOFF_IOS_MACOS_ARCH_REVIEW_2026-09-26.md` | **đã staged sẵn từ trước** (`A `) |
| `docs/handoff/HANDOFF_IOS_1.4.6_54_2026-09-26.md` · `HANDOFF_PUBLISHER_MACOS_1.4.6_…` | sửa thêm |

## G. ⚠️ Hai khoảng trống quy trình phát hiện hôm nay (không phải việc commit, nhưng phải biết)

1. **`build/` nằm trong `.gitignore`** (`.gitignore:5`). Nghĩa là **mọi file bằng chứng §2c** — kể cả
   `build/ios-146-device-test-57.md` mà dòng sổ vừa trỏ tới — **không được version hoá**. Dòng sổ tham chiếu một
   đường dẫn không tồn tại trong git. Đề nghị: chuyển bằng chứng §2c vào `release/ios/` (đang được version hoá) hoặc
   ghi thêm **sha256 của chính file bằng chứng** vào dòng sổ. **Cần chủ dự án chốt**, đừng tự đổi.
2. **`/v1/app-version` công khai KHÔNG trả `ipa_build`** (đúng như F2 dự kiến). Publisher phải đối chiếu chéo
   (`manifest.plist` + sha file trên node-2 + dòng sổ) mới biết kênh đang phát build nào. Đây là lý do cụ thể để làm **F2**.

## H. Tag

**KHÔNG tạo tag.** `ios-v1.4.6` đang trỏ build 50 (`d3e4eae`); tạo lại là tag trùng. `release-record` cũng đã tự báo
`thieu --commit ⇒ chua tao duoc tag` — **đúng ý đồ** cho lần phát cùng-số-version này.
