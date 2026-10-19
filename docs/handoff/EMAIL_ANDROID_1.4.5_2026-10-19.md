# ĐÃ GỬI — email Android 1.4.5 (build 37) + kênh Android TV mới (19/10/2026)

- **Người gửi:** harness MAC (publisher gửi email theo bàn giao `PUBLISH_ANDROID_1.4.5_37_2026-10-19.md` §5)
- **Nguồn yêu cầu:** bus **#976** (`win → mac`, 2026-10-19T11:08:47Z) — chủ dự án chốt *"Có — kèm link TV
  + hướng dẫn cài trên TV"*.
- **Nguồn nội dung:** `docs/RELEASE_NOTES_android_1.4.5.md` + handoff phát hành (nhánh `main`, commit
  `d781e05`).
- **Kênh gửi:** Resend, `VPNFlow <support@meetflowai.site>`; script
  `scripts/send-android-1.4.5-announcement.py` (3 ngôn ngữ vi/en/zh) chạy trên node-2.

## 1. Kết quả gửi

Lọc đúng luật §0.14: `devices.json` `platform=android` + gói còn hạn; `--recipients` rồi `--test`
(gửi tới `ALERT_EMAIL`) trước khi gửi thật.

```
nguoi nhan Android: ['ca***@gmail.com', 'di***@gmail.com', 'ha***@gmail.com', 'vt***@gmail.com']
   test toi minhnb2@me.com: OK
   OK  ca***@gmail.com  id=01a153de-afb0-76f6-97f7-e84b97bcc053
   OK  di***@gmail.com  id=01a153de-b569-74df-aeaa-25b743d20b00
   OK  ha***@gmail.com  id=01a153de-ba6b-7672-bbb0-94c349cdc8c8
   OK  vt***@gmail.com  id=01a153de-bf16-7906-b30c-06295a9ec2e5
ket qua: 4/4 thanh cong, 0 loi
```

`--verify` (Resend `last_event`) sau 8 giây: **4/4 `delivered`**.

Mã Resend lưu ở `/root/flowvpn-cp/data/.announce-android-1.4.5-ids.json`
(sha256 `667beb29d567fcca0ae382d93ad23ca323ac0468f67b6f9dc9379385b723cd4a`).
Script trên node-2: `/root/send-android-1.4.5-announcement.py`
(sha256 `5dc0df50edd44d606ca6a68ee6970a152c7c90b2665851323bac3e39c4b1bed0`).

## 2. Nội dung email (đúng chốt)

- **Hút băng thông N tunnel** (mặc định TẮT), đo thật 19/10: 1 luồng 4–12 Mbps, 4 luồng 17–29,
  8 luồng 72–81 Mbps; bật ở Settings → Tăng tốc → Hút băng thông.
- **KHÔNG nói "bắt buộc cập nhật"** — thư ghi rõ *"Không bắt buộc cập nhật: nếu không bật công tắc
  trên, bản 1.4.5 chạy y hệt 1.4.4"*. Lý do: `minimum_version` phải giữ **1.2.6**, chủ dự án chốt
  *"làm v38 rồi mới ép cập nhật"*.
- **Kênh Android TV mới:** gói riêng `com.privatevpn.app.tv`, cài **song song** với bản điện thoại
  (không ghi đè, không mất đăng nhập), link
  `https://t1.meetflowai.site/dl/VPNFlow-tv-latest.apk?v=265d46b4` + 3 bước cài trên TV.

## 3. ⚠️ Sự cố phát hiện trước khi gửi: `minimum_version` đã bị nâng lên 1.4.5

Lúc kiểm tra (2026-10-19 ~18:10 +07), API trả `minimum_version: "1.4.5"` — **trái chốt** và trái
handoff (§4a: TV sẽ bị ép cập nhật vĩnh viễn vì `versionName` TV có hậu tố `-tv`). `app_config.db`
ghi giá trị này lúc `2026-10-19T06:41:19Z` (13:41 +07), sau lần hạ về 1.2.6 trước đó.

Đã hạ lại bằng `PATCH /v1/admin/android-version` (`minimum_version=1.2.6`), giữ
`latest_version=1.4.5`; kiểm lại endpoint:

```
{"platform":"android","minimum_version":"1.2.6","latest_version":"1.4.5", ...}
```

**Việc cần theo dõi:** nếu có phiên khác tiếp tục nâng `minimum_version` lên ≥ 1.4 trước khi v38
được phát, TV sẽ kẹt màn ép cập nhật — kiểm tra lại mốc này trước mỗi lần phát.

## 4. Lệnh đã chạy (trên node-2)

```bash
python3 /root/send-android-1.4.5-announcement.py --recipients
python3 /root/send-android-1.4.5-announcement.py --test
python3 /root/send-android-1.4.5-announcement.py
python3 /root/send-android-1.4.5-announcement.py --verify
```
