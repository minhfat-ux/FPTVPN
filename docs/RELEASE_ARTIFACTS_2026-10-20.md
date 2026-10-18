# RELEASE ARTIFACTS — iOS 1.4.7 / build 79 (20/10/2026)

## 1. Artifact

| Trường | Giá trị |
|---|---|
| File | `build/ios-adhoc-export/ipa/FlowVPN.ipa` |
| Size | **8.235.330 B** |
| sha256 | `e750a9cd3f3aa2e60d9485607fa5eefd37a88c39e6c54f71e7307dfe6b1cc4b4` |
| md5 | `349553b47c0aec4b605b3d5c3b710ad7` |
| version / build | **1.4.7 / 79** (đọc từ trong IPA) |
| Ký | Ad Hoc · 10 UDID · `get-task-allow=false` · extension cùng số |
| Cổng `ios-verify-ipa.sh --version 1.4.7 --build 79` | **ĐẠT 8/8** |
| Commit code | **`167ba9d`** |

## 2. Đích phát hành (PUBLISHER_PROCESS §3)

| Việc | Giá trị |
|---|---|
| node-2 | `/root/flowvpn-ipa/VPNFlow-latest.ipa` |
| Route | `GET /v1/downloads/ios` (verify bằng `t1.meetflowai.site`) |
| Mốc §4 | `latest_version=1.4.7`, `ipa_build=79` |
| KHÔNG đặt | `minimum_version` |

Release-lock đã ghim `ios 1.4.7 / 79` (đã kiểm cổng: 79 QUA, các build khác BỊ CHẶN).

## 3. ⚠️ ĐỌC TRƯỚC KHI UPLOAD

1. **KHÔNG rebuild.** Bản này link `build/frameworks-multitunnel/Multitunnel.xcframework` —
   thư mục `build/` **không nằm trong git**. Máy khác rebuild sẽ thiếu framework.
   **Phát đúng file IPA ở §1**, đối chiếu sha256.
2. **Tính năng mới MẶC ĐỊNH TẮT.** iOS giờ có mục Settings → “Tăng tốc” → “Hút băng thông (N tunnel)”,
   mặc định TẮT ⇒ hành vi khách không đổi trừ khi họ tự bật. **Không quảng cáo** như tính năng bật sẵn.
3. **Chưa chạy nghiệm thu chính thức §7d** (`ios-log-acceptance.py --crash-dir`) trên bản 79.
   Đã cài và chạy thật trên iPhone + 2 iPad, log cho thấy tunnel lên và 4 tunnel mở đúng.
4. Đây là **bản đầu tiên link core hysteria khác** (cùng phiên bản source v2.12.2, package đổi tên
   `multitunnel`). Với N=1 hành vi tương đương bản 66; đã kiểm: tunnel lên, có mạng thật.
5. Số đo tốc độ hôm nay bị nhiễu do **mạng TQ tại chỗ dao động**; xem
   `docs/RESEARCH_SHARED_NETWORK_BANDWIDTH_2026-10-19.md`. Không dùng số nào làm cam kết tốc độ.
