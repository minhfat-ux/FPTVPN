# NGHIỆM THU ĐỘC LẬP TỪ WINDOWS — Android 1.4.3 (versionCode 29)

> Nguồn việc: **bus-282** (`win → mac`). Bên làm artifact: MAC. Bên nghiệm thu (giao việc): **WIN**.
> Ngày: 23/09/2026. Máy: Windows (`DESKTOP-852P1LT`), Android SDK có sẵn
> (`C:\Users\Minhn\Android\sdk`, build-tools 35.0.0), Python 3.12, `gh` đã đăng nhập.
>
> Mục đích: bù lại đúng khoảng trống đã ghi ở `verify fail` trước
> ("KHÔNG nghiệm thu độc lập được từ Windows: badging/cert/zipalign + cổng chặn trên APK").
> Lần này Windows **tự kéo APK về và tự chạy cổng chặn + kiểm tĩnh**, không dùng máy Mac.

## 1. Nguồn artifact (không tin tên file)

Mac staging trên node-2; WIN `scp` về `_work/bus282-verify/`:

| File | Nguồn (node-2) | Bytes | sha256 (WIN tự băm) | Khớp Mac/node-2 |
|---|---|---|---|---|
| `app-modern-release-1.4.3.apk` | `/root/flowvpn-apk/staging/` | 74.731.689 | `9563366995704d9c49c2087b6357e6c9655426cbdee909cecfb0f46515064ce5` | ✅ |
| `app-legacy-release-1.4.3.apk` | `/root/flowvpn-apk/staging/` | 74.748.051 | `fdb88e3febdbab4a243d92d3b743327298d04c9e6e8b7f2fe79b121dd6a5ede9` | ✅ |

`ssh` sang node-2 bằng key có sẵn; node-2 cũng đã tự `sha256sum` ra đúng hai giá trị này.

## 2. Cổng chặn version — ĐẠT (exit 0)

Lấy nguyên script từ nhánh Mac (`origin/mac/android-1.4.3:scripts/check-publish-version.py`),
chạy bằng Python của Windows:

```powershell
python check-publish-version.py --platform android        --file app-modern-release-1.4.3.apk --version 1.4.3 --build 29
python check-publish-version.py --platform android-legacy --file app-legacy-release-1.4.3.apk --version 1.4.3 --build 29
```

Cả hai in `✅ ĐẠT — được phép upload.` và **exit 0**:

| Hạng mục | modern | legacy |
|---|---|---|
| version trong artifact | 1.4.3 / build 29 | 1.4.3 / build 29 |
| mốc control-plane | đang 1.4.0 → phát 1.4.3 (tiến) | nt |
| route tải | HTTP 200 | HTTP 200 |

## 3. Kiểm tĩnh độc lập (aapt2 / zipalign của Windows)

```powershell
$BT = "C:\Users\Minhn\Android\sdk\build-tools\35.0.0"
& "$BT\aapt2.exe"    dump badging <apk>
& "$BT\zipalign.exe" -c -P 16 -v 4 <apk>
```

| Hạng mục | modern | legacy |
|---|---|---|
| applicationId | `com.privatevpn.app` | `com.privatevpn.app` |
| versionCode / versionName | `29` / `1.4.3` | `29` / `1.4.3` |
| minSdk / targetSdk | `26` / `36` | `24` / `36` |
| ABI (native-code) | arm64-v8a, armeabi-v7a, x86, x86_64 | nt |
| `zipalign -c -P 16 -v 4` | exit 0 `Verification succesful` | exit 0 `Verification succesful` |

## 4. Chữ ký + 16 KB page (script riêng, không cần Java)

Máy Windows **không có Java** nên không chạy được `apksigner`; thay bằng script đọc thẳng
APK Signing Block (`_work/bus282-verify/verify-apk-static.py`) — không tin lời khai:

| Hạng mục | modern | legacy |
|---|---|---|
| scheme v2 | CÓ | CÓ |
| scheme v3 | CÓ | CÓ |
| scheme v3.1 | không | không |
| **cert SHA-256** (từ block v2) | `dc6e484bf8ef2eea0dcd15a9192d8233fea1a05068b8ee4486cdc53f456b5e46` | y hệt |
| ELF 64-bit `.so` kiểm | 10 file | 10 file |
| `.so` có `PT_LOAD` align < `0x4000` | **0** | **0** |

Cert khớp **đúng** fingerprint release mà Mac báo ⇒ đúng cert release, không phải debug.
16 KB page: 10/10 file `.so` 64-bit đều `PT_LOAD align = 0x4000`.

## 5. ĐÍNH CHÍNH handoff §6.2 — APK **CÓ** v1, không phải "chỉ v2+v3"

Handoff `BUILD_ANDROID_1.4.3_2026-09-23.md` §6 mục 2 ghi *"Chỉ ký v2 + v3, không có v1 dù
`enableV1Signing = true`"*. Kiểm trực tiếp trên artifact thì **ngược lại**:

| Kiểm | Kết quả (cả 2 APK) |
|---|---|
| `META-INF/MANIFEST.MF` + `CERT.SF` + `CERT.RSA` | **CÓ** |
| Digest entry trong `MANIFEST.MF` khớp nội dung thật | **139/139 khớp**, 0 lệch, 0 thiếu file |
| `SHA-256-Digest-Manifest` trong `CERT.SF` khớp `MANIFEST.MF` thật | **khớp** |

⇒ v1 (JAR signing) **thật sự được áp và phủ đủ 139 entry**, không phải file cũ sót lại.
Câu hỏi mở #2 trong handoff ("có phải chủ ý hay lỗi?") coi như **đã trả lời: v1 có mặt**;
publisher **không cần ký lại** cho đường sideload cũ.

## 6. Mục duy nhất CHƯA nghiệm thu được: §6 test MÁY THẬT

- Thiết bị chuẩn: Samsung **SM-F9460** (Galaxy Z Fold5). Máy này **từng** thấy qua wireless adb
  lúc 12:37 cùng ngày tại `10.193.44.116:43943` (adbkey đã authorize).
- Tại thời điểm nghiệm thu (13:14–13:20), thiết bị **đã rời mạng**:
  - `adb devices` rỗng sau `kill-server` + `adb reconnect offline`;
  - **không** có bản ghi ARP cho `10.193.44.116` (ping sweep cả `/24` không thấy);
  - `ping 10.193.44.116` thất bại (trong khi `.100` thật trả lời, `.201` không tồn tại cũng không trả lời);
  - mDNS `_adb-tls-connect._tcp.local` **không** trả lời (query trực tiếp qua UDP 5353).
- ⇒ Đây là **vướng VẬT LÝ** (điện thoại tắt / khác Wi-Fi / hết pin / đã bị lấy đi), **không phải**
  lỗi build–ký của MAC.

**Điều kiện để chạy tiếp §6:** bật lại SM-F9460 cùng Wi-Fi với máy Windows, bật
**Wireless debugging**, mở khoá màn hình. Sau đó WIN chạy:

```powershell
adb install -r -d app-modern-release-1.4.3.apk     # applicationId com.privatevpn.app
# bật VPN, chạy speedtest ~60s, rồi:
adb shell "grep -E 'sampler nguồn byte|bw: sample|chon-duong|tunnel: UP' /sdcard/Android/data/com.privatevpn.app/files/diagnostics.log | tail -20"
```

Đạt khi: `sampler nguồn byte = TrafficStats theo UID (đường trực tiếp)` khi `tunnel: UP (hy-udp…)`;
`observed=` cùng bậc speedtest (không còn ~5 kbps); `declared` leo theo mạng thay vì kẹt 1.000 kbps.

## 6b. Dò LẠI lúc 13:45–13:56 — điện thoại ĐÃ về Wi-Fi, nhưng cổng adb CHƯA mở

Lần §6 ở trên kết luận "điện thoại rời mạng". Dò lại kỹ hơn thì **điện thoại có ở trên Wi-Fi**,
chỉ có cổng wireless-debugging là không mở — và **lần trước đã dò thiếu vì mDNS đi nhầm card mạng**:

- mDNS (truy vấn PTR/SRV thẳng) trả: `ENDPOINT 10.193.44.103:36793 adb-RFCX110TCWA-tHrUW3._adb-tls-connect._tcp.local`,
  gói trả lời **từ chính 10.193.44.103** với `A Android-4.local = 10.193.44.103` và
  `SRV … -> Android-4.local:36793`.
- Nhưng TCP tới `10.193.44.103:36793` bị **TỪ CHỐI** (`ECONNREFUSED`) — kể cả khi ép card nguồn
  `10.193.44.107`; quét đủ dải 1–65535 chỉ thấy mở `51692` và `64660`; `adb connect` cả hai đều
  `failed to connect` ⇒ **không phải cổng adb**. `adb devices` chỉ còn dòng cũ `10.193.44.116:43943 offline`.
- Suy ra: bản ghi mDNS của Android **còn sót** trong khi adbd không còn nghe cổng đó (Wireless
  debugging đã tắt/đổi cổng). ⇒ Cần người **TẮT rồi BẬT lại Wireless debugging** (hoặc cắm USB).

**Vì sao lần trước kết luận sai "điện thoại tắt" (ghi để không lặp lại):** máy Windows này có card
`tun0` `172.19.0.1` với default route **metric 0**, nên multicast `224.0.0.0/4` bị đẩy sang loopback
(`route print`: `224.0.0.0  240.0.0.0  On-link  127.0.0.1`) ⇒ gói mDNS LAN **không bao giờ tới**.
Phải chỉ định card: `sock.setMulticastInterface("10.193.44.107")` + `addMembership(GROUP, "10.193.44.107")`.
Sau khi sửa, thấy điện thoại ngay lập tức.

**Công cụ đã dựng để §6 chạy được bằng một lệnh:**

| File | Việc |
|---|---|
| `ops/lib/mdns-adb.mjs` | dò endpoint adb qua mDNS (tự chọn đúng card mạng) — `adb mdns services` trên Windows trả rỗng |
| `ops/verify-android-section6.ps1` | `-WaitForDevice -Install` (chờ + cài đè + mở app) và `-Collect` (thu log mới + đối chiếu tiêu chí §6) |
| `_work/bus282-verify/section6-*.log` | bằng chứng từng lần chạy, có mốc thời gian |

Đã hú người qua Telegram: `message_id 1081` (13:44) và `1082` (13:52, kèm hướng dẫn chính xác),
và mở vòng chờ nền 50 phút (`-WaitForDevice -Install`) để tự cài ngay khi cổng adb mở lại.

## 6c. KẾT QUẢ §6 — ĐÃ CHẠY TRÊN MÁY THẬT (13:53–14:11 cùng ngày)

Thiết bị: Samsung **SM-F9460** (Galaxy Z Fold5), Android 16 (`BP4A.251205.006.F9460ZCS9GZH5`),
adb wireless `10.193.44.103:45973` (endpoint do mDNS tự dò; cổng `36793` cũ đã chết).

**Cài đặt** (APK modern release, sha256 `9563366…4ce5`, 74.731.689 byte):
`adb install -r -d` → `Success`; `dumpsys package`: `versionCode=29 versionName=1.4.3`
minSdk=26 targetSdk=36; log mở đầu `=== diagnostics session start (app 1.4.3) ===`.

**Tunnel thật + thoát ra node thật:** `tunnel: UP (hy-tcp:8443)`, `vpn: establish ok tun=130`.
`curl https://www.cloudflare.com/cdn-cgi/trace` **từ chính điện thoại** trả `ip=165.101.114.162`
(đúng node VN) ⇒ lưu lượng thật sự đi qua tunnel, không phải đoán theo tên route.

| Tiêu chí §6 (HANDOFF_V29_DIAG §6) | Kết quả | Bằng chứng trong `diagnostics.log` |
|---|---|---|
| Nguồn byte = `TrafficStats theo UID` khi đường trực tiếp | **ĐẠT** | `bw: sampler nguồn byte = TrafficStats theo UID (đường trực tiếp)` (13:54:43 và 14:00:03) |
| `observed` không còn ~5 kbps; cùng bậc số đo độc lập | **ĐẠT** | 13:57:07 `observed=2508` kbps, cửa sổ đó `curl` độc lập đo **2.555 kbps** (lệch **1,8 %**) |
| `declared` leo theo mạng, không kẹt sàn 1.000 kbps | **ĐẠT** | 4200 → 2940 (`underrun-backoff`) → 3675 → 4593 → 3215 |
| `observed` về ~0 khi rảnh | **ĐẠT** | lúc rảnh `observed=4…22` kbps, khớp Δ`raw`/Δt của bộ đếm |

Số đo độc lập trên máy thật (không lấy số hiển thị trên màn hình):
`curl` qua tunnel không giới hạn → 14.370.304 byte / 45,000 s = **2.555 kbps**.

**Ghi chú trung thực — đọc để không hiểu sai số:**

1. **Speedtest trong Chrome KHÔNG dùng được làm mốc lần này.** Trang `speed.cloudflare.com`
   đứng ở bước *“Measuring Latency · 20 packets”* suốt 13:57–14:10 (RTT tunnel 750 ms, jitter 670 ms);
   số “Download 328/611 kbps” là số cũ đóng băng, còn bộ đếm của app trong cùng khoảng chỉ nhích
   ~4–28 kbps ⇒ lưu lượng gần như không chảy. Vì vậy mốc đối chiếu là `curl` chạy trên chính máy thật.
2. Khi **ghìm tốc độ consumer** (`curl --limit-rate`), bộ đếm theo UID của app tăng **nhiều hơn**
   payload của curl (≈15,5 MB/45 s so với 2,3 MB): nguồn `src=2` đếm mức *trên dây* của socket
   tunnel (gồm truyền lại/đệm khi consumer đọc chậm trên đường RTT cao). **Không phải lỗi cũ**
   (lỗi cũ là báo 5 kbps trong khi tunnel chở 4.463 kbps — tức *thấp* giả tạo); nhưng khi so với
   goodput của **một luồng đơn** thì `observed` có thể cao hơn.
3. Tunnel lần này chạy `hy-tcp:8443` (không phải `hy-udp`) với RTT 0,6–2,5 s, và **tự dựng lại
   1 lần lúc 13:59:59** giữa lúc đo ⇒ mẫu ngay sau mốc đó không dùng để đối chiếu.
4. Bằng chứng thô để tự soát: `_work/bus282-verify/` (`diag-*.log`, `shot-*.png`, `section6-*.log`).

**⇒ §6 ĐẠT.** Việc bus-282 đủ điều kiện `verify --result pass` (KHÔNG publish, KHÔNG đổi mốc —
publish vẫn là quyết định riêng của chủ dự án).

## 7. Kết luận

- **Cổng chặn + toàn bộ kiểm tĩnh: ĐẠT**, đã kiểm **độc lập từ Windows** (không cần Mac);
  chạy lại lúc 13:59 cùng ngày, cả `android` và `android-legacy` đều `exit 0`.
- **Đính chính**: artifact **có v1** (handoff ghi thiếu).
- **§6 test máy thật: ĐẠT** (mục 6c) — chạy trên SM-F9460, tunnel thật, `observed` khớp số đo độc lập
  trong 1,8 %, `declared` leo theo mạng, hết cảnh 5 kbps.
- **KHÔNG publish, KHÔNG đổi mốc** — publish vẫn là quyết định riêng của chủ dự án.
