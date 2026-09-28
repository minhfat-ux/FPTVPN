# HANDOFF — iOS **1.4.4 (21)** ĐÃ PHÁT HÀNH (24/09/2026)

> Đọc kèm: `docs/RELEASE_NOTES_IOS_1.4.4.md` · `docs/RELEASE_ARTIFACTS_2026-09-24.md` ·
> `docs/PUBLISHER_PROCESS.md` §6 · sổ `release/releases.jsonl`.

## Đã phát gì

| | |
|---|---|
| Kênh | iOS ad-hoc — trang buy, route `GET /v1/downloads/ios` (`/root/flowvpn-ipa/VPNFlow-latest.ipa`) |
| Version | **1.4.4 (build 21)** — app và appex đều `1.4.4/21` (đọc từ trong IPA) |
| IPA | 8.162.432 B · sha256 `c7b540d15d5b4e4073b67074c5776458119aa59319dcdc80c57b23dd75f95dc5` |
| Mốc control-plane | `latest_ios_version=1.4.4` · `ipa_build=21` · `minimum_version` **giữ 1.3.3** (không ép cập nhật) |
| Profile ad-hoc | 9 UDID · `get-task-allow=false` · không nhóm keychain dùng chung |
| Backup rollback | `/root/flowvpn-ipa/VPNFlow-latest.bak-1.4.3-b20-20260924-131447.ipa` (sha256 `b2432247…`) |
| Cổng chặn | trước upload **ĐẠT** · sau upload `--mode post` **ĐẠT** |
| Nội dung | **CHỈ** đường hiển thị thẻ Diagnostics (3 điểm). Đo binary: `__text` extension **+1.216 B** |

## Vì sao 1.4.4 mà không phát lại 1.4.3

Bản 1.4.3 (20) đã phát lúc 07:53 (+07) nhưng **thiếu dòng sổ**; bản sửa Diagnostics cùng số 1.4.3
nhưng khác sha256 ⇒ vi phạm artifact bất biến (`docs/VERSIONING.md` §3.3) ⇒ **phải tăng số**. Sổ đã
được backfill dòng `ios 1.4.3 (20)` (`--origin backfill`).

## Việc còn lại

1. **§2c (chủ dự án)**: cài OTA từ <https://t1.meetflowai.site/install/ios> rồi xác nhận 7 mục trên
   iPhone thật (thẻ Diagnostics có số sau khi connect; số cùng bậc với Ookla; đổi Wi-Fi↔4G; watchdog
   không báo oan; Settings hiện `1.4.4 (21)`).
2. **Committer**: commit 6 file trong cây (danh sách chi tiết + lệnh ghi bù `--commit`/tag nằm ở
   `.privatevpn/memory/AGENT_HANDOFFS/2026-09-23-committer-ios-batch.md` §*CẬP NHẬT 24/09*):
   `project.yml` (2 chỗ iOS), `iOS/PrivateVPNPacketTunnel/HysteriaPacketTunnelProvider.swift`
   (4 điểm hiển thị của harness Mac), `docs/RELEASE_NOTES_IOS_1.4.4.md`,
   `docs/RELEASE_ARTIFACTS_2026-09-24.md`, `docs/PUBLISHER_PROCESS.md`, `release/releases.jsonl`.
   Sau đó: `release-record.mjs append … --commit <sha>` + `release-record.mjs tag --platform ios`.
3. **Email thông báo khách iOS**: **CHƯA GỬI** — chờ chủ dự án chốt (khách vừa nhận email 1.4.3 cùng ngày).
4. **Drift đã biết**: `diawi_url` trong app_config vẫn trỏ bản Diawi cũ (`https://i.diawi.com/7WTMjp`,
   nút "kênh dự phòng" trên `/install/ios`) — không chặn đường cài chính; nên rà lại khi có thời gian.
