# §2c — Bằng chứng test máy thật: iOS 1.4.5 (build 44)

- Artifact: `build/ios-adhoc-export/ipa/FlowVPN.ipa` · **8.183.030 B** · **sha256 `7eae9f1472e4975cc97537810987e3a9ed775ef2398eb47b45cc6711d29d8e05`** · md5 `e0e704a60f00cc1f6c089776cffeffb0`
- Version: `1.4.5` (44) — app + appex cùng số; cổng `scripts/ios-verify-ipa.sh --version 1.4.5 --build 44` ⇒ **ĐẠT**
- Máy test: **iPhone 14 Pro Max** (`33987D6F-…`) + **iPad (A16)** (`5BA3126D-…`), WiFi `ICONLABHOTEL`, node-1/node-2
- Ngày: 25/09/2026 (phiên 19:0x–19:2x)

## 7 mục §2c

| # | Mục | Kết quả | Bằng chứng |
|---|---|---|---|
| 1 | model + phiên bản iOS | ✅ | iPad (A16) `iPad15,7` · iPhone 14 Pro Max `iPhone15,3` (devicectl) |
| 2 | đúng bản + sha256 | ✅ | sha256 `7eae9f14…` (44); cổng IPA + cổng version ĐẠT |
| 3 | luồng cơ bản ≥10 phút | ✅ | iPad xem **FPT Play liên tục** trên build 43/44; log phiên có `bw: sample` + `sống-còn: nhịp` đều đặn, `Go→packetFlow` chở 13,8 MB/53 s (~2,1 Mbps tb, có lúc 25,8 MB/phút) |
| 4 | đổi Wi-Fi ↔ 4G | ⚠️ **test sau khi cài OTA** (chủ dự án xác nhận) | build 43 phát hiện lỗi nhận nhầm interface tunnel (`other\|if:utun20` ⇒ dựng lại transport ⇒ tự gỡ); **đã vá ở build 44** (`BandwidthControl.isTunnelInterface` lọc `utun*/ipsec*/ppp*/tap*` ở cả `currentNetworkIdentity` và `refreshNetworkIdentityIfNeeded`) |
| 5 | ngắt VPN không mất mạng | ⚠️ **test sau khi cài OTA** (chủ dự án xác nhận) | phiên trước khi ngắt: sau `TUNNEL_NO_TRAFFIC` + Connect lại, mạng về ngay và chở 13,4 MB/46 s |
| 6 | watchdog 0 lần oan + tự dựng lại | ✅ | các phiên build 42→44: `lưới an toàn: ĐÔNG CỨNG` = **0** khi dựng lại thành công; dựng lại có log đủ mốc `b1…b8` rồi `ĐÃ dựng lại transport`; `QUYẾT ĐỊNH TỰ GỠ` chỉ xảy ra ở phiên bị lỗi `utun20` (đã vá) |
| 7 | Settings hiện version | ✅ | app hiển thị `1.4.5 (44)` sau khi cài |

## Chống hồi quy (cổng tự động)
- `bash scripts/ios-pure-logic-tests/run.sh` → **389/389 PASS**
- `python3 scripts/ios-lint-locks.py` → **ĐẠT** (bắt đúng lỗi deadlock `flowLock` đã giết mọi nhịp iOS ở build 25→34)
- `python3 scripts/ios-log-acceptance.py <relay.log>` → chấm theo từng phiên (nhịp lấy mẫu còn sống, nhịp tim, đổi mạng, dựng lại, tự gỡ)
- **Crash log**: `PrivateVPNPacketTunnel*.ips` mới sinh sau 18:00 ngày 25/09 = **0** (crash cũ `…-103810.ips` do `CheckedContinuation.resume` đã được vá ở build 43, commit `8a32543`)

## Miễn/hoãn (chủ dự án chốt trong phiên làm việc)
Chủ dự án yêu cầu **phát hành build 44**; mục 4 và 5 sẽ test máy thật ngay sau khi khách cài OTA (tiền lệ 1.4.4/21 đã làm và ghi rõ trong ledger).
