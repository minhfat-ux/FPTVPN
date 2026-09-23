# HANDOFF v30 — SỬA SỐ KHAI TỰ BÓP KHI TẢI KIỂU ADAPTIVE (23/09/2026)

> Tiếp nối `HANDOFF_V29_DIAG_2026-09-23.md`. Bản này **thay thế** phần build của v29:
> build mới nhất là **versionCode 30 / versionName 1.4.3-dev**.

## 1. Lỗi phát hiện được (do chính v29 làm số đo trung thực trở lại nên mới nhìn ra)

Chủ dự án xem **Netflix** trên máy thật; log `bw: sample` xen kẽ **cụm tải** và **giây nghỉ**:

```
14:34:05 1.911 kbps   14:34:22     7 kbps   14:34:37 1.795 kbps   14:34:54     5 kbps
14:35:09 1.094 kbps   14:35:24   768 kbps   14:35:39   431 kbps   14:35:54 2.006 kbps
```

Đó là cách video adaptive chạy: tải một cụm cho đầy buffer rồi **nghỉ**. Hệ quả trong log:

```
14:30:31  bw: ramp net=wifi-gw observed=4034 old=3215 new=4018 reason=idle-reconnect
14:33:50  bw: ramp net=wifi-gw observed=591  old=4018 new=2812 reason=underrun-backoff  loss=10%
```

`observed` là **trung bình 12 giây** — tính cả các giây nghỉ nên bị kéo xuống, app kết luận
"đường yếu" và **tự hạ số khai** (4.018 → 2.812 kbps) **ngay giữa lúc người dùng đang xem**.
Vì Brutal CC pace theo số khai, chuỗi này thành **vòng lặp ngược**:
số khai thấp ⇒ video tụt chất lượng ⇒ nhu cầu ít ⇒ trung bình càng thấp ⇒ lại hạ tiếp.

Lỗi này **không phải lỗi đo** (v29 đã làm số đo khớp thực tế) mà là **chọn sai chỉ số để quyết định**.

## 2. Đã sửa

| File | Sửa gì |
|---|---|
| `vpn/BandwidthMemory.kt` | Thêm `ACTIVE_SAMPLE_KBPS = 200` (mẫu ≥ mức này là "đang chở dữ liệu"), `UNDERRUN_MIN_BUSY_SAMPLES = 8`, hàm thuần `activeSustainedKbps(samples, count)` (trung bình **chỉ các mẫu hoạt động** + số mẫu hoạt động). `shouldRampDownUnderrun(...)` nhận thêm `busySamples` (mặc định `MAX_VALUE` = hành vi cũ) và **chỉ kết luận đường yếu khi cửa sổ đủ mẫu hoạt động**. |
| `vpn/HysteriaVpnService.kt` | Vòng lấy mẫu tính `activeAvg`/`busyCount`; dùng `sustainedForDecision` = trung bình mẫu hoạt động khi `busyCount ≥ 8`, ngược lại dùng trung bình thường (⇒ lúc rảnh hoặc nhu cầu thấp vẫn giữ hành vi cũ, không hạ oan). Số này dùng cho `updateRampState` (STABLE), `shouldRampUp`, `goodputCollapsed`, dòng "Đo được" trên Diagnostics. Chỗ hạ số khai đổi từ điều kiện yếu `idleRun == 0` (chỉ cần **mẫu cuối** đang bận) sang `busyCount ≥ 8` (cả cửa sổ phải thật sự bị đẩy). Log thêm `active=<kbps>/<số mẫu>`. |
| `app/build.gradle.kts` | `versionCode = 30`. |
| `app/src/test/.../BandwidthPolicyTest.kt` | +6 test: bỏ giây nghỉ, không có mẫu hoạt động, không hạ số khai khi nhu cầu thấp (ca Netflix), ngưỡng 7 vs 8 mẫu, giữ hành vi cũ cho chỗ gọi không truyền `busySamples`. |

Nguyên tắc giữ nguyên: **hạ số khai phải dựa trên bằng chứng ĐƯỜNG yếu, không phải bằng chứng
NHU CẦU thấp.** Lưới an toàn cũ (khai đỉnh cũ nhưng mạng mới yếu hẳn, RTT không vọt) vẫn hoạt
động: khi đó người dùng kéo liên tục ⇒ cửa sổ đủ mẫu hoạt động ⇒ `underrun-backoff` vẫn bắn.

## 3. Bằng chứng

```
dotnet? -> không liên quan; đây là Android:
gradlew :app:testModernDebugUnitTest --tests "com.privatevpn.app.BandwidthPolicyTest"
  -> tests=29 failures=0 errors=0 skipped=0
gradlew :app:assembleModernDebug                      -> BUILD SUCCESSFUL
APK: versionCode=30 versionName=1.4.3-dev
     sha256 38B5979AB984689E028CE608620802AE33E26C1D0C681C29592A637A0BD132AD (113.422.837 byte)
     trong dex có activeSustainedKbps / UNDERRUN_MIN_BUSY_SAMPLES / ACTIVE_SAMPLE_KBPS
```

**Lưu ý còn tồn tại (không do bản này):** `PinnedDnsConfigTest."api host and ws relay host are
pinned to literal addresses"` **đỏ từ 18/09/2026** — nó khẳng định `api.meetflowai.site` phải có IP
ghim, trong khi quyết định 18/09 (ghi ngay trong `Config.PINNED_HOST_ADDRESSES`) là **cố ý KHÔNG
ghim** host đó (ghim IP node làm mỗi lần kết nối trên data di động TQ phải chờ hết timeout ~8s ⇒
"connecting rất lâu"). Test này làm `:app:testModernDebugUnitTest` (và `check`) đỏ bất kể bản vá
nào. **Cần chủ dự án quyết**: sửa test cho khớp quyết định 18/09, hay ghim lại IP cho host API.
Agent Android **không tự sửa** vì đây là thay đổi chính sách cấu hình.

## 4. Cách nghiệm thu trên máy

Bản `.dev` v30 **đã cài** trên Z Fold5 (versionCode 30). Kiểm khi xem video (Netflix/YouTube) hoặc
tải file liên tục:

```powershell
adb shell "grep -E 'bw: sample' /sdcard/Android/data/com.privatevpn.app.dev/files/diagnostics.log | tail -10"
node tools\check-sampler-math.mjs <log> 20
```

Đạt khi:
1. Trong lúc xem video, **không còn** dòng `bw: ramp … reason=underrun-backoff` khi `active` vẫn cao;
2. `active=<kbps>/<số mẫu>` cho thấy khi tải cụm thì tốc độ thật, và `busyCount` nhỏ khi video nghỉ;
3. `declared` **không tụt** giữa phiên xem bình thường (chỉ tụt khi mất gói/RTT vọt thật).

## 5. Việc còn lại (không nằm trong bản này)

1. **Chặng 5G của máy anh đang có vấn đề riêng**: khi chuyển sang data di động, log cho thấy
   `default=cell` nhưng transport rơi vào **cầu WS** và bộ đếm cầu chỉ **9–370 kbps**
   (`14:37:11 observed=274`, `14:37:27 observed=10`) ⇒ đường relay qua Cloudflare rất chậm từ
   Unicom 5G, trong khi đường trực tiếp `hy-tcp:8443` trên Wi-Fi chở được 2–5 Mbps. Cần đo lại
   riêng: đường trực tiếp tới node có bị chặn trên 5G không, và vì sao app lại rơi về cầu WS.
2. `PinnedDnsConfigTest` đỏ (xem §3) — chờ chủ dự án quyết.
3. Mac: căn 16 KB page + keystore; iOS/macOS: quy tắc "bộ đếm byte phải phủ mọi transport" (§9 của
   handoff v29) và cùng lỗi "số khai tự bóp khi tải adaptive" nếu bên đó cũng lấy trung bình có giây nghỉ.
