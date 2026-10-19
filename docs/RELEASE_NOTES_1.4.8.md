# VPNFlow Windows 1.4.8 — release notes

> Nền tảng: **windows** · Build: harness Windows · Quy trình: `docs/PUBLISHER_PROCESS.md`
> Nguồn version duy nhất: `windows/PrivateVPNWindows.App/PrivateVPNWindows.App.csproj` (`<Version>`)
> Bản trước: **1.4.7** (đã phát 24/09/2026 — vá "thử lại API 3 vòng")
> Handoff kỹ thuật: `docs/handoff/HANDOFF_WINDOWS_1.4.8_TUN_2026-10-13.md`

## 1. Sửa lỗi khách báo: "sing-box.exe đang phải có chữ ký"

Trên máy Windows bật **Smart App Control**, ứng dụng báo không chạy được `sing-box.exe` vì tệp
này chưa được ký số, và đường dự phòng qua WebSocket không hoạt động.

**Đã sửa triệt để: ứng dụng không còn dùng `sing-box.exe` nữa.** Toàn bộ phần dựng đường hầm
(TUN + định tuyến + chuyển tiếp DNS) đã được đưa vào chính `flowvpnrelay.exe` — tệp do chúng ta
biên dịch, và đo thật là **chạy bình thường trên đúng máy bật Smart App Control** (trong khi
`sing-box.exe` bị chặn 16 lần/30 ngày).

Nhờ vậy:

- Không còn tệp bên thứ ba nào để Windows chặn — hết hẳn lớp lỗi này, **không cần chứng chỉ**.
- Bộ cài **nhỏ đi ~14 MB** (bỏ tệp 59 MB, thêm ~2,4 MB cho bản relay mới).
- Thông báo cho khách (nếu Windows vẫn chặn chính binary của mình) không còn nhắc tên tệp kỹ thuật
  hay chuyện "cần ký số" — chỉ nói ứng dụng vẫn kết nối được bằng đường WireGuard.

## 2. Sửa lỗi Trung Quốc: tên miền TQ chậm khi bật VPN

Trong lúc kiểm bản mới trên mạng Trung Quốc, phát hiện một hồi quy so với 1.4.6: bản 1.4.6 dùng
rule theo **tên miền** của sing-box nên tên miền TQ được phân giải bằng resolver nội địa. Kiến trúc
mới (hysteria TUN) không có engine rule, nên nếu để nguyên thì một số trang TQ lớn bị phân giải ra
máy chủ CDN **ngoài** Trung Quốc ⇒ lưu lượng lại vòng qua máy chủ VPN:

| Tên miền | Phân giải qua resolver công cộng | Trong dải TQ? | Hệ quả |
|---|---|---|---|
| `www.baidu.com` | `103.235.47.188` (Baidu HK) | ✗ | vào tunnel — **26.217 ms** thay vì 116 ms |
| `www.taobao.com` | `43.109.163.153` | ✗ | vào tunnel |
| `www.qq.com` | `129.226.102.190` | ✗ | vào tunnel |

Tổng cộng **15/23 tên miền TQ lớn** bị vậy. Đồng thời **không thể** dùng resolver nội địa cho tất
cả: `223.5.5.5` / `114.114.114.114` / `119.29.29.29` đều trả **kết quả nhiễm độc** cho
`www.google.com` và `www.youtube.com`.

**Đã sửa:** ứng dụng nay có bộ chuyển tiếp DNS riêng (nằm trong `flowvpnrelay.exe`, nghe ngay trên
địa chỉ của adapter TUN; app đặt DNS của adapter về địa chỉ đó). Với từng truy vấn:

1. tên miền Trung Quốc (WeChat/Tencent, thương mại điện tử, thanh toán, video, `.cn`…) → phân giải
   bằng resolver **nội địa** ⇒ nhận IP Trung Quốc ⇒ đi thẳng, **không** qua VPN;
2. tên miền khác → phân giải **trong đường hầm** ⇒ không bị nhiễm độc DNS, đi qua VPN như mong đợi;
3. riêng bản ghi A/AAAA: hỏi resolver nội địa trước, chỉ nhận khi **mọi** IP trả về nằm trong dải
   Trung Quốc (khi đó quy tắc đi-thẳng mới khớp), ngược lại mới hỏi resolver trong tunnel — nhờ vậy
   **không cần danh sách tên miền nào để bảo trì**.

## 3. Thay đổi khác

- **Cổng kiểm tra sức khoẻ mới:** sau khi dựng xong đường hầm, ứng dụng gửi một yêu cầu **thật** qua
  đường đó rồi mới coi là đã kết nối. Nếu đường hầm "dựng được mà không chở được dữ liệu", ứng dụng
  tự chuyển về WireGuard trong vài giây thay vì để máy mất mạng hơn một phút.
- Nhãn lựa chọn đường truyền trong Cài đặt: `Hysteria2 over WebSocket (relay)`.
- Watchdog của đường relay không còn phụ thuộc `clash_api` (đã bỏ cùng sing-box).

## 4. Đã kiểm bằng máy thật (mạng Trung Quốc, quyền Administrator)

| Phép kiểm | Kết quả |
|---|---|
| Dựng TUN với danh sách 7.509 dải Trung Quốc | `TUNREADY` sau **4,1 s** |
| Route toàn bộ lưu lượng qua TUN | 23.975 route, có phủ nửa dưới `0.0.0.0/1` |
| IP Trung Quốc đi thẳng | 5/5 IP mẫu đi qua Wi-Fi, **không** vào TUN |
| IP quốc tế đi qua VPN | 3/3 IP mẫu vào TUN |
| DNS `www.youtube.com` | IP Google thật (`142.251.x`), **không** bị nhiễm độc |
| IP ra ngoài | `165.101.114.162` (đúng máy chủ VPN) |
| `https://www.google.com` | HTTP 200 · 1.379 ms |
| `https://weixin.qq.com` | HTTP 200 · 471 ms |
| `https://api.meetflowai.site/v1/health` | HTTP 200 · 658 ms |
| Dọn dẹp sau khi ngắt | adapter TUN mất, máy vẫn có mạng |
| Kiểm thử tự động | **225/225** đạt |
| Cổng tĩnh của installer (`verify-relay.ps1 -ConfigOnly`) | **18/18** đạt |

Phép kiểm bộ chia DNS (`www.baidu.com` / `www.taobao.com` phải ra IP TQ và đi thẳng) được bổ sung
vào chính `verify-relay.ps1` để lần sau không lọt.

## 5. Cần biết khi phát hành

- Bộ cài **chưa ký số** (máy này chưa có chứng chỉ) — cần chủ dự án ghi ngoại lệ như bản 1.4.5,
  hoặc chờ chứng chỉ. Bản này **không** làm tăng rủi ro bị Smart App Control chặn: tệp từng bị chặn
  (`sing-box.exe`) đã bị bỏ hẳn khỏi sản phẩm.
- Từ bản này, máy để chế độ **Tự động** sẽ thử đường relay trước (giữ nguyên thứ tự cũ). Nếu đo thấy
  WireGuard trực tiếp nhanh hơn đáng kể trên mạng khách thì đó là việc cần cân nhắc riêng — xem
  handoff §5.3.
