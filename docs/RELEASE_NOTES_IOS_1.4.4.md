# VPNFlow iOS 1.4.4 (build 21) — release notes

> Ngày phát hành: 24/09/2026 · Nền tảng: **iOS** (IPA ad-hoc, trang buy) · Người phát hành: harness Mac
> Nguồn version: `project.yml` (`MARKETING_VERSION` / `CURRENT_PROJECT_VERSION`)
> Quy trình: `docs/PUBLISHER_PROCESS.md` §0/§1 · Sổ phát hành: `release/releases.jsonl` (`docs/VERSIONING.md`)
> Thay thế bản đang phát: **1.4.3 (20)** — sha256 `b2432247…`, 8.175.010 B, mtime `2026-09-24T00:53:05Z`

## Vì sao có 1.4.4 (không phát lại số 1.4.3)

Bản 1.4.3 (20) đã phát cho khách nhưng **chưa có dòng trong sổ phát hành**. Bản này (cùng số 1.4.3,
khác nội dung ⇒ khác sha256) **không được phát lại** theo `docs/VERSIONING.md` §3.3 — *một cặp
`(platform, version)` chỉ ứng với một `sha256`* — nên phải **tăng số version**. Sổ đã được backfill
dòng `ios 1.4.3 (20)` ngay khi phát 1.4.4.

## Sửa lỗi — CHỈ đường HIỂN THỊ của thẻ Diagnostics

Chủ dự án báo: *"thông số diagnostics chưa chính xác — hiện lên khi connect, sau đó không có thông số;
các thông số down/up không đúng với thông số đo từ Ookla"*. Ba nguyên nhân gốc, cả ba đều thuộc đường
hiển thị:

| # | Triệu chứng khách thấy | Nguyên nhân gốc | Sửa |
|---|---|---|---|
| 1 | Vào thẻ Diagnostics **sau khi VPN tự dựng lại đường**: mọi số thành `—` | `serving` suy ra từ **bộ đếm của transport hiện tại**; đổi transport ⇒ bộ đếm về 0 ⇒ `serving=false`, mà UI (`iOS/PrivateVPN/ContentView.swift:713`) trả `—` cho mọi số khi `serving != true` | thêm `hasServedThisSession`: đã từng chở byte trong **phiên** thì giữ `serving=true` |
| 2 | Số down/up "live" nhảy loạn, lệch xa Ookla | lấy **1 mẫu delta 1 giây** | cửa sổ **3 mẫu** lấy trung bình — **chỉ cho số hiển thị**; log `bw: sample` vẫn in số 1 giây thô để đối chiếu được với Android |
| 3 | "Khai báo hiện tại" hiện **số kế hoạch**, không phải số đang áp dụng | thẻ đọc `bandwidth.downKbps/upKbps` (plan) | đọc `activeDownKbps/activeUpKbps` (số Go đang thực dùng). Bằng chứng log thật 23/09: `declared up=1431 down=4773 … plan=up1002/down3341 apply=pending` |

**Không đụng tới**: vòng ramp/băng thông, chọn transport, watchdog, MTU (1300), DNS, entitlements/keychain.
Đo trên chính binary: `__text` của extension **+1.216 byte** so với bản đang phát — khớp đúng phạm vi
3 điểm trên, không phải thay đổi chức năng nào khác.

## Bằng chứng phát hành

| Hạng mục | Kết quả |
|---|---|
| Kiểm cú pháp Swift (`swiftc -parse`, arm64-apple-macos14.0 + arm64-apple-ios17.0) | exit 0 |
| Test logic thuần `scripts/ios-pure-logic-tests/run.sh` | **289/289 PASS** |
| Archive / Export | `** ARCHIVE SUCCEEDED **` · export ký tay bằng profile tạo qua App Store Connect API |
| Cổng chặn trước upload (`--platform ios`) | **ĐẠT** (exit 0) — 1 cảnh báo đúng thiết kế (extension không khai credential trong Info.plist; app truyền qua `providerConfiguration`) |
| Cổng chặn sau upload (`--mode post`) | **ĐẠT** — mốc `1.4.4` = bản đang phát, route trả 8.162.432 B |
| IPA | sha256 `c7b540d15d5b4e4073b67074c5776458119aa59319dcdc80c57b23dd75f95dc5` · 8.162.432 B · app **và** appex đều `1.4.4 (21)` |
| Profile ad-hoc trong IPA | 9 UDID · `get-task-allow=false` · **không** có nhóm keychain `com.privatevpn.shared` |
| Credential hysteria2 | **có** (21 ký tự) trong `Info.plist` của app — khớp `dev-hysteria-build-env.sh` |
| Mốc control-plane | `latest_version=1.4.4`, `ipa_build=21`, `minimum_version` **giữ 1.3.3** (không ép cập nhật) |
| Manifest OTA `/install/ios/manifest.plist` | `bundle-version 21`, URL `/v1/downloads/ios` |
| Tải thật qua `t1` | size 8.162.432 · sha256 khớp bản phát hành |
| Rollback | `/root/flowvpn-ipa/VPNFlow-latest.bak-1.4.3-b20-20260924-131447.ipa` (sha256 `b2432247…`) |

## §2c — test iPhone THẬT (7 mục)

> **Trạng thái: CHỜ CHỦ DỰ ÁN XÁC NHẬN.** Chủ dự án chốt *"phát hành chính thức luôn"* (24/09) sau khi
> đường deploy không dây không khả dụng (iPhone không quảng bá `_apple-mobdev2._tcp`; iPad/iPhone đều
> `unavailable`), nên bản này **phát trước, test máy thật ngay sau khi cài OTA** — đúng thứ tự đã dùng
> cho 1.4.2 (19). Phạm vi ảnh hưởng hẹp: chỉ máy có UDID trong profile (9 máy) cài được, và
> `minimum_version` giữ 1.3.3 nên **không ép cập nhật** bất kỳ ai.
> Kết quả 7 mục sẽ được ghi **bổ sung** vào sổ phát hành (`--verified-by` + `--evidence`).

## Việc còn lại
- [ ] Chủ dự án xác nhận §2c trên iPhone: thẻ Diagnostics có số sau khi connect, số khớp Ookla (cùng bậc),
      đổi Wi-Fi↔4G, watchdog không báo oan, Settings hiện đúng 1.4.4 (21).
- [ ] Ghi bổ sung sổ phát hành: `--verified-by` + `--evidence`.
- [ ] Commit cây làm việc rồi bổ sung `--commit` + tạo tag `ios-v1.4.4` (tag phải neo commit build).
- [ ] Cân nhắc email thông báo khách iOS (**chưa gửi** — chờ chủ dự án chốt).
