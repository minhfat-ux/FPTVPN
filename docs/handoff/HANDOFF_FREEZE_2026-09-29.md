# ĐÓNG BĂNG SOURCE — 29/09/2026 (chốt của chủ dự án)

**Chủ dự án:** *"Publish xong hết thì đóng băng toàn bộ source hiện tại, giao cho committer kiểm tra lại git và GitHub và commit hết."*

## 1. Mốc đóng băng

| Hạng mục | Giá trị |
|---|---|
| **Mốc đóng băng (origin/main)** | **`047f2ad`** — tag `freeze-2026-09-29` |
| Nhánh phát hành macOS | `macos-publish-31` = `047f2ad` |
| Nhánh hợp nhất | `merge-27` = `6a9f47d` (giữ để so lại) |
| Nhánh việc macOS | `macos-147-28` = `bf70ed5` (bản cũ, chỉ để tra cứu) |
| Bản vá khẩn | `e16378d` (khoá cửa đi thẳng — bản 30 làm mất mạng) |

## 2. Kênh đang phát tại mốc này

- **macOS 1.4.7 build 31** — DMG `24.648.499 B` · sha256 `6dc218cb08126a4244f8b399d36447198d6697560c9da12f2cc7b5ce1913f093`
  · `/root/flowvpn-mac/VPNFlow-mac.dmg` · cổng pre + post **ĐẠT** · tải thật qua `t1` khớp sha
  · mốc API `latest_mac_version = minimum_mac_version = 1.4.7` · backup bản 28: `VPNFlow-mac.bak-1.4.7-b28-20260929-063935.dmg`
- **iOS 1.4.6 build 57** — IPA `8.210.605 B` · sha256 `a4fec707…442a30` (đã phát 26/09, đang phục vụ)
- **Khoá kênh**: `release/release-lock.json` **không còn khoá macOS** (đã mở có ghi lịch sử để phát bản vá); luật 15 vẫn hiệu lực cho lần sau.

## 3. Nguồn đóng băng nghĩa là gì

1. **Không sửa/thêm commit vào source** (trừ khi chủ dự án cho phép rõ ràng). Mọi sửa đổi tiếp theo phải là **build mới (32+)** và đi đủ quy trình phát hành.
2. Build dùng để phát **phải dựng từ đúng mốc `047f2ad`** (`git worktree add --detach <mốc>`), không dựng từ cây làm việc còn thay đổi.
3. Bản **30 bị BỎ VĨNH VIỄN** (lỗi mất sạch mạng); cửa đi thẳng đã bị tắt trong code (`enableDirectCandidate = false`) — chỉ bật lại khi đã dừng hẳn client cũ và đo lại **cả ca dựng lại transport giữa phiên**.

## 4. Việc committer phải làm (theo lệnh chủ dự án)

- `git fetch` → đưa **main local** (đang `3a6a992`, **behind 11**) lên đúng `origin/main` (`047f2ad`).
- **Commit hết** phần còn dư trong cây làm việc (kiểm chủ sở hữu trước khi commit):
  - `scripts/security/mac-selfdefense/{README.md,config.example.json,install.sh,lib/detect.mjs,selfdefense.mjs,test/detect.test.js}` + `test/config-defaults.test.js` (**của agent phòng thủ** — hỏi họ trước) + `scripts/migrate/` (mới).
  - 4 file đã được đẩy lên `origin/main` bằng đường khác (`.privatevpn/status/release-lock.json`, `iOS/PrivateVPN/Services/HysteriaDefaults.swift`, `release/releases.jsonl`, `scripts/ios-pure-logic-tests/main.swift`) — **không commit lại**, chỉ cần cập nhật cây.
- Đối chiếu **GitHub**: `origin/main` = `047f2ad`, các nhánh phụ đã đẩy, tag `freeze-2026-09-29` có mặt; không nhánh nào còn commit chưa đẩy.
- Báo lại: danh sách commit + hash, nhánh/tag đã đẩy, và những gì **cố ý không** commit (kèm lý do).
