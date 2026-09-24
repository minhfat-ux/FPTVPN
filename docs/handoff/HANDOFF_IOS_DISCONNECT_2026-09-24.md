# HANDOFF — iOS "tự disconnect / mất mạng" + Diagnostics (24/09/2026)

> Việc: TG-VIBECODE — chủ dự án (bus **#408**, Telegram `/vibecode` lúc 2026-09-24T13:25Z):
> *"bản ios mới không ổn định. Tự disconnect, mất mạng. Thông số trên Diagnostics đang không
> giống của android version. Cần xem lại cách ramp của android mà fix."*
>
> Nhánh việc: **`mac/ios-diag-ramp-408`** (tạo từ `origin/main` @ `3f54f1d`).

## 1. Hiện trạng đo được (không phỏng đoán)

| Nguồn | Số thật |
|---|---|
| Buy đang phát (`GET /v1/app-version?platform=ios`) | `latest_version=1.4.4` |
| IPA đang phát (`/v1/downloads/ios`) | **1.4.4 / build 21**, 8.162.432 B, sha256 `c7b540d1…f95dc5` |
| Trong IPA đang phát | appex **có** `8.8.8.8` (≥5 lần) **và** `deferred-next-connect` → **đã có** vá MTU/DNS + hoãn ramp trong phiên |
| `origin/main` `project.yml` | **1.4.3 / 20** — **thiếu** vá MTU/DNS (mâu thuẫn với bản đã phát) |
| iPhone thật (paired) đang cài | **VPNFlow 1.4.5 / 22** (log `build:` ghi `binary=2026-09-24 22:16:51`) |

⇒ Bản "ios mới" chủ dự án đang test là dòng build **1.4.4/1.4.5** có sẵn các vá gần nhất, **không**
phải `origin/main`. Vì vậy việc "ghi lại main" là bắt buộc để repo khớp bản đã phát.

## 2. Nguyên nhân "tự disconnect, mất mạng" — bằng chứng từ máy thật

Kéo `relay.log` từ extension (`xcrun devicectl device copy from … com.privatevpn.app.packet-tunnel`),
phiên `1.4.5/22` lúc **22:10–22:13 24/09**:

```
22:10:45 giám sát sống-còn: đủ 1 strike — TỰ DỰNG LẠI transport (delta 15s: vào 7484 gói (bỏ 57), ra 5004 gói; …)
22:11:05 giám sát sống-còn: đủ 1 strike — TỰ DỰNG LẠI transport (delta 15s: vào 7491 gói (bỏ 57), ra 5004 gói; …)
22:11:11 tự phục hồi: lần 1/3 — chờ 2s rồi dựng lại
…
22:12:44 giám sát sống-còn: đủ 1 strike — TỰ DỰNG LẠI transport (delta 15s: vào 7623 gói, ra 5004 gói; …)
22:13:02 giám sát: QUYẾT ĐỊNH TỰ GỠ tunnel sau 49.5s — không tiến triển 48s: chiều về đứng yên
         (delta ra 0, tổng ra 5004) trong khi máy vẫn gửi (delta vào 4, tổng vào 7628 …) — quá 45s,
         tunnel không chở được gói
22:13:02 giám sát: ĐÃ gỡ network settings — mạng của máy quay lại đường cũ, báo lỗi cho hệ thống
```

Đọc thẳng ra 3 điều:
1. **Bộ đếm chiều VỀ của cầu bị "đứng"** (`tổng ra` kẹt đúng `5004` suốt 22:10:45→22:13:02) trong khi
   chiều vào vẫn leo và relay vẫn đổi frame (`gửi 17/nhận 10`) ⇒ watchdog kết luận "tunnel không chở
   được gói".
2. Chuỗi tự phục hồi **luôn ghi "lần 1/3"** — bộ đếm lần không leo, nên **không bao giờ tới ngưỡng
   vào HOLD** (chốt 22/09: hết đường thì giữ đường + ping tiếp, KHÔNG gỡ tunnel).
3. Hệ quả: `selfRescue` gỡ network settings (`HysteriaPacketTunnelProvider.swift:1616-1620`) ⇒ khách
   thấy **tự disconnect / mất mạng**. Đây đúng là triệu chứng chủ dự án báo.

Phía Diagnostics: log `bw: sample … liveDown=0 liveUp=0 … src=utun` và `observed=0…113` trong khi
`bridge` vẫn chở gói ⇒ số "Tốc độ tải xuống / Đo được" trên thẻ không phản ánh lưu lượng thật
(khác Android — Android v29 đã đổi nguồn byte sang `TrafficStats` theo UID phủ **mọi** transport).
Bài học §8 của `docs/handoff/HANDOFF_V29_DIAG_2026-09-23.md` nói đúng ca này cho iOS.

## 3. Việc đã làm trong nhánh này (đã kiểm chứng build)

- Cherry-pick `6fa8b1a` (**MTU 1500 → 1300 + 2 DNS resolver**) vào `origin/main`:
  `iOS/PrivateVPN/Services/HysteriaDefaults.swift` (25 dòng). Đây là bản vá đã đo trên iPhone thật
  23/09 (`661 KB/17 phút` → `1,95 MB vào / 22,9 MB ra trong ~50 s`), hiện **thiếu trên main**.
- Build lại từ nhánh này để chứng minh biên dịch + artifact khớp main:
  - `ARCHIVE SUCCEEDED` (phải thêm `OTHER_SWIFT_FLAGS='-disable-sandbox'` + `-skipMacroValidation`
    vì harness DSH chặn sandbox lồng nhau: `sandbox-exec: sandbox_apply: Operation not permitted`
    ⇒ `PreviewsMacros.SwiftUIView` fail).
  - IPA ad-hoc **1.4.3 / 20** (8.174.993 B, sha256 `afc5a92e27a8b0a4b41b4ac4eb9d33603b0192a828cc1e7d4f59b79b8b26792e`);
    appex có `8.8.8.8` (5 lần) ⇒ hằng số mới **nằm thật trong binary**.
  - Cổng chặn version: 7/8 mục ĐẠT; mục **"Phát hành LÙI" KHÔNG ĐẠT** vì marker iOS đang `1.4.4`
    (xem §4).
  - Test logic thuần: `bash scripts/ios-pure-logic-tests/run.sh` → **289/289 PASS, 0 FAIL**.

## 4. Việc CÒN LẠI (không tự quyết)

1. **Kênh iOS lệch số**: marker `latest_version=1.4.4` + IPA `1.4.4/21` trên buy, nhưng repo chỉ có
   `1.4.3/20`. Cổng chặn version **cấm phát hành lùi** ⇒ muốn phát bản vá phải chốt số mới (1.4.5?)
   — cần chủ dự án quyết theo `docs/VERSIONING.md`.
2. **Watchdog gỡ tunnel oan**: sửa đúng chỗ là `HysteriaPacketTunnelProvider.swift:1616-1620`
   (đường `stallTeardownDeadline` phải vào **HOLD** thay vì `selfRescue`, đúng chốt 22/09), **và**
   nguồn byte/đếm gói chiều về phải phủ mọi transport như Android v29. Chưa sửa trong nhánh này vì
   cần đo lại trên máy thật + tránh trùng phiên đang chạy.
3. **Nhiều phiên harness chạy song song** cùng lúc trên máy Mac này (thấy ≥2 `dsh-spill/session-*`
   trong lúc làm) ⇒ dễ giẫm chân khi build/publish; nên chốt 1 phiên cho mỗi việc.

## 5. Bằng chứng đã chạy

```bash
# nhánh
git log --oneline -2   # dcf0d55 (MTU/DNS) → 3f54f1d (origin/main)

# build (log: build/archive-408.log)
bash build/archive-408.sh          # -> ** ARCHIVE SUCCEEDED **
bash scripts/ios-adhoc-export.sh --no-upload   # -> ** EXPORT SUCCEEDED **, FlowVPN.ipa 8.174.993 B

# cổng chặn + test
python3 scripts/check-publish-version.py --platform ios --file build/ios-adhoc-408/ipa/FlowVPN.ipa --version 1.4.3 --build 20
bash scripts/ios-pure-logic-tests/run.sh       # KẾT QUẢ: 289/289 PASS, 0 FAIL

# máy thật
xcrun devicectl device copy from --device 33987D6F-… --domain-type appDataContainer \
  --domain-identifier com.privatevpn.app.packet-tunnel --source Documents/relay.log   # /tmp/relay-device.log
```
