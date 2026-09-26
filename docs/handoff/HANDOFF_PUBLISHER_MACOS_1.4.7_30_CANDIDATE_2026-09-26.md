# BÀN GIAO PUBLISHER — macOS 1.4.7 build 30 (ứng viên, CHỜ chủ dự án xác nhận 27/09/2026)

**Trạng thái: CHƯA ĐƯỢC PHÉP PHÁT.** Chủ dự án chốt trong phiên 26/09/2026 tối:
> *"trả lời publisher, mai sẽ xác nhận bản build 30 để phát hành, giờ đang load test"*

⇒ **Kênh macOS vẫn KHOÁ ở 1.4.7/28.** Không phát gì cho tới khi chủ dự án xác nhận (dự kiến 27/09/2026).
Chủ dự án đang **load test** — đừng đụng vào kênh/nút phát hành trong lúc test.

## 1. Build 30 có gì (so với 28 đang phát)

1. **Hết báo `Blocking` OAN lên chính tunnel của mình** (mức `high`, khách thấy hộp thoại doạ "hãy TẮT VPN kia"):
   log bản 28 ghi `conflict [Blocking] … utun8 (default route IPv4, gateway 100.100.100.101)` trong khi
   `100.100.100.101` chính là địa chỉ utun VPNFlow ⇒ khách hoang mang, bấm loạn, tunnel bị ngắt rồi đi thẳng.
   Sửa: nhận diện interface của mình **bằng cả gateway của default route** + **không bao giờ** doạ `Blocking`
   khi tunnel mình đang Connected (hạ `Info`). Log bản 30: **0 dòng Blocking**.
2. **Thử ĐƯỜNG THẲNG (UDP/QUIC tới node, không qua Cloudflare) TRƯỚC, fallback về Cloudflare** (chốt của chủ dự án).
   Đo thật trên mạng chủ dự án: đường thẳng **bị chặn** (3 cổng `8443/28443/54443` × 2 node đều
   `FATAL … connect error: timeout`) ⇒ fallback chạy trong **1,4 s**. Log thật:
   `23:34:09 cửa đi thẳng 165.101.114.162:8443 hỏng … thử cửa kế tiếp` → `23:34:10 ws-relay: handshake ok (Cloudflare)`.
   Công tắc `HysteriaDefaults.directFirst` (mặc định `true`).

## 2. Bằng chứng đã chạy trên máy thật (26/09/2026)

| Hạng mục | Kết quả |
|---|---|
| Cổng thuần logic | `bash scripts/ios-pure-logic-tests/run.sh` → **667/667 PASS** (5 ca mới khoá thứ tự cửa) |
| Lint khoá lồng nhau | `python3 scripts/ios-lint-locks.py` → **ĐẠT** |
| Ký + notarize | `mac-sign-notarize.sh … 1.4.7-30` → profile đủ **6/6 (app) + 5/5 (sysext)**, notarize **Accepted**, staple **OK** |
| Cài + kích hoạt | `systemextensionsctl list` → `com.privatevpn.mac.packet-tunnel (1.4.7/30) [activated enabled]` |
| Tunnel | `scutil --nc status VPNFlow` = Connected · egress qua node · 4/4 relay `426` |

## 3. Khi chủ dự án xác nhận — publisher làm ĐÚNG thứ tự này

1. **Mở khoá**: xoá/sửa mục `macos` trong `.privatevpn/status/release-lock.json` (có chủ đích, ghi lý do) —
   nếu không, `scripts/check-publish-version.py` **chặn cứng exit 3** (đúng thiết kế).
2. **Dựng DMG** bằng `bash scripts/mac-sign-notarize.sh <VPNFlow.app> 1.4.7-30 --dmg` (bản 30 hiện chỉ có `.app`
   đã notarize tại `~/.vpnflow-macrelease/stage-1.4.7-30/VPNFlow.app`; DMG chưa dựng).
3. **Cổng pre** `check-publish-version.py --platform macos --file <dmg> --version 1.4.7 --build 30` → phải **ĐẠT**.
4. Đối chiếu dòng sổ `release/releases.jsonl` (28 đang là bản phát) — build 30 **cùng số 1.4.7, khác build + sha**
   ⇒ cần `release-record.mjs append --allow-rehash --reason "…"` (luật artifact bất biến `docs/VERSIONING.md` §3.3;
   tiền lệ 1.4.6 build 54/57 của iOS đã làm đúng vậy).
5. Upload **nguyên tử**, verify sha256/size trên server, **cổng post** `--mode post`, set `latest_mac_version=1.4.7`
   (giữ `minimum`), ghi sổ + tag, rồi **email riêng kênh macOS** (luật 14 — KHÔNG gộp với iOS).

## 4. Cảnh báo

- Repo: 2 commit sửa nằm trên nhánh **`macos-147-28`** (`9260820` hết Blocking oan · `158328a` đường thẳng + fallback),
  **chưa có trên `main`** ⇒ build từ `main` sẽ KHÔNG có 2 bản vá này (xem `HANDOFF_MAINLINE_INTEGRITY_2026-09-26.md`).
- **Tốc độ không tăng** so với 28 ở mạng đang chặn UDP: trần 2–6 Mbps là do đường qua Cloudflare bị bóp
  (tuyến nhà đo ~103 Mbps). Muốn vượt trần phải làm "đường 1" (đổi cửa/edge Cloudflare) hoặc "đường 2" (node HK/Nhật).
- **Chưa test cài MỚI hoàn toàn trên máy sạch** (bước khách bấm Allow cho system extension) — vẫn là nợ từ 28.
