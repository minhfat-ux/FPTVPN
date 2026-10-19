# iOS N tunnel (hút băng thông) — biên bản nghiệm thu 20/10/2026

**Kết luận một dòng:** N tunnel **CHẠY ĐÚNG kỹ thuật** (4 tunnel mở thật, cùng node), nhưng
**CHƯA chứng minh được lợi ích** trên mạng hiện tại (+26% đỉnh, không phải 4×) ⇒ **không đưa vào bản
phát hành**; giữ ở bản thử (build 87). Số đo còn phủ định một giả thuyết quan trọng: video chậm
**không** phải do trần tunnel.

**Bản thử:** iOS 1.4.7 **build 87** (link `Multitunnel.xcframework`, IPA md5 `d01a13c6761e0056b6ccfbc13a6d45f6`,
8.243.608 B). Máy: iPhone `33987D6F` (iPhone 14 Pro Max), Wi-Fi SSID "FPT Software Project".

## 1. Vì sao trước đây N "không bao giờ chạy" — tìm ra trong ca này

Phép đọc số N (`providerConfiguration["multiTunnelCount"]` → `HysteriaTransport.requestedTunnelCount`)
nằm trong `iOS/PrivateVPNPacketTunnel/PacketTunnelProvider.swift` — một file **KHÔNG có trong target
extension** (`project.yml` liệt kê tường minh 13 file cho `PrivateVPNPacketTunnel`, không có file này).

Hệ quả dây chuyền: `requestedTunnelCount` luôn bằng giá trị khởi tạo **1** ⇒ `configuredTunnelCount()`
gập thành hằng 1 khi biên dịch (whole-module + `-O`) ⇒ **toàn bộ nhánh N tunnel bị xoá khỏi binary**.

Bằng chứng (build 86, đã link core Multitunnel nhưng N nằm trong file chết):
```
nm  <appex> | grep MultitunnelConnectSlot   ->  0 kết quả (thiếu hẳn)
strings -a <appex> | grep "tunnel ph"       ->  0 kết quả (chuỗi log của addExtraTunnels bị xoá)
```
⇒ **Ca "build 82 link Multitunnel làm extension không khởi động" trước đây là KẾT LUẬN SAI.** Nguyên
nhân thật của cả build 82 và 83 là bug nuốt cú bấm Connect (xem
`2026-10-20-ios-connect-quay-tit-khong-len.md`), cộng thêm việc N chưa bao giờ được nối dây.

**Sửa:** đọc N ngay trong provider thật (`HysteriaPacketTunnelProvider.startTunnel`), đặt
`HysteriaTransport.requestedTunnelCount` TRƯỚC khi dựng transport. Sau khi sửa (build 87):
```
nm  <appex> | grep MultitunnelConnectSlot   ->  1 kết quả (_MultitunnelConnectSlot, T)
strings -a <appex> | grep "tunnel ph"       ->  2 kết quả
```

## 2. N=4 chạy thật (log máy)

```
13:57:11.802 startTunnel: N tunnel = 4 (app truyền), core hỗ trợ N = true
13:58:26.326 ws-relay: handshake ok — connected to wss://api.meetflowai.site/relay/vn2hy
13:58:27.734 ws-relay: handshake ok — connected to wss://api.meetflowai.site/relay/vn2hy
13:58:29.273 ws-relay: handshake ok — connected to wss://api.meetflowai.site/relay/vn2hy
13:58:30.682 ws-relay: handshake ok — connected to wss://api.meetflowai.site/relay/vn2hy
```
4 `handshake ok` = 1 tunnel chính + 3 tunnel phụ, **tất cả cùng một relay/node `vn2hy`** ⇒ giữ đúng
bất biến F3 (khác node là IP khách đổi giữa phiên). (Dòng `+tunnel #N` của `addExtraTunnels` đi qua
`os_log`, không vào file `relay.log` — nên không thấy trong log tệp là đúng.)

## 3. Số đo A/B (cùng trang `fast.com`, cùng mạng, chỉ khác số tunnel)

| Cấu hình | Số khai ↓ (mỗi tunnel) | Đỉnh thật qua tunnel | Trung bình cửa sổ đo |
|---|---|---|---|
| **N=1** (14:10:30–14:11:34) | 4663 kbps | **4,35 Mbps** | 1,55 Mbps |
| **N=4** (14:08:52–14:09:56) | 4221–4663 kbps | **5,48 Mbps** | 1,49 Mbps |

Nguồn số: trường `rawWindowBytes` (byte thật qua cầu trong cửa sổ 10 s) của dòng `bw: sample`.

**Đọc ra:**
- N=4 chỉ hơn N=1 **~26%**, không phải 4×. Với 4 tunnel mỗi tunnel khai ~4,2 Mbps thì trần lý thuyết
  là ~17 Mbps; thực tế 5,5 Mbps ⇒ các luồng của phép đo **không trải đều** 4 tunnel, hoặc đường không
  chở nổi 4 luồng QUIC cùng lúc. **Lợi ích của N CHƯA được chứng minh.**
- **N=1 đạt 4,35/4,66 Mbps = 93% số khai** ⇒ khi có nhiều luồng, MỘT tunnel đã chở gần hết số khai.

## 4. Phát hiện quan trọng: video chậm KHÔNG phải do trần tunnel

Lúc xem video (một luồng), lưu lượng thật qua tunnel chỉ 1,6–2,6 Mbps:

| Thời điểm | Số khai ↓ | `liveDown` | Byte/10 s | Tốc độ thật |
|---|---|---|---|---|
| 14:05:42 | 3632 kbps | 3346 kbps | 2,48 MB | 1,98 Mbps |
| 14:06:59 | 4663 kbps | 4276 kbps | 3,20 MB | 2,56 Mbps |
| 14:07:09 | 4663 kbps | — | 2,21 MB | 1,77 Mbps |
| 14:09:23 | 4663 kbps | — | 6,85 MB | **5,48 Mbps** (đo nhiều luồng) |

Nhưng N=1 đạt 4,35 Mbps khi có nhiều luồng ⇒ **tunnel còn dư địa**; con số ~2 Mbps là do **YouTube tự
chọn chất lượng** trên đường ~140 ms / mất gói ~20%, không phải tunnel bị bóp. Hàng đợi trong suốt
phiên: `relay chờ 0 gói / 0 B`, `bỏ 78`/8684 gói ra ⇒ không nghẽn nội bộ.

## 5. Rủi ro phải theo dõi: bộ nhớ extension tăng theo số tunnel

| Thời điểm | Tunnel | `footprint` | `resident` |
|---|---|---|---|
| 14:03:30 | 1 | 13,8 MB | 47,1 MB |
| 14:05:26 | 4 (rảnh) | 13,7 MB | 43,8 MB |
| 14:07:15 | 4 (có tải) | **20,9 MB** | 44,6 MB |

iOS đã từng giết extension ở `rpages=3202` ≈ 51 MB (`BUG-IOS-JETSAM-001`) ⇒ 4 tunnel làm footprint
tăng ~52% so với 1 tunnel. Nếu N được bật mặc định, đây là rủi ro phải đo dài hơn.

## 6. Việc còn lại (đề xuất, chưa làm)

1. **Không phát hành N** ở bản này. `project.yml` đã trả về core production (`Hysteria.xcframework`),
   số bản tiếp theo là **88** để không trùng số với bản thử 87.
2. Muốn kết luận N có lợi hay không: phép đo **≥8 luồng song song** (không phải `fast.com`), cộng đo
   bộ nhớ ≥10 phút với N=4.
3. **Thẻ Diagnostics trống** — nghi `VPNManager.probeProviderDiagnostics()` treo vì `sendProviderMessage`
   dùng `withCheckedContinuation` **không có hạn chót**: extension không trả lời thì continuation không
   bao giờ resume ⇒ vòng poll đứng im, thẻ trắng vĩnh viễn. Cần vá bằng deadline + log khi `report == nil`.
   Trước khi vá, KHÔNG kết luận gì thêm từ việc "thẻ trắng".
4. Nếu ưu tiên là video một luồng nhanh hơn: nút thắt nằm ở mất gói/RTT của đường, không phải số khai
   (đã chứng minh N=1 đạt 93% số khai).
