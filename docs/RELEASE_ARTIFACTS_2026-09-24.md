# Bản dựng sẵn để phát hành — 24/09/2026

Bảng này là nguồn số liệu để publisher đặt file + set mốc phiên bản (`PUBLISHER_PROCESS.md` §2b).
Quy trình chung: `docs/RELEASE_RUNBOOK.md` §3. Kênh khác trong ngày xem `release/releases.jsonl`.

## iOS 1.4.4 (build 21) — IPA ad-hoc  ⬅️ ĐÃ PHÁT 24/09/2026

| | |
|---|---|
| File (máy build Mac) | `build/ios-adhoc-export/ipa/FlowVPN.ipa` |
| Kích thước | 8.162.432 bytes |
| sha256 | `c7b540d15d5b4e4073b67074c5776458119aa59319dcdc80c57b23dd75f95dc5` |
| md5 (script export in) | `681b18abfc605efbf42fbe6f702d23cc` |
| Version trong IPA (đọc bằng `PlistBuddy` **bên trong** file) | app `1.4.4/21` · appex `com.privatevpn.app.packet-tunnel` `1.4.4/21` |
| Ký | Ad Hoc · Team `G6XW3RN6LJ` · profile `VPNFlow AdHoc App` · **9 UDID** · `get-task-allow=false` · **không** có nhóm keychain `com.privatevpn.shared` |
| Credential hysteria2 | có trong `Info.plist` của app (21 ký tự, khớp `scripts/dev-hysteria-build-env.sh`) |
| Release notes | `docs/RELEASE_NOTES_IOS_1.4.4.md` |
| Đích trên node-2 | `/root/flowvpn-ipa/VPNFlow-latest.ipa` (route `GET /v1/downloads/ios`) |
| Mốc phiên bản | `latest_version=1.4.4` · `ipa_build=21` · `minimum_version` **giữ 1.3.3** (không ép cập nhật) |
| Cổng chặn | trước upload **ĐẠT** (exit 0) · sau upload `--mode post` **ĐẠT** |
| Backup bản cũ | `/root/flowvpn-ipa/VPNFlow-latest.bak-1.4.3-b20-20260924-131447.ipa` |
| §2c (test iPhone thật, 7 mục) | **CHỜ chủ dự án xác nhận** sau khi cài OTA — xem release notes §2c |

Nội dung: **chỉ sửa đường hiển thị thẻ Diagnostics** — (1) giữ `serving=true` suốt phiên nên thẻ không
trắng số sau khi VPN tự dựng lại đường, (2) số live lấy trung bình 3 mẫu thay vì 1 mẫu, (3) "Khai báo
hiện tại" in số **đang áp dụng** thay vì số kế hoạch. Đo trên binary: `__text` extension **+1.216 byte**
so với bản đang phát (đúng phạm vi 3 điểm, không đổi ramp/transport/watchdog/MTU/DNS/entitlements).

## iOS 1.4.3 (build 20) — bản ĐANG PHÁT TRƯỚC ĐÓ (backfill sổ)

| | |
|---|---|
| Đích trên node-2 | `/root/flowvpn-ipa/VPNFlow-latest.ipa` (đã bị 1.4.4 thay thế) |
| Kích thước | 8.175.010 bytes |
| sha256 | `b2432247407e6e46fee80da4d444adc4a4c0092fa22b7e851cc0df79e9282bc1` |
| mtime trên server | `2026-09-24T00:53:05Z` (07:53 giờ server +07) |
| Version trong IPA | app `1.4.3/20` · appex `1.4.3/20` (đọc từ chính file đang phát) |
| Ghi chú | Phát lúc 07:53 (+07) nhưng **thiếu dòng sổ** — đã backfill khi phát 1.4.4 (`--origin backfill`) |

> Thứ tự 24/09: 1.4.3 (20) → **1.4.4 (21)**. Không có bản nào khác của iOS trong ngày.
