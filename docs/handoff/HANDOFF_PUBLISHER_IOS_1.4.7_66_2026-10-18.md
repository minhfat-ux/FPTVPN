# BÀN GIAO PUBLISHER — phát hành **iOS 1.4.7 / build 66**

- **Từ:** harness Mac (bên build) · **Đến:** phiên **publisher** (harness Mac — AGENTS.md §0)
- **Ngày:** 18/10/2026 · **Task:** TASK-20261018-IOS-147-66
- **Manifest (nguồn số liệu):** `docs/RELEASE_ARTIFACTS_2026-10-18.md`
- **Quy trình bắt buộc:** `docs/PUBLISHER_PROCESS.md` §1 — **BUILD → HANDOFF → PUBLISH → ANNOUNCE**

---

## 0. ⛔ VIỆC PHẢI XONG TRƯỚC KHI UPLOAD

1. ~~COMMIT SOURCE~~ → **ĐÃ COMMIT: `31816f5`** (10 file, +496/−94). Luật AGENTS §6b
   "commit trước, deploy sau" **đã thoả**. Publisher chỉ cần xác nhận `git log -1` ra đúng
   `31816f5` rồi mới upload.
2. **Xác nhận đúng bản mới nhất đã test (§1b).** Bản để phát là **1.4.7/66**, đọc **từ trong IPA**
   (không tin tên file). Nếu thấy bản khác ⇒ **DỪNG**.

---

## 1. Artifact cần phát

```
build/ios-adhoc-export/ipa/FlowVPN.ipa
  size   : 8.230.157 B
  sha256 : 374b399aee92f7819c57d89b7bd3822eb9c497180c1d9b8d5eecac0af267a577
  md5    : 8dc7b400b0af0eca8e56cffb3409772d
  version: 1.4.7 / build 66
  ký     : Ad Hoc · 10 UDID · get-task-allow=false · extension cùng số
```

**Tự xác minh lại trước khi upload (đừng tin bàn giao):**

```bash
shasum -a 256 build/ios-adhoc-export/ipa/FlowVPN.ipa          # phải khớp 44b94981…
bash scripts/ios-verify-ipa.sh build/ios-adhoc-export/ipa/FlowVPN.ipa --version 1.4.7 --build 66
python3 scripts/check-publish-version.py --platform ios \
  --file build/ios-adhoc-export/ipa/FlowVPN.ipa --version 1.4.7 --build 66   # exit 0 mới được đi tiếp
```

---

## 2. Đích + mốc

| Việc | Giá trị |
|---|---|
| Upload lên node-2 | `/root/flowvpn-ipa/VPNFlow-latest.ipa` |
| Route đọc | `GET /v1/downloads/ios` |
| Verify link | `HTTP 200` + `content-length` **khớp 8.230.023**; thử bằng host `t1.meetflowai.site` |
| Mốc §4 | `PATCH /v1/admin/app-version` → `latest_version=1.4.7`, `ipa_build=66` |
| **KHÔNG** đặt | `minimum_version` — chủ dự án chưa chốt buộc cập nhật |
| Backup trước khi ghi đè | đổi tên bản đang phát trên node-2 kèm ngày (theo §1 bước 3) |

**Khoá phát hành đã mở đúng bản:** `.privatevpn/status/release-lock.json` = `ios 1.4.7 / 66`.
Nếu cổng 1c trả **exit 3** ⇒ lock không khớp, **dừng và hỏi lại bên build**, đừng `--allow-locked`.

---

## 3. Bản này có gì (chỉ nêu phần ĐÃ xong)

Đây là bản sửa **tốc độ iOS**, gộp 5 thay đổi từ build 60 → 65:

1. **Sửa nút thắt lớn nhất của tunnel iOS**: đường về trước đây gọi `flow.writePackets` **mỗi gói một
   lần** (IPC đồng bộ sang NetworkExtension) ⇒ đo trên máy thật chỉ **52 gói/s ≈ 0,37 Mbps**. Nay gom
   **≤32 gói/lần** ⇒ cùng relay đo lại được **~7.300–9.300 gói/phút chiều về**, chiều về **hết đóng
   băng** (`Δ1phút ra+0` → `ra+7.294`), và khi mạng tốt đạt **5,3–5,4 Mbps** (đỉnh 7,06 Mbps).
2. **Số khai băng thông ổn định hơn**: `preMeasure` lấy tới **3 mẫu**, bỏ mẫu hỏng, chọn **trung vị**
   (trước: một mẫu duy nhất ⇒ số khai nhảy 1,8 ↔ 3,2 Mbps, có phiên đo ra 0).
3. **Nguồn đo trước-khi-khai** đổi thứ tự: Cloudflare lên đầu (đo thật từ TQ: `200 · 972 KB/s`),
   CDN shop làm dự phòng (đo thật lúc đó: `000`, bắt tay xong không chuyển byte).
4. **Log quyết định khai/ramp luôn được ghi** (`bw: ` vào `alwaysKeywords`) — trước đây bị bộ lọc
   nuốt, khiến việc chẩn đoán tốc độ phải suy đoán.
5. **Đường đo đổi sang CHÍNH domain của mình** (`api.meetflowai.site` → `t1.` → Cloudflare cuối),
   và **mỗi nguồn chỉ 1 mẫu** thay vì thử lại nguồn đã chết. Đo 3 lần/nguồn từ TQ (18/10/2026):
   `api.` **3/3 sống**, `t1.` 2/3, `speed.cloudflare.com` **0/3 (chết hẳn)**. Trước đây một nguồn
   chết làm mỗi lần mở phiên phí ~5 giây mà không có số đo.
6. **Hiển thị "Mức đã khoá (stable)"** nói rõ ngưỡng (`— (≥ 8.0 Mbps)`) thay vì dấu `—` trơ.

---

## 4. ⚠️ KHÔNG được quảng cáo / không được hứa với khách

1. **Chưa nghiệm thu chính thức §7d trên build 66** (chưa chạy `ios-log-acceptance.py` + `--crash-dir`).
2. **Chỉ iPad được cài và dùng thử.** **iPhone chưa cài được** (offline giữa phiên).
3. **FPT Play**: chạy được trên iPad qua `node-1`; **chưa** kiểm trên `Vietnam 3`.
4. **Số tốc độ**: mạng TQ tại chỗ dao động **0,6 – 4,7 Mbps** trong chính buổi đo, nên **không** dùng
   con số nào ở đây làm cam kết tốc độ. Chỉ được nói "đã sửa nút thắt gây chậm".
5. **macOS 1.4.7/28 không nằm trong bàn giao này** — không có artifact, không test.

---

## 5. Bằng chứng kèm theo

| Việc | File |
|---|---|
| Số đo trước/sau, các giả thuyết đã **bác bỏ** bằng số | `.privatevpn/reports/2026-10-18-ios-toc-do-fpt-play-dieu-tra.md` |
| Manifest artifact + cổng đã chạy | `docs/RELEASE_ARTIFACTS_2026-10-18.md` |

---

## 6. Báo cáo lại khi xong

Publisher báo: **sha256 đã upload**, `content-length` thực tế trên node-2, mã HTTP của
`/v1/downloads/ios`, giá trị `latest_version`/`ipa_build` sau PATCH (kèm response thật, không chỉ
exit code), và ảnh/khẳng định `/install/ios` + `/buy` đã trỏ bản mới. Xong thì **release claim**
(AGENTS §6).
