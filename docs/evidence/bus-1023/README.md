# bus-1023 — iOS build 87: chạy `ios-log-acceptance.py` trên máy thật

**Ngày:** 2026-10-20 00:42 +07 (2026-10-19 16:42Z) · **Máy:** MAC · **Trạng thái:** `blocked`
**Kết luận ngắn:** **CHƯA NGHIỆM THU ĐƯỢC** — iPhone `33987D6F` (và 2 iPad) đều `unavailable`;
không có thiết bị iOS nào trên USB. Không thể lấy phiên sạch bật `tunnel-log-on` để cổng §7d trả exit 0.
Không tự cho qua, không tự xuất lại 80 khi chưa có bằng chứng "87 sai".

## 1. Việc được giao

Bus **#1023** (`win → mac`, 2026-10-19T16:33:28Z):

> Chủ dự án chốt **"TẠM GIỮ 87 ĐỂ NGHIỆM THU, SAI THÌ LUI 80"** (commit `b3cb14bc`).
> Mac lấy log máy thật của đúng build 87, chạy `scripts/ios-log-acceptance.py <relay.log> --crash-dir <crash>`;
> **exit 0 mới tính ĐẠT**. Nếu ĐẠT báo để cập nhật sổ/khoá; nếu KHÔNG ĐẠT thì xuất lại IPA build 80
> từ `e996d12` (8.236.378 B, sha `b12681ea…`).

Sổ FlowGPT chưa có mục `bus-1023` (WIN gửi qua connector). MAC đã chép nguyên văn vào sổ, giữ
`from=win → to=mac`, rồi `ack`:

- `ops/tasks/bus-1023/2026-10-19T16-41-58-371Z-mac-created.json` — bản chép từ bus #1023
- `ops/tasks/bus-1023/2026-10-19T16-42-07-779Z-mac-acked.json`
- Push: `origin/flowgpt` commit **`6bfc4ee`** (`task: xác nhận đã nhận [task bus-1023]`)

Xác nhận chủ dự án: `git -C .tmp/fptvpn-release show -s b3cb14bc` →
`release(ios): chu du an chot TAM GIU build 87 de nghiem thu (sai thi lui 80) — khoa van neo 80`.
Correction sổ build 87 đã có: commit **`6e669f8`** (`#993 là tin WIN, #998 đến sau upload 2m31s;
căn cứ đúng là b3cb14bc`) — không sửa dòng cũ.

## 2. Kênh đang phát đúng IPA 87 (kiểm lại trong phiên này)

| Kiểm | Kết quả |
|---|---|
| `GET https://t1.meetflowai.site/v1/downloads/ios` | **HTTP 200** |
| Kích thước | **8.243.806 B** |
| `shasum -a 256` | **`0a912cc9d59f83f5a559eb789de7670ea88192a8c8325e36d9966cb5cc8c73ea`** |
| Khớp `live_exception` trong `release-lock.json` | **có** (`build 87`, `status=tam_giu_cho_nghiem_thu`) |

## 3. Chặn thật: không có máy thật

`docs/evidence/bus-1023/device-check.txt`:

```text
$ xcrun devicectl list devices --timeout 10
FSZH Nanshan         ... 372AF2D4-...  unavailable  iPad (A16)
Minh Nguyen’s iPad   ... 5BA3126D-...  unavailable  iPad (A16)
Minh's iphone        ... 33987D6F-...  unavailable  iPhone 14 Pro Max (iPhone15,3)

$ system_profiler SPUSBDataType | grep -iE 'iphone|ipad|apple mobile'
(không có thiết bị iOS nào trên USB)

$ xcrun xctrace list devices
No devices available for the recording
```

Thử kéo log từ iPhone:

```bash
xcrun devicectl device copy from --device 33987D6F-5424-58C7-9CFC-7A0B1F60C717 \
  --domain-type appDataContainer --domain-identifier com.privatevpn.app.packet-tunnel \
  --source Documents --destination /tmp/iphone-accept
# ERROR: CoreDeviceService was unable to locate a device matching the requested device identifier.
#        (DeviceIdentifier: ecid_295838123343902) (com.apple.dt.CoreDeviceError error 1011)
```

⇒ Không thể lấy `Documents/relay.log`, không thể lấy `systemCrashLogs` trong phiên này.

## 4. Cổng §7d trên các log build 87 đã có (không phải phiên sạch tunnel-log-on)

Hai log máy thật build 87 còn giữ trên máy:

| Log | Nội dung | Cổng §7d |
|---|---|---|
| `.tmp/b87-only.log` (678 dòng, 12 phiên 87) | lọc từ log máy thật, SSID `FPT Software Project` | **exit 1** — 1/12 phiên bị cờ `WATCHDOG CÂM` |
| `.privatevpn/tmp/b88/ext/relay.log` (2.963 dòng, 66 phiên; 12 phiên build 87) | log đầy đủ đã kéo trước đó | **exit 1** — 1/66 phiên bị cờ `WATCHDOG CÂM` |

Đếm dấu hiệu trên log b88 (toàn file):

```text
build=87: 12 phiên
sống-còn: nhịp (nhịp tim, chỉ ghi khi bật log chi tiết): 0
bridge: packetFlow (chỉ ghi khi bật log chi tiết):        0
bw: sample (luôn ghi):                                    294
```

Phiên bị cờ (`14:10:22`, 234 s) **có** handshake relay, có traffic thật
(`rawWindowBytes` 3.030.770 / 5.441.406 B), có `bw: sample` tới cuối phiên; nhưng **0 dòng nhịp tim**
vì log chi tiết chưa bật. Đây đúng là **lỗ hổng công tắc log**, không phải bằng chứng watchdog chết —
MAC đã ghi nhận từ bus-993 (mục 6/8.2 của `docs/evidence/bus-993/README.md`).

Vì vậy:

- **Không coi exit 1 này là "87 sai"** để tự động lui 80.
- **Không sửa cổng, không cắt riêng phiên** để tự cho qua.
- **Không `done`** khi chưa có phiên sạch `tunnel-log-on` để cổng trả exit 0.

## 5. Việc còn lại — cần chủ dự án / người cầm máy

1. Cắm iPhone `33987D6F` vào Mac (hoặc bật "Connect via network"), mở khoá máy.
2. Trong app, **bật log chi tiết trước khi bấm Connect**: tạo file rỗng
   `Documents/tunnel-log-on` trong app container, hoặc app truyền
   `providerConfiguration["logVerbose"] = true`.
3. Bấm **Connect**, để chạy **≥ 2 phút** (qua mốc 90 s để cổng đòi nhịp tim), rồi ngắt.
4. MAC chạy:

   ```bash
   xcrun devicectl device copy from --device 33987D6F-5424-58C7-9CFC-7A0B1F60C717 \
     --domain-type appDataContainer --domain-identifier com.privatevpn.app.packet-tunnel \
     --source Documents --destination /tmp/iphone-accept
   xcrun devicectl device copy from --device 33987D6F-5424-58C7-9CFC-7A0B1F60C717 \
     --domain-type systemCrashLogs --source . --destination /tmp/iphone-accept/crash
   python3 scripts/ios-log-acceptance.py /tmp/iphone-accept/relay.log --crash-dir /tmp/iphone-accept/crash
   ```

5. **exit 0** ⇒ báo WIN + cập nhật sổ/khoá 87 (chủ dự án mở khoá).
   **exit 1 với log chi tiết BẬT thật** ⇒ mới kết luận 87 sai và xuất lại IPA 80 từ `e996d12`.

Nếu không cắm được máy: chủ dự án chỉ cần gửi `Documents/relay.log` + crash dir của **một phiên
build 87 có bật log chi tiết**; Mac chạy cổng ngay, không cần thao tác gì thêm trên điện thoại.

## 6. Tệp bằng chứng trong thư mục này

- `device-check.txt` — trạng thái thiết bị + USB + xctrace tại thời điểm kiểm.
- `b87-gate.txt` — output đầy đủ cổng §7d trên 12 phiên build 87 (`.tmp/b87-only.log`), exit 1.
- `b88-gate.txt` — output đầy đủ cổng §7d trên 66 phiên (12 phiên 87), exit 1.
