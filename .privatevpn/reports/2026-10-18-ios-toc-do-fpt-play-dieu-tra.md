# Điều tra tốc độ iOS + FPT Play — NHẬT KÝ SỐ LIỆU (18/10/2026)

> Mục đích: ghi lại **số đo thật**, tách cái đã chứng minh / cái còn nghi / cái đã bác bỏ.
> Mọi kết luận dưới đây đều có lệnh + số kèm theo. Không có suy đoán nào được ghi thành sự thật.

## 0. Bối cảnh

- Máy Mac **ở trong mạng Trung Quốc** (Wi-Fi, SSID `KT-617-5G`, Mac `192.168.100.8`). Xác nhận bằng:
  `curl --interface en0 https://www.google.com` = `000` trong khi qua tunnel = `302`.
- Thiết bị test: **iPhone 14 Pro Max** + **iPad (A16)`, app `com.privatevpn.app` ad-hoc.
- Node dùng trong các phép đo dưới: `node-1` (`103.173.155.50`, relay `vn1hy`) và `vietnam-3`
  (`103.6.235.39`, relay `vn3hy`).

## 1. ĐÃ CHỨNG MINH — nút thắt cũ ở cầu gói iOS (sửa ở build 60)

Đường về (Go → `packetFlow`) trước đây gọi `flow.writePackets` **mỗi gói một lần** — mỗi gói là
1 `poll` + 1 `read` + 1 **IPC đồng bộ** sang NetworkExtension.

| | Trước (bản 57/59/60, `vn2hy`) | Sau (bản 61, `vn1hy`) |
|---|---|---|
| Chiều về | `Δ1phút ra+0` — đóng băng | `Δ1phút ra+7294` |
| Gói/phút chiều về | 0 | 7.294 – 9.349 |
| Tổng luỹ kế | `ra 5340` kẹt | `ra 41.615` |
| TCP SYN / RST về | 2.848 / 54 | 490 / 0 |

⇒ Tăng ~2,3 lần, hết đóng băng. **Đây là khiếm khuyết thật, đã sửa** (gom ≤32 gói/lời gọi,
`HysteriaTransport.pumpLoop`).

## 2. ĐÃ BÁC BỎ (bằng số, không phải bằng lập luận)

1. **"Khai 28,8 Mbps sai 30 lần"** — SAI. Log build 62 trên `KT-617-5G`:
   `preMeasure=2145kbps declared up=546 down=1823`. Số khai **1,8 Mbps**, khớp mạng thật.
   Con số 28.824 kbps là của **phiên cũ trên mạng khác** (bộ nhớ theo mạng).
2. **"Nguồn đo `meetflowai.site` bị chặn từ TQ"** — chỉ đúng **lúc đó**. Đo lại sau 30 phút: nguồn
   này trả `200`, tải được 74–399 KB/s. Cả hai nguồn đều chập chờn, không có nguồn nào chết hẳn.
3. **"Bộ đếm byte của ramp bị mù (`bandwidthBytes=nil`)"** — chỉ là **1 dòng thoáng qua** trong
   ~2.600 dòng log. Không phải nguyên nhân hệ thống.

## 3. ĐÃ CHỨNG MINH — mạng tại chỗ là biến số lớn nhất (18/10, 21:39–21:52)

Đo từ **chính máy Mac**, cùng Wi-Fi, cùng lúc với test FPT Play:

```
3 lần tải 1,5 MB liên tiếp trong 1 phút:  27 KB/s  →  HỎNG (0 B)  →  1,57 MB/s
9 lần tải liên tiếp (3 MB) trong 2 phút:  9/9 timeout (000), 0 byte
RTT tới relay-server: 138–142 ms, 0% mất gói
```

Hai nguồn đo của app, thử riêng từng cái 3 lần:

| Nguồn | L1 | L2 | L3 |
|---|---|---|---|
| `speed.cloudflare.com/__down` | 588 KB/s | **0 (timeout 15 s)** | 131 KB/s |
| `meetflowai.site/v1/downloads/ios` | 74 KB/s | 114 KB/s | 399 KB/s |

⇒ Mạng TQ lúc test chỉ **0,6–4,7 Mbps và dao động ~50 lần**. **FPT Play không thể chạy trong điều
kiện này**, bất kể app. Số khai `declared down=1328kbps` là **phản ánh đúng** mạng lúc đó.

## 4. ĐÃ LÀM (các build trong phiên này)

| Build | Thay đổi | Bằng chứng |
|---|---|---|
| 60 | Gom lô ≤32 gói/lần `flow.writePackets` (đường về) + nhịp đo `bridge: nhịp vào` | mục 1 |
| 61 | `preMeasureURLs`: Cloudflare lên đầu, CDN shop làm dự phòng | log `nguon=` trong `bw: MAU` |
| 62 | `bw: ` vào `alwaysKeywords` ⇒ **mọi** quyết định khai/ramp luôn được ghi | trước: 0 dòng `bw:`, sau: 98 dòng |
| 63 | `preMeasure` lấy **tới 3 mẫu**, bỏ mẫu hỏng, chọn **trung vị** | log: `[trung vị của 1 mẫu: [1563]]` |

Cổng chặn mỗi build đều chạy: pure-logic **668/668 PASS** · lint locks **ĐẠT** ·
typecheck **0 lỗi** · `ios-verify-ipa` **ĐẠT 8/8**.

## 5. CÒN CHƯA CHỨNG MINH (đừng cải thiện dựa trên mấy cái này)

1. **Tunnel chở 300–580 kbps trong khi mạng 1,5 Mbps** — có thể do mạng dao động, có thể do
   hysteria/Cloudflare. **Chưa tách bạch được** vì chính mạng không ổn định.
2. **Ramp chỉ đi xuống** — đây là **số học đúng**: `shouldRampUp` cần `sustained ≥ declared×trigger`;
   với `observed(≈300) < declared(1328)` thì không bao giờ tăng. Phải có mạng tốt hơn số khai mới
   thấy ramp lên.
3. **Thời gian mở phiên tăng** do lấy 3 mẫu: log 21:48:54 → 21:49:06 = **12 s**. Nếu thấy khó chịu,
   hạ `preMeasureSamples` xuống 2 (vẫn đủ để loại 1 mẫu xui).

## 6. VIỆC CẦN LÀM KHI MẠNG HỒI

Điều kiện để phép đo có nghĩa (từ Mac): **3 lần tải 5 MB liên tiếp đều ≥ 20 Mbps**.
Khi đạt, test lại theo thứ tự:
1. `node-1` + FPT Play → đo `bw: measured` và `Δ1phút ra` từng phút.
2. `Vietnam 3` + FPT Play → như trên.
3. So `observed` với `declared`: nếu `observed` tiến sát `declared` thì ramp sẽ leo; nếu `observed`
   kẹt dưới thì nút thắt nằm ở đường hysteria/Cloudflare, **lúc đó mới có căn cứ sửa phía server**.

## 7. Dọn dẹp phụ (đã làm)

Thư mục profile cục bộ có **47 file trùng tên `VPNFlow AdHoc Tunnel`** + **45 file `VPNFlow AdHoc App`**
(tích từ 23/09) làm `ios-adhoc-export.sh` báo `Multiple profiles found` và hỏng export.
Đã giữ bản mới nhất mỗi tên; backup 90 file:
`~/Library/MobileDevice/Provisioning.Profiles.backup-20261018-213719`.
