# RELEASE ARTIFACTS — iOS 1.4.7 / build 80 (20/10/2026)

## 1. Artifact

| Trường | Giá trị |
|---|---|
| File | `build/ios-adhoc-export/ipa/FlowVPN.ipa` |
| Size | **8.236.378 B** |
| sha256 | `b12681ea04bc89563dbd87811e6c20a706e9924183a3591fd223ac921eca030f` |
| md5 | `f677af50788d51a83d9de5d51f2922eb` |
| version / build | **1.4.7 / 79** (đọc từ trong IPA) |
| Ký | Ad Hoc · 10 UDID · `get-task-allow=false` · extension cùng số |
| Cổng `ios-verify-ipa.sh --version 1.4.7 --build 80` | **ĐẠT 8/8** |
| Commit code | **`167ba9d` + đa ngôn ngữ** |

## 2. Đích phát hành (PUBLISHER_PROCESS §3)

| Việc | Giá trị |
|---|---|
| node-2 | `/root/flowvpn-ipa/VPNFlow-latest.ipa` |
| Route | `GET /v1/downloads/ios` (verify bằng `t1.meetflowai.site`) |
| Mốc §4 | `latest_version=1.4.7`, `ipa_build=80` |
| KHÔNG đặt | `minimum_version` |

Release-lock đã ghim `ios 1.4.7 / 80` (đã kiểm cổng: 79 QUA, các build khác BỊ CHẶN).

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
