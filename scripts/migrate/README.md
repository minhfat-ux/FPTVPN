# Migrate toàn bộ workspace Mac harness sang SSD mới

> Bộ này bắt nguồn từ `/Volumes/BIWIN/_migrate/` (dựng 23/09/2026) — **nay đã đưa vào repo**.
> Lý do đưa vào repo: bản gốc nằm **trên chính ổ sắp bị migrate**; ổ chết hay bị wipe là mất luôn
> kế hoạch. Copy trong repo cũng để `git` giữ lịch sử sửa đổi.

Ổ đích: **APFS (case-insensitive) + GPT**, đặt tên tạm `BIWIN_NEW` rồi **đổi về `BIWIN`** ở bước
cutover để **giữ nguyên mọi đường dẫn tuyệt đối** (286 tham chiếu `/Volumes/BIWIN/SourcesCode`,
80 `/Volumes/BIWIN/FlowGPT`, 12 `/Volumes/BIWIN/IoSApps`, cộng session history của DSH khoá theo path).

## 0. Số liệu đo trên ổ cũ

| Mục | Dung lượng |
|---|---|
| `/Volumes/BIWIN` | 466 GB, **đã dùng 430 GB / còn 36 GB (93%)** — đo 29/09 |
| `SourcesCode` (12 workspace + `_quarantine`) | ~370 GB (đo 23/09) |
| `Xcode`, `Archives`, `AppBuild`, `DerivedData` | ~41 GB |
| 4 thư mục `apk-android-*` + `apk-fptplay-latest` | ~865 MB (rác, bỏ được) |
| `Desktop.dmg` + `VPNFlow-dev-33.apk` + 2 ảnh rời | ~250 MB (rác) |
| `/System/Volumes/Data` (đĩa trong) | **197 GB / còn 5.5 GB (98%)** ← chật hơn cả BIWIN |

**Dọn trước khi copy là bắt buộc**, không chỉ cho gọn: `03-verify.sh` cần chỗ để ghi log, và bước
B4 build lại `node_modules`/`DerivedData` cần rất nhiều chỗ.

## 1. Thứ tự chạy

| Bước | Việc | Lệnh |
|---|---|---|
| **B0** | Kiểm tra + **dừng harness** | `./00-harness-preflight.sh` → `./00-harness-preflight.sh --stop` |
| B1 | Format SSD mới | `./01-format-new-ssd.sh /dev/diskN` |
| B2 | Copy | `DST=/Volumes/BIWIN_NEW RSYNC=/opt/homebrew/bin/rsync ./02-copy.sh` |
| B3 | Đối chiếu | `DST=/Volumes/BIWIN_NEW RSYNC=/opt/homebrew/bin/rsync ./03-verify.sh` |
| B4 | Build lại trên ổ mới | `pnpm i` / `npm ci` / build lại |
| B5 | Cutover (đổi tên thành `BIWIN`) | `./04-cutover.sh` |
| **B6** | Kiểm tra tham chiếu + **bật lại harness** | `./05-harness-postflight.sh` |
| B7 | Giữ ổ cũ read-only 1–2 tuần, **chưa format** | — |

Chạy thử copy trước: `DRY=1 DST=/Volumes/BIWIN_NEW RSYNC=/opt/homebrew/bin/rsync ./02-copy.sh`

### Bắt buộc: GNU rsync

macOS 26 chỉ có **openrsync 2.6.9**, thiếu `-X` (xattr) và `-A` (ACL) — dùng nó là **mất exec bit
và resource fork**. `02-copy.sh` từ chối chạy nếu không phải GNU rsync 3.x:

```bash
brew install rsync          # ⇒ /opt/homebrew/bin/rsync
```

### Chạy B0 từ NGOÀI ổ

`00-harness-preflight.sh` liệt kê tiến trình có **thư mục làm việc** trong `/Volumes/BIWIN`. Nếu
anh chạy nó từ trong repo thì chính shell/agent đang chạy lệnh cũng nằm trong danh sách và
không bao giờ sạch. Hãy `cd ~` trước.

### MODE=code (mặc định) bỏ gì

`node_modules/`, `.venv/`, `DerivedData/`, `.build/`, `Pods/`, `.next/`, `.turbo/`, `*.dSYM/`,
`xcuserdata/` — theo `exclude-rebuildable.txt`. Lý do: **exFAT đã phá symlink/exec bit/hardlink**
bên trong các thư mục này, và hardlink của pnpm không dùng chung được giữa hai filesystem. Copy
nguyên trạng chúng là copy hỏng. Muốn copy tất: `MODE=full`.

Luôn bỏ (cả `MODE=full`): `._*` AppleDouble, `.DS_Store`, `.Spotlight-V100`, `.fseventsd`… —
xem `exclude-junk.txt`.

## 2. Phần đặc thù máy Mac harness (00 và 05)

Máy này có **7 LaunchAgent** + **2 dòng crontab** + session DSH đang ghi vào ổ. `02-copy.sh` chỉ
in lời nhắc "đã dừng DSH chưa?", nên `00-harness-preflight.sh` làm việc đó bằng máy móc:

| Job | Đụng BIWIN? | Ghi chú |
|---|---|---|
| `site.meetflowai.mac-selfdefense` (+ `-watchdog`) | **CÓ** | đọc/ghi vault `SourcesCode/_quarantine` |
| `com.dsh.tunnel`, `net.flowtech.notify-poller`, `net.flowtech.keepawake`, `site.meetflowai.harness-patches`, `ai.hermes.gateway` | không | `LAUNCHD_MODE=all` nếu muốn dừng hết |

`--stop` cũng **sao lưu crontab** vào `~/.migrate-crontab.bak` rồi bỏ các dòng chạm `/Volumes/BIWIN`;
`--resume` (hoặc `05-...`) bật lại và khôi phục crontab.

## 3. Rủi ro & rollback

- **Không** kéo-thả bằng Finder, **không** dùng `/usr/bin/rsync`. Cả hai đều mất metadata và báo
  lỗi mơ hồ.
- Copy khi Xcode/IDE/DSH còn ghi vào ổ ⇒ dữ liệu lệch. B0 chặn việc này.
- Ổ cũ ExFAT **không journaling** và đã 93%: **sao lưu thứ quan trọng trước**, phòng ổ chết giữa chừng.
- Ổ đích nên ≥ 1 TB (2 TB tốt hơn); SSD nên giữ ≥ 20% trống cho controller.
- **Không chuyển `~/.dsh` sang ổ ngoài**: rút ổ giữa session có thể hỏng session, và sandbox
  `workspace-write` của DSH bám theo path workspace.
- **Rollback**: cắm lại ổ cũ (đừng format) và `diskutil rename` ngược lại. Vì vậy B7 bắt buộc.

## 4. Checklist trước khi rút ổ cũ

- [ ] `03-verify.sh` không báo lệch
- [ ] `git fsck` sạch trên các repo trong `SourcesCode`
- [ ] Build lại + chạy test ít nhất các repo đang làm việc
- [ ] `05-harness-postflight.sh` không có mục nào đánh dấu LỖI
- [ ] `df -h /Volumes/BIWIN` thấy SSD mới (~1 TB)
- [ ] Mở 1 session DSH mới trong workspace, xác nhận history/đường dẫn vẫn nhận
- [ ] Ổ cũ đã eject, cất riêng, **chưa format**
