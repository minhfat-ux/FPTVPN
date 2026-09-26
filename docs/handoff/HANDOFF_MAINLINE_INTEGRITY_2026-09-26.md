# HANDOFF — Toàn vẹn nhánh `main` (26/09/2026)

> Người lập: harness Mac (agent chính). Trạng thái: **CHẶN** — cần người/committer chốt trước khi merge.
> Mục đích: `origin/main` hiện **KHÔNG** dựng lại được hai bản đang phát hành (iOS 1.4.6/57, macOS 1.4.7/28).

## 1. Sự thật đo được (lệnh + output thật)

```console
$ git rev-parse --short main        # nhánh đang chứa code phát hành
25cf4d4
$ git rev-parse --short origin/main # nhánh committer đang ghi (commit mới nhất 16:31 26/09)
e7734fd

$ git diff --name-status main origin/main | awk '{print $1}' | sort | uniq -c
  35 A      # có trên origin/main, KHÔNG có trên main
  41 D      # có trên main, KHÔNG có trên origin/main
  88 M

$ git diff --stat main origin/main -- iOS mac project.yml | tail -1
 29 files changed, 320 insertions(+), 4838 deletions(-)

$ git show origin/main:project.yml | grep -nE 'PrivateVPNMac:|PrivateVPNMacPacketTunnel:|type: |CURRENT_PROJECT_VERSION: "2?[0-9]+"'
274:  PrivateVPNMac:
301:        MARKETING_VERSION: "1.4.6"
302:        CURRENT_PROJECT_VERSION: "21"
362:  PrivateVPNMacPacketTunnel:
363:    type: app-extension                 <-- bản plugin CŨ (không cài được với profile MAC_APP_DIRECT)
431:        MARKETING_VERSION: "1.4.6"      <-- vẫn là 1.4.6/21 (bản "The application can't be opened")
432:        CURRENT_PROJECT_VERSION: "21"

$ git show main:project.yml | grep -nE 'PrivateVPNMac:|PrivateVPNMacPacketTunnel:|type: |MARKETING_VERSION: "1.4.[67]"|CURRENT_PROJECT_VERSION: "2[18]"'
294:  PrivateVPNMac:
321:        MARKETING_VERSION: "1.4.7"
358:        CURRENT_PROJECT_VERSION: "28"
433:  PrivateVPNMacPacketTunnel:
439:    type: system-extension              <-- bản ĐANG PHÁT HÀNH (đã notarize + staple)
541:        MARKETING_VERSION: "1.4.7"
548:        CURRENT_PROJECT_VERSION: "28"

$ git ls-tree --name-only origin/main mac/PrivateVPNMacPacketTunnel/
mac/PrivateVPNMacPacketTunnel/Info.plist
mac/PrivateVPNMacPacketTunnel/PrivateVPNMacPacketTunnel.entitlements
# ^ THIẾU main.swift  ⇒ không có điểm vào System Extension
```

## 2. Hệ quả

1. `origin/main` ghi trong sổ phát hành (`e7734fd`) rằng **macOS 1.4.7/28 đã phát hành**, nhưng cây nguồn
   tại chính commit đó vẫn là **macOS 1.4.6/21 / `type: app-extension`** — đúng bản bị lỗi
   *"The application VPNFlow can't be opened"* (profile `MAC_APP_DIRECT` chỉ cấp quyền `*-systemextension`).
   → Ai build macOS từ `main` sẽ **tái tạo lại lỗi cũ**.
2. 41 file có trên `main` nhưng **không** có trên `origin/main`, trong đó có **cổng phát hành bắt buộc**:
   `scripts/ios-verify-ipa.sh`, `scripts/ios-lint-locks.py`, `scripts/clean-build-cache.sh`,
   `scripts/ios-acceptance-pull.sh`, `scripts/mac-check-profile-entitlements.py`,
   cùng code đã nghiệm thu trên máy thật: `iOS/PrivateVPNPacketTunnel/IPv6Reject.swift`,
   `mac/PrivateVPNMacPacketTunnel/main.swift`, `mac/PrivateVPNMac/NetworkConflictDetector.swift`,
   `mac/PrivateVPNMac/NetworkConflictProbe.swift`, `iOS/PrivateVPN/Services/AppDiagnostics.swift`.
3. 29 file iOS/mac trên `origin/main` **thiếu 4.838 dòng** so với `main`; ví dụ
   `LivenessWatchdog.swift` 340 dòng (origin) vs 628 dòng (main),
   và **không có** `RelayFailoverWatch`/`RelayUnreachableWatch`/`advanceRelayCandidate`/`rejectIPv6`.
4. `origin/main` **có** phần việc mới mà `main` không có (35 file): trang `/buy` (vùng bảo vệ của harness
   Windows), Windows/Android release notes + email, `docs/WINDOWS_CODE_SIGNING.md`, tối ưu ảnh +
   Cache-Control cho web. Phần này **phải giữ**.

## 3. Việc đã làm để không mất code

- `main` (25cf4d4) đã được đẩy lên remote dưới nhánh **`macos-147-28`**
  (`git ls-remote origin refs/heads/macos-147-28` → `25cf4d4a760711da3882e3d85a04a2d7e9d0cf21`).
- Không sửa/không ép `main`. Không rebase `main`.
- Thử `git cherry-pick 25cf4d4` lên `origin/main` (nhánh tạm, đã xoá): xung đột ở 5 file
  (`AGENTS.md`, `LivenessWatchdog.swift`, `HysteriaTransport.swift`,
  `HysteriaPacketTunnelProvider.swift`, `scripts/mac-sign-notarize.sh`) vì `origin/main` là bản **cũ hơn**
  của chính các file đó (ví dụ `mac-sign-notarize.sh` bên origin còn đường ký `.appex` kiểu cũ).

## 4. Đề xuất (chọn một)

- **A (khuyến nghị)** — Merge một chiều để `main` thành **superset**:
  `git checkout main && git merge origin/main`, xử lý 5 file xung đột theo hướng **giữ bản của `main`**
  (bản đã nghiệm thu + notarize), giữ nguyên 35 file mới của origin. Sau đó chạy lại cổng
  (`bash scripts/ios-pure-logic-tests/run.sh`, `python3 scripts/ios-lint-locks.py`) rồi mới push `main`.
- **B** — Coi `macos-147-28` là nguồn: committer đưa nhánh này vào `main` rồi áp lại 35 file mới của origin
  lên trên.

Cả hai đều **không được** để `main` giữ `type: app-extension` cho `PrivateVPNMacPacketTunnel`.

## 5. Chưa chắc / việc còn lại

- Chưa đối chiếu từng dòng 320 dòng "origin có mà main không" trong 29 file iOS/mac → cần review khi merge.
- SSH tới node-1/node-2 đang hỏng (TCP mở, banner không về — sshd rơi kết nối dưới đợt quét),
  nên **chưa gửi được** thư bàn giao vào `/var/lib/flowvpn-coord/inbox/{mac,committer}` và Telegram.
- Không đụng tới vùng bảo vệ `control-plane/src/**` (owner `windows`).
