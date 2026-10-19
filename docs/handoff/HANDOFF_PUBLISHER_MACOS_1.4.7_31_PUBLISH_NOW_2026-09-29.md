# GẤP — PUBLISHER: phát ngay macOS build 31 (bản vá), kênh đã MỞ KHOÁ

**Lệnh chủ dự án 29/09/2026:** *"giao cho publisher build lại bản mới và publish lên web bản vá mới nhất ngay"*.

## Bối cảnh bắt buộc đọc

- **Build 30 (bản em đề xuất hôm 26/09) KHÔNG được phát** — nó gây **mất sạch mạng khi Connect**
  (`hysteria client already running` khi dựng lại transport ⇒ route `0/1`+`128.0/1` vẫn giữ ⇒ đen traffic).
  Đã tắt vĩnh viễn trong code: `HysteriaDefaults.enableDirectCandidate = false` (commit `e16378d`, đang trên `main`).
- **Bản phát mới = build 31**, dựng từ `main` (`e16378d`) = **bản 28 + bản vá hết báo `Blocking` OAN**
  (bộ dò xung đột từng doạ khách *"hãy TẮT VPN kia"* vì nhận nhầm chính tunnel của mình: gateway `100.100.100.101`).
- Kênh macOS **đã mở khoá** (`.privatevpn/status/release-lock.json` — mục `macos` đã gỡ, có ghi lịch sử lý do).
  Cổng `scripts/check-publish-version.py` vì thế sẽ **cho qua** (trước đó chặn cứng exit 3).

## Việc publisher làm (đúng thứ tự)

1. **Chờ DMG** do harness Mac dựng: `~/.vpnflow-macrelease/VPNFlow-mac-1.4.7-31.dmg`
   (đang build: `mac-sign-notarize.sh … 1.4.7-31 --dmg`). Harness Mac sẽ gửi kèm **size + sha256**.
2. **Cổng pre (bắt buộc, exit 0 mới được upload):**
   `python3 scripts/check-publish-version.py --platform macos --file <dmg> --version 1.4.7 --build 31`
3. **Upload NGUYÊN TỬ** lên node-2: `/root/flowvpn-mac/VPNFlow-mac.dmg`
   (tải lên file tạm → verify sha256/size trên server → `mv` đè; backup bản 28 trước:
   `cp /root/flowvpn-mac/VPNFlow-mac.dmg /root/flowvpn-mac/VPNFlow-mac.bak-1.4.7-b28-<ts>.dmg`).
4. **Verify tải thật qua web:** `curl -s https://t1.meetflowai.site/v1/downloads/mac | shasum -a 256` phải khớp.
5. **Cổng post:** `python3 scripts/check-publish-version.py --platform macos --mode post --version 1.4.7 --build 31`
6. **Set mốc:** `PATCH /v1/admin/app-version` → `latest_mac_version=1.4.7` (giữ `minimum_mac_version=1.4.7`), rồi đọc lại JSON xác nhận.
7. **Ghi sổ:** `release/releases.jsonl` bằng `release-record.mjs append --allow-rehash --reason "Bản vá Blocking oan; build 30 bị bỏ vì lỗi mất mạng"` (cùng số 1.4.7 khác build/sha ⇒ cần cờ này).
   **Không tạo tag mới** (`macos-v1.4.7` đã có).
8. **Email (luật 14 — riêng kênh macOS):** chỉ gửi khi chủ dự án yêu cầu; nội dung chỉ nêu thứ đo được:
   *hết hộp thoại doạ "tắt VPN khác" oan*.

## Sau khi phát xong — báo về

Ghi kết quả vào `docs/PUBLISHER_PROCESS.md` §6 (một dòng) + gửi Telegram cho mọi harness:
dmgsize · sha256 · mốc API · kết quả cổng pre/post · tải thật qua t1 khớp sha.
