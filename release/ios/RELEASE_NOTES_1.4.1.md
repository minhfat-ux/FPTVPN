# VPNFlow iOS 1.4.1 (build 18) — có gì mới

> Phát hành 23/09/2026. Bản này là **parity với Windows 1.4.1**: watchdog "tunnel còn sống nhưng
> không chở gói" chạy suốt phiên + tự dựng lại khi transport chết, kèm nhóm sửa lỗi mất mạng.
> Nguồn: commit `5b238f5`, `ab04047`, `7149cf9`, `95059cd`, `ebb45df`, `18f8c82`, `479a6d7`, `c5d7564`, `152e524`, `5c676f0`.

## Điểm chính (dùng để thông báo khách)

1. **Tự phục hồi khi tunnel "đứng"**: thêm watchdog đo liveness + goodput trong suốt phiên. Trước đây
   tunnel còn "Connected" nhưng không chở gói thì app gỡ tunnel (khách mất mạng); nay app tự dựng lại
   transport và giữ kết nối.
2. **Tự dựng lại khi transport/relay chết giữa phiên**: có thang transport (TransportLadder) + đo
   goodput, hết đường này thì giữ đường đã chọn rồi ping tiếp (pha HOLD, không đóng tunnel).
3. **Sửa lỗi mất mạng ngay khi connect**: bỏ `ipv6Settings ::/0` — relay có bản ghi AAAA nên iPhone
   bị mất mạng sau khi bấm Connect.
4. **Đường Trung Quốc đi thẳng**: chia IP Trung Quốc vào `excludedRoutes` (kèm `cn.txt`/`cn6.txt` đóng
   sẵn trong app) — traffic trong nước đi trực tiếp, chỉ traffic ra ngoài mới qua tunnel.
5. **Thẻ Diagnostics có chỉ số live** và khai báo an toàn (A10/A11), **Settings hiện số phiên bản**.
6. **Nhắc mềm khi có bản mới**: app gửi đúng kênh (iOS/macOS) khi hỏi phiên bản nên không còn nhận
   nhầm payload của nhau; khách ở build cũ được nhắc thay vì im lặng.

## Chưa có trong build 18 (sẽ ở build kế tiếp — KHÔNG được quảng cáo)

- Nút **tự đăng xuất khỏi thiết bị khác** ngay trên app (`7c98e53`, làm lúc 11:37 ngày 23/09).
- Một bản vá watchdog nữa cho ca "Connected nhưng mất mạng" (`820b9d2`, 11:53 ngày 23/09).

## Kênh phát hành

| Kênh | Bản | Ghi chú |
|---|---|---|
| Trang buy / cài trực tiếp (IPA ad-hoc) | 1.4.1 (18) | `/root/flowvpn-ipa/VPNFlow-latest.ipa` · sha256 `89a17e4d…ba73` · profile 8 UDID, `get-task-allow=false` (không cần Developer Mode) |
| App Store Connect / TestFlight | 1.4.1 (18) | build `VALID` · internal `IN_BETA_TESTING` · nộp Beta App Review 23/09 11:08 (external) |

## Việc đã kiểm trước khi phát

- version/build đọc từ trong IPA: `1.4.1` / `18`; keychain group `G6XW3RN6LJ.com.privatevpn.shared` khớp bản 16; extension `PrivateVPNPacketTunnel.appex`; Hysteria.framework là dylib.
- Tải thật từ `https://t1.meetflowai.site/v1/downloads/ios`: HTTP 200, 8.119.092 B, sha256 khớp.
- Manifest OTA trả `bundle-version 18`; `/install/ios` + `/buy` trả 200 và trỏ host `t1.`.
