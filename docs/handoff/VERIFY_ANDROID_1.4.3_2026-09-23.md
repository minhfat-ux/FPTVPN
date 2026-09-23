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

## 7. Kết luận

- **Cổng chặn + toàn bộ kiểm tĩnh: ĐẠT**, đã kiểm **độc lập từ Windows** (không cần Mac).
- **Đính chính**: artifact **có v1** (handoff ghi thiếu).
- **Còn thiếu duy nhất §6** → `verify bus-282 --result fail` (giữ việc mở), KHÔNG publish,
  KHÔNG đổi mốc.
