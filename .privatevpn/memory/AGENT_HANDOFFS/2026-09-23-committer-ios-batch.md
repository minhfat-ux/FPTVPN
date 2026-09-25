# Bàn giao → COMMITTER (iOS batch) — 23/09/2026

> Viết vào repo vì kênh inbox (node-2:22) **không gửi được từ Mac** lúc này: WiFi công ty chặn cổng 22
> (đã kiểm: `api.meetflowai.site:443` → 200, `fbuddy.meetflowai.site/agent-bus` → 200, nhưng
> `165.101.114.162:22` và `103.173.155.50:22` đều timeout). Khi Mac sang mạng khác, bản này sẽ được
> gửi lại qua `flowvpn-notify --to committer`.

## Cây làm việc hiện tại

- **34 file chưa commit** (tăng từ 23 — phiên làm việc song song trên máy Mac vẫn đang sửa).
- Báo cáo kỹ thuật đầy đủ: `.privatevpn/memory/AGENT_HANDOFFS/2026-09-23-ios-connect-mtu-watchdog.md`

## 2 commit của Mac CHƯA lên `origin/main`

| Commit | Nội dung | Nhánh đã push |
|---|---|---|
| `6fa8b1a` | fix(ios): MTU 1500 → **1300** + resolver thứ 2 (`8.8.8.8`) | `mac/ios-mtu-1300` |
| `ff08f5b` | fix(ios): watchdog sống-còn không còn im lặng + tự bật lại | `mac/watchdog-liveness-fix` |

`origin/main` hiện ở `9266366`. Push kế tiếp sẽ mang 2 commit trên lên; sau khi push kiểm
`git log --oneline origin/main | head`.

## Hai điều PHẢI giữ

1. **ĐỪNG `git add -A`** — sẽ cuốn `.privatevpn/tmp/` và artifact build. Commit theo nhóm:
   (a) fix tunnel iOS · (b) docs · (c) version bump `project.yml` 1.4.3/20 · (d) báo cáo handoff.
2. Cây đang được sửa song song ⇒ **luôn `git diff --cached` trước khi commit** để không commit trạng
   thái dở dang của phiên khác.

## Bằng chứng (không có bằng chứng = chưa xong)

- iPhone thật: MTU 1500 → 661 KB/17 phút, `observed≈0`; MTU 1300 → **37,3 MB tải về**, `observed`
  5404 kbps, gói bỏ **0,6%**.
- `swiftc -parse` OK cả `arm64-apple-macos14.0` và `arm64-apple-ios17.0`.
- `scripts/ios-pure-logic-tests/run.sh` → **258/258 PASS, 0 FAIL**.
- `ARCHIVE SUCCEEDED` + `EXPORT SUCCEEDED` bản **1.4.3/20** (credential hysteria có trong IPA).

---

## CẬP NHẬT 24/09/2026 — đã PHÁT HÀNH iOS 1.4.4 (21) (harness Mac)

Đã phát lên trang buy lúc 13:14 (giờ máy Mac). Bằng chứng: `docs/RELEASE_NOTES_IOS_1.4.4.md`,
`docs/RELEASE_ARTIFACTS_2026-09-24.md`, `docs/PUBLISHER_PROCESS.md` §6.

### File cần commit trong đợt của committer (chưa nằm trong batch 23/09)

| File | Nội dung | Ghi chú |
|---|---|---|
| `project.yml` | iOS: `MARKETING_VERSION` 1.4.3→**1.4.4**, `CURRENT_PROJECT_VERSION` 20→**21** (+ comment lý do) | **2 chỗ**: target `PrivateVPN` (≈dòng 95) và `PrivateVPNPacketTunnel` (≈dòng 189). Lưu ý file này còn thay đổi **macOS 1.4.0/14 → 1.4.3/20 của phiên song song** — không phải của tôi |
| `iOS/PrivateVPNPacketTunnel/HysteriaPacketTunnelProvider.swift` | 4 điểm sửa **đường hiển thị** Diagnostics: `liveDownWindow`/`liveUpWindow` (trung bình 3 mẫu, chỉ để hiển thị), `hasServedThisSession`, `serving: hasServedThisSession`, `display.declaredDownKbps/UpKbps = activeDownKbps/activeUpKbps` | của tôi (mtime 24/09 11:06). Cùng file có port `BandwidthPolicy` của phiên song song (23/09 16:24–16:49) — **đừng gộp nhầm thành 1 thay đổi** |
| `docs/RELEASE_NOTES_IOS_1.4.4.md` | release notes mới | |
| `docs/RELEASE_ARTIFACTS_2026-09-24.md` | manifest artifact (sha256/size/version/mốc/backup) | |
| `docs/PUBLISHER_PROCESS.md` | §6: 2 dòng nhật ký (backfill 1.4.3/20 + phát 1.4.4/21) | |
| `release/releases.jsonl` | 2 dòng mới: `ios 1.4.3 (20)` backfill + `ios 1.4.4 (21)` | **phải commit** — sổ phát hành là nguồn sự thật (`docs/VERSIONING.md`) |

### Việc bắt buộc sau khi commit (để sổ đủ điều kiện)

```bash
# 1) ghi bù commit + người kiểm (sau khi chủ dự án xác nhận §2c trên iPhone)
node scripts/release-record.mjs append --platform ios --version 1.4.4 --build 21 \
  --sha256 c7b540d15d5b4e4073b67074c5776458119aa59319dcdc80c57b23dd75f95dc5 --size 8162432 \
  --marker-latest 1.4.4 --marker-build 21 --internal-version 1.4.4 --internal-build 21 \
  --verified-by "<model iPhone / iOS>" --evidence docs/RELEASE_ARTIFACTS_2026-09-24.md \
  --origin backfill --commit <sha-commit-chua-cay-iOS>
# 2) tag neo commit build
node scripts/release-record.mjs tag --platform ios
node scripts/release-record.mjs verify --platform ios
```

⚠️ **Cảnh báo provenance**: IPA 1.4.4 được build từ **cây bẩn** (34+ file chưa commit, gồm cả port
`BandwidthPolicy` của phiên song song). Bản **đang phát 1.4.3 (20) cũng đã chứa port đó** (đo được:
`__text` extension 4.683.636 B ở 1.4.3 vs 4.684.852 B ở 1.4.4 = **+1.216 B**, đúng phạm vi 4 điểm hiển
thị) ⇒ bản mới **không** mang thêm 2.000 dòng chưa ai kiểm cho khách. Nếu muốn tag chính xác tuyệt đối,
cần commit cây iOS **đúng trạng thái đã build** rồi ghi `--commit` — đừng tag HEAD cũ.
