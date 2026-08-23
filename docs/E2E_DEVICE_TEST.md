# E2E Device Test — iPhone thật (bản upgrade)

- **Date:** 2026-08-23
- **Gate:** GATE 2/7 (real E2E) — evidence bắt buộc trước khi submit upgrade
- **Rule:** `VPN UI CONNECTED != WORKING VPN` — cần observation độc lập (RULE-VPN-001/002)

## Preconditions

- iPhone thật (simulator KHÔNG chạy Packet Tunnel — RULE-IOS-007)
- App build Release/Debug với Network Extension entitlement, sign team G6XW3RN6LJ
- Production coordinator live (dual-mode, LEGACY_MODE=1 — bản upgrade dùng auth flow mới)
- Email test nhận OTP được (SPF+DMARC verified)

## Scenario (theo thứ tự)

| # | Bước | Kỳ vọng | Ghi evidence |
|---|---|---|---|
| 1 | Cài app lên iPhone | Install OK, không MissingBundleVersion | screenshot |
| 2 | Mở app → màn hình login hiện (chưa đăng nhập) | Login screen hiển thị | screenshot |
| 3 | Nhập email (minhnb2@me.com) → Send Code | Nhận OTP email thật (iCloud) | ảnh email |
| 4 | Nhập code → Verify | Signed in, session lưu | screenshot |
| 5 | Connect → chờ Connected | State đổi Connecting → Connected | screenshot |
| 6 | **Public IP** = 103.173.155.50 | Kiểm tra qua site IP (e.g. ipinfo.io) | screenshot IP |
| 7 | **DNS** hoạt động | resolve domain OK (vd dig/curl qua app) | log |
| 8 | **HTTPS** hoạt động | mở https://meetflowai.site OK | screenshot |
| 9 | Disconnect → public IP trở về ISP thật | IP đổi về IP nhà mạng | screenshot |
| 10 | Reconnect → public IP lại = VN node | IP = 103.173.155.50 lần nữa | screenshot |
| 11 | Kill app → mở lại → vẫn signed in | Session 30 ngày persist | screenshot |
| 12 | (nếu có) Revoke device qua admin → connect fail | FR-REVOKE-002 | log |

## Kiểm tra phụ (server-side)

- `wg show wg0` thấy peer mới của iPhone (handshake + transfer tăng)
- `GET /v1/admin/nodes/:id/health` — bandwidth tăng theo traffic test
- `/v1/admin/users` — user minhnb2@me.com + device gắn

## Evidence storage

- Screenshots + logs → `evidence/e2e/` (sanitize — không chứa private key/token)
- Ghi PASS/FAIL per step + verifier + timestamp

## Blockers nếu có

- Chưa có iPhone/NE profile → BLOCKED (cần Anh cung cấp)
- Subscription chưa có source → register OK nhưng enrollment 403 → cần quyết định hướng sub
