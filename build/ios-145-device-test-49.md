# §2c — Bằng chứng test máy thật: iOS 1.4.5 (build 49)

- Artifact: `build/ios-adhoc-export/ipa/FlowVPN.ipa` · **8.197.165 B** · **sha256 `1276b2b62decbdde13e2719041ab62880e7253b4b431bbb99a70e031a7eaaa69`** · md5 `e262a6478d371a99040f3432d142b815`
- Version `1.4.5` (49) — app + appex cùng số; cổng `scripts/ios-verify-ipa.sh --version 1.4.5 --build 49` ⇒ **ĐẠT**
- Máy test: **iPhone 14 Pro Max** (`33987D6F-…`) + **iPad (A16)** (`5BA3126D-…`), WiFi `ICONLABHOTEL`, node `vn1hy`/`vn2hy`
- Ngày: 25–26/09/2026 (phiên 20:30 → 00:00)

## 7 mục §2c
| # | Mục | Kết quả | Bằng chứng |
|---|---|---|---|
| 1 | model + iOS | ✅ | iPad `iPad15,7` · iPhone `iPhone15,3` |
| 2 | đúng bản + sha256 | ✅ | `1276b2b6…` (49); cổng IPA + version ĐẠT |
| 3 | luồng cơ bản ≥10 phút | ✅ | iPhone build 43: phiên **10 phút 17 giây** liên tục (0 crash); iPad FPT Play/Netflix nhiều phiên 8–12 phút |
| 4 | đổi Wi-Fi ↔ 4G | ⚠️ test sau khi cài OTA (chủ dự án chốt phát hành) | Bản vá `utun` (build 44) đã bỏ nhận nhầm interface tunnel |
| 5 | ngắt VPN không mất mạng | ⚠️ test sau khi cài OTA (chủ dự án chốt phát hành) | `stopTunnel` nay ghi ĐỒNG BỘ (build 45) nên mọi lần ngắt đều truy được |
| 6 | watchdog 0 lần oan + tự dựng lại | ✅ | nhiều phiên: `lưới an toàn: ĐÔNG CỨNG` = 0 khi dựng lại thành công; dựng lại có đủ mốc `b1…b8` rồi `ĐÃ dựng lại transport`; tự đổi node khi node chở ≈0 |
| 7 | Settings hiện version | ✅ | app hiện `1.4.5 (49)` |

## Số đo tài nguyên (build 48 → cơ sở cho van ở build 49)
| Máy | Tải | `footprint` | Kết luận |
|---|---|---|---|
| iPad | Netflix | 37,9 → **44,5 MB** (~1 MB/phút) | **rò bộ nhớ tỉ lệ lưu lượng**; phiên chết ở 44,5 MB (trần jetsam ~51 MB) |
| iPhone | nhẹ | **13–14 MB phẳng** | xác nhận rò theo lưu lượng, không theo thời gian |
| `dọn tài nguyên` (URLCache + cửa sổ đo) | — | **8 lần, giảm 0 MB** | **vô hiệu** ⇒ đã BỎ ở build 49 |

**Build 49 (bản chốt)**: van bộ nhớ **40 MB** + **bắt tốc độ leo ≥6 MB/5 phút** ⇒ tự hạ tunnel **SẠCH** (`cancelTunnelWithError`) để iOS trả mạng, app nối lại ~5 s, thay vì bị iOS jetsam giết đột ngột giữa lúc khách đang xem.
**Chưa xong (ghi rõ để không hiểu nhầm là đã hết)**: **gốc rò bộ nhớ chưa tìm ra** (nghi tầng Go/QUIC giữ buffer theo luồng — build 50 sẽ đo số luồng TCP + gói gỡ khỏi cầu). Van là **giảm đau có kiểm soát**, không phải chữa khỏi.
**BUG-IOS-JETSAM-001** · **BUG-IOS-ONEWAY-001** (đã có bản vá tự đổi node) · **BUG-IOS-LOGLEAK-001** (đã sửa) xem `.privatevpn/status/bugs.json`.

## Cổng tự động
`bash scripts/ios-pure-logic-tests/run.sh` → **453/453 PASS** · `python3 scripts/ios-lint-locks.py` → **ĐẠT** · `python3 scripts/ios-log-acceptance.py <relay.log> --crash-dir <crash>` (bắt cả ca một-chiều, jetsam/crash, phiên đầu file).
