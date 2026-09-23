# BUILD + KÝ RELEASE ANDROID 1.4.3 (versionCode 29) — 23/09/2026

> Nguồn việc: **bus-282** (`Windows -> Mac TASK: build + KY RELEASE Android 1.4.3 (versionCode 29) cho publisher`).
> Bên làm: **MAC**. Nguồn build: commit **`86944de`** (`fix(android): v29 — Diagnostics do dung moi transport
> (TrafficStats theo UID) + giu MTU 1300/2 resolver`) — worktree sạch, **KHÔNG** gồm thay đổi `windows/**` đang dở.
> Ngày build: 23/09/2026.

## 1. Artifact (2 biến thể, cùng một cert release)

| Biến thể | Đường dẫn trên máy build (Mac) | Kích thước (bytes) | sha256 |
|---|---|---|---|
| modern (minSdk 26) | `/Users/minhnguyen/FlowGPT/.tmp/ghome/.vpnflow-build/app/outputs/apk/modern/release/app-modern-release.apk` | 74.731.689 | `9563366995704d9c49c2087b6357e6c9655426cbdee909cecfb0f46515064ce5` |
| legacy (minSdk 24) | `/Users/minhnguyen/FlowGPT/.tmp/ghome/.vpnflow-build/app/outputs/apk/legacy/release/app-legacy-release.apk` | 74.748.051 | `fdb88e3febdbab4a243d92d3b743327298d04c9e6e8b7f2fe79b121dd6a5ede9` |

Ghi chú đường dẫn: bản build này chạy trong sandbox chỉ-ghi-được-vào-repo, nên thư mục build của Gradle được
trỏ vào workspace (`-Duser.home=…/.tmp/ghome`) thay vì `~/.vpnflow-build` mặc định. Nội dung/nhãn file y hệt
bản build thường (`app-modern-release.apk`, `app-legacy-release.apk`).

## 2. Kiểm tra artifact (đã chạy thật)

| Hạng mục | Kết quả |
|---|---|
| applicationId | `com.privatevpn.app` (KHÔNG `.dev`) — cả 2 biến thể |
| versionCode / versionName | `29` / `1.4.3` (KHÔNG hậu tố `-dev`) — cả 2 biến thể |
| minSdk / targetSdk | modern `26` / `36`; legacy `24` / `36` |
| ABI | `arm64-v8a`, `armeabi-v7a`, `x86`, `x86_64` |
| Ký | 1 signer; v2 = true, v3 = true, v1 = false |
| Cert (cả 2) | DN `CN=Minh Nguyen Binh, OU=VPNFlow, O=VPNFlow, L=Hanoi, ST=Hanoi, C=VN`; SHA-256 `dc6e484bf8ef2eea0dcd15a9192d8233fea1a05068b8ee4486cdc53f456b5e46` (cert release, không phải debug) |
| `zipalign -c -P 16 -v 4` | `Verification succesful` (16 KB) — cả 2 |
| **16 KB page (ELF)** | mọi `.so` 64-bit trong APK có `LOAD align = 0x4000` (16384) |

Lệnh đã dùng:
```bash
BT="$HOME/Library/Android/sdk/build-tools/35.0.0"
"$BT/aapt2" dump badging  <apk> | grep -E '^package:|minSdkVersion|targetSdkVersion'
"$BT/apksigner" verify --verbose --print-certs <apk>
"$BT/zipalign" -c -P 16 -v 4 <apk>
# ELF: llvm-readelf -l <lib.so> → dòng LOAD cuối = 0x4000
```

### 2.1 16 KB page — phải sửa nguồn native (không chỉ zipalign)

AAR `hysteria.aar` cũ (trong `86944de`) có `jni/arm64-v8a/libgojni.so` **LOAD align = 2**12 (4096)** ⇒
Android 15/16 trên thiết bị trang 16 KB cảnh báo/bị chặn. `libwg*.so` (WireGuard) và
`libandroidx.graphics.path.so` đã sẵn `0x4000`.

Đã dựng lại `android/app/libs/hysteria.aar` từ `tools/hysteria-android/build.sh` bằng Go 1.26.6 +
gomobile (`github.com/sagernet/gomobile`) + NDK r25, ép linker căn 16 KB:

- Trước: `libgojni.so` (4 ABI) `LOAD align = 0x1000`.
- Sau: `libgojni.so` (4 ABI) `LOAD align = 0x4000`.
- AAR mới: 30.527.366 bytes, sha256 `f43dbf0f8d5d0b82479bd442cde92ffe0318f9b32c884d50a927ab61ebde9f4a`
  (AAR gốc: 29.714.478 bytes, sha256 `ce4d074c0bd604e90080a00cec7dab8827f0ebd01613c27a127d0ce1c9ec9168`).
- API Java xuất ra không đổi: `Mobile.connect(String,long,String,String,long,boolean,long,long)`,
  `Mobile.serve(long,long,String,String)`, `Mobile.stop()`.

## 3. Cổng chặn version (`scripts/check-publish-version.py`) — ĐẠT, exit 0

```bash
python3 scripts/check-publish-version.py --platform android \
  --file <modern.apk> --version 1.4.3 --build 29          # exit 0
python3 scripts/check-publish-version.py --platform android-legacy \
  --file <legacy.apk>  --version 1.4.3 --build 29          # exit 0
```

Cả hai đều in `✅ ĐẠT — được phép upload.` với: version trong artifact `1.4.3`/build `29` khớp;
mốc control-plane đang `1.4.0` → phát `1.4.3` (tiến); route tải `HTTP 200`.

## 4. Lệnh build (để tái lập)

```bash
# 0) lấy đúng nguồn
git worktree add --detach .worktrees/android-v29 86944de
cp android/../../… (không cần) ; echo "sdk.dir=$HOME/Library/Android/sdk" > android/local.properties

# 1) dựng lại AAR 16 KB (nếu cần)
JAVA_HOME=/opt/homebrew/opt/openjdk@17 ANDROID_NDK_HOME=$HOME/Library/Android/sdk/ndk/25.2.9519653 \
  tools/hysteria-android/build.sh

# 2) build 2 biến thể release (ký bằng keystore ngoài repo; ở đây truyền qua env)
JAVA_HOME=/opt/homebrew/opt/openjdk@17 ANDROID_HOME=$HOME/Library/Android/sdk \
STORE_FILE=$HOME/keystores/vpnflow-release.jks STORE_PASSWORD=… KEY_ALIAS=vpnflow KEY_PASSWORD=… \
  ./gradlew :app:assembleModernRelease :app:assembleLegacyRelease
```

`tools/hysteria-android/build.sh` đã được chỉnh (commit kèm): `GOWORK=off` (hysteria có `go.work`, chạy
`-mod=mod` trong workspace mode bị từ chối), thêm dependency `github.com/sagernet/gomobile/bind@v0.1.13`
(gomobile trên máy Mac là bản fork sagernet), và `-ldflags=-extldflags=-Wl,-z,max-page-size=16384`.

## 5. Test MÁY THẬT theo handoff v29 §6 — **CHƯA CHẠY**

- `adb devices` **rỗng** (không có điện thoại/emulator cắm vào máy Mac tại thời điểm build; `~/.android/avd` cũng rỗng).
- Vì vậy **chưa có** bằng chứng log `bw: sample observed=…` / `declared` trên bản release này.
- Khi có máy (bật USB debugging), chạy đúng §6 của `HANDOFF_V29_DIAG_2026-09-23.md`:
  ```bash
  adb -s <serial> install -r -d <apk>        # release: applicationId com.privatevpn.app
  # bật VPN, chạy speedtest ~60s, rồi:
  adb shell "grep -E 'sampler nguồn byte|bw: sample|chon-duong|tunnel: UP' \
    /sdcard/Android/data/com.privatevpn.app/files/diagnostics.log | tail -20"
  ```
  Đạt khi: `sampler nguồn byte = TrafficStats theo UID (đường trực tiếp)` lúc `tunnel: UP (hy-udp…)`;
  `observed=` cùng bậc speedtest (không còn ~5 kbps); `declared` leo theo mạng thay vì kẹt 1.000 kbps.

## 5.1 Đã đẩy APK release lên node-2 staging — 23/09/2026 (bus #291 CHỐT)

Chủ dự án chốt: **Windows chạy §6** (đã thấy máy `SM-F9460` qua wireless adb) ⇒ **Mac KHÔNG** thử
adb/pair. Việc của Mac là đẩy 2 APK release lên node-2 để Windows kéo về, chạy lại cổng chặn độc lập
rồi cài + chạy §6.

| File trên node-2 (`/root/flowvpn-apk/staging/`) | Bytes | sha256 **do chính node-2 `sha256sum`** |
|---|---|---|
| `app-modern-release-1.4.3.apk` | 74.731.689 | `9563366995704d9c49c2087b6357e6c9655426cbdee909cecfb0f46515064ce5` |
| `app-legacy-release-1.4.3.apk` | 74.748.051 | `fdb88e3febdbab4a243d92d3b743327298d04c9e6e8b7f2fe79b121dd6a5ede9` |

- Cả hai **khớp đúng sha256** của bản build trên Mac (§1); quyền `644`; thư mục `755`.
- Cách làm: chia mỗi APK thành 15 part 5 MB, `scp` song song 8 luồng, **so sha256 từng part** rồi mới
  `cat` ghép lại trên node-2 (30/30 part khớp trước khi ghép) — tránh đứt kết nối làm hỏng file.
- **KHÔNG publish, KHÔNG đổi mốc/version** — chỉ staging để kiểm độc lập.

## 6. Việc chưa xong

1. **Test máy thật (§6)** — Mac **không có thiết bị** (`adb devices` rỗng). Theo CHỐT bus #291, mục này
   **chuyển cho Windows** chạy trên `SM-F9460` (wireless adb); APK release đã staging sẵn ở node-2 (§5.1)
   để Windows kéo về cài và dán log `bw: sample observed/declared`. Đây là mục duy nhất trong 9 yêu cầu
   của bus-282 còn chờ bằng chứng §6.
2. **Chỉ ký v2 + v3, không có v1** dù `build.gradle.kts` bật `enableV1Signing = true`. minSdk 24 nên v2 là đủ
   để cài trên Android 7+; nếu publisher cần v1 cho đường sideload cũ thì phải ký lại/điều tra tiếp.
3. **Chưa được kiểm chứng độc lập trên thiết bị**: hành vi Diagnostics v29 (TrafficStats theo UID) mới chỉ
   được soi tĩnh trong APK; chưa xác nhận số đo thật.
4. Theo đúng yêu cầu bus-282: **KHÔNG tự publish, KHÔNG gửi email**. Publisher (owner Windows) làm bước
   upload/mốc/số/tag sau khi gộp email Android 1.4.3 + Windows 1.4.5.
5. Môi trường build có ràng buộc sandbox/đĩa: phải trỏ build dir vào workspace và tạm dọn một số cache/DerivedData
   (Go build cache, `.macrelease/dd`, `hotel-ipa/build/DerivedData*` — đều là output/cache tái sinh được) để có chỗ.
   Không đụng tới source của task khác.
