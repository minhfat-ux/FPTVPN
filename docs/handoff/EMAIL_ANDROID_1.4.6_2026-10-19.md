# Email Android 1.4.6 (build 38) + kênh Android TV — 19/10/2026

Task: `bus-982` (WIN → MAC, trùng nội dung `bus-981` — Windows gửi lặp qua connector).

## 1. Chốt của chủ dự án

- **Hoãn email 1.4.5**: chỉ gửi **MỘT email cho 1.4.6 (build 38)**, gộp nội dung 1.4.5 + sửa lỗi
  cập nhật trên TV + kênh Android TV.
- Cập nhật **tự nguyện** — `minimum_version` giữ **1.2.6**, email **không** được viết "bắt buộc cập nhật".

> Bối cảnh: email 1.4.5 đã gửi 4/4 khách Android lúc 11:15Z (task `bus-976`), trước khi lệnh hoãn tới
> (11:50Z) nên không thể thu hồi. Vì vậy email 1.4.6 có thêm một câu ngắn nói rõ bản 1.4.6 **thay thế**
> email 1.4.5 trước đó, để khách không hiểu nhầm là hai bản khác nhau.

## 2. Xác thực gói phát hành (đo trên node-2, khớp đúng bus #982)

| Kênh | URL | Bytes | SHA-256 |
|---|---|---|---|
| modern | https://t1.meetflowai.site/v1/downloads/android | 79.106.252 | `0eabd7875df06d17adcf998771d8f8cc9b3088f2c9cc3cc4a130e57b8da5f4d4` |
| legacy | https://t1.meetflowai.site/v1/downloads/android-legacy | 79.122.631 | `aa392fd30e1e8e557a47ef0ded42195c07b226fec62545cc58373c97daf8a208` |
| TV | https://t1.meetflowai.site/dl/VPNFlow-tv-latest.apk?v=191f8f95 | 79.106.408 | `191f8f9529ed41c7dbc4e613b4c294db3a2b12f4ba8d82321938e21a822f8830` |

Endpoint phiên bản sau khi gửi:

```
GET https://t1.meetflowai.site/v1/app-version?platform=android
{"platform":"android","minimum_version":"1.2.6","latest_version":"1.4.6", ...}
```

## 3. Nội dung email

- 3 ngôn ngữ vi / en / zh, cùng một HTML.
- Hút băng thông bằng N tunnel (mặc định TẮT), chọn 2/4/6/8; số đo thật 1 luồng 4–12 Mbps,
  4 luồng 17–29, 8 luồng 72–81 Mbps; không bật thì chạy y hệt bản cũ.
- Android TV: gói riêng `com.privatevpn.app.tv`, cài song song, 3 bước cài.
- **Sửa lỗi TV**: nút "cập nhật" trước đây tải nhầm APK điện thoại; từ 1.4.6 TV tải đúng gói TV.
- Không có câu "bắt buộc cập nhật"; có câu "không bắt buộc cập nhật" + "cập nhật khi thuận tiện".
- Link TV dùng đúng `?v=191f8f95`.

## 4. Gửi thật

Script: `scripts/send-android-1.4.6-announcement.py` → `/root/send-android-1.4.6-announcement.py`.

```
python3 /root/send-android-1.4.6-announcement.py --recipients   # 4 khách platform=android
python3 /root/send-android-1.4.6-announcement.py --test         # OK tới ALERT_EMAIL
python3 /root/send-android-1.4.6-announcement.py                # gửi thật
python3 /root/send-android-1.4.6-announcement.py --verify       # last_event
```

Kết quả: **4/4 thành công, 0 lỗi**, Resend `last_event=delivered` cả 4:

| Khách (mask) | Resend id | Trạng thái |
|---|---|---|
| ca\*\*\*@gmail.com | `01a15403-f580-739b-ac00-78cb5f0d86e4` | delivered |
| di\*\*\*@gmail.com | `01a15403-fa2b-76f0-adf0-1f590d0b6c2f` | delivered |
| ha\*\*\*@gmail.com | `01a15403-feb4-79ca-8c76-a3d12c7644bf` | delivered |
| vt\*\*\*@gmail.com | `01a15404-0317-713f-90f0-38cfd4f50d2a` | delivered |

Mã lưu tại `/root/flowvpn-cp/data/.announce-android-1.4.6-ids.json`.

## 5. Chống gửi trùng

Watcher MAC đánh thức **hai** phiên cho hai tin bus trùng nhau (#981 và #982). Một phiên headless
(pid 28404) đã ack `bus-981`; phiên này bị dừng trước khi kịp gửi để bảo đảm **chỉ một email 1.4.6**
tới khách. Toàn bộ việc gửi + nghiệm thu nằm ở phiên xử lý `bus-982`; `bus-981` được ghi `done`
cùng bằng chứng vì là bản gửi lặp của cùng một yêu cầu.
