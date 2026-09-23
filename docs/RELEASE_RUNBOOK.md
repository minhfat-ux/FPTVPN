# RELEASE RUNBOOK — vai trò PUBLISHER (harness Mac)

> Ai: **harness Mac** là publisher chính thức của app & version (iOS, Android, macOS, Windows link).
> Nguyên tắc: **không có bằng chứng = chưa phát hành.** Mọi bước phải có output thật dán vào báo cáo.
>
> ⛔ **ĐỌC `docs/PUBLISHER_PROCESS.md` §0 TRƯỚC MỌI LẦN PHÁT HÀNH.** §0 là **luật** (bảng 9 luật
> mới, 22/09/2026, sinh từ 3 sự cố thật); runbook này chỉ là **lệnh chi tiết**. Luật thắng runbook:
> làm sai thứ tự ⇒ **DỪNG**, hỏi chủ dự án.

## 0. Chín luật mới (22/09/2026) — đối chiếu trước khi phát hành

| # | Luật (PUBLISHER_PROCESS §0) | Bước trong runbook |
|---|---|---|
| 1 | **Cổng chặn version TRƯỚC upload** — đọc version TỪ TRONG artifact, không tin tên file/size/nhật ký | §2 bước 5 |
| 2 | **Chạy lại cổng ở `--mode post` SAU upload** — đọc version file ĐANG PHÁT, đối chiếu mốc | §2 bước 9 |
| 3 | **iOS: nhóm keychain phải có trong CẢ code signature LẪN provisioning profile** (profile thiếu nhóm, hoặc chỉ wildcard `…*` ⇒ `SecItemAdd` trả `-34018` ⇒ khách không đăng nhập được) | §2 bước 3 |
| 4 | **iOS: test trên iPhone THẬT** theo bảng 7 mục §2c (Simulator/máy ảo KHÔNG tính) | §2 bước 2 |
| 5 | **macOS: DMG phải STAPLE**; `stapler validate` + `spctl` + `codesign --deep --strict` đều phải đạt. `spctl` một mình **KHÔNG đủ** | §4 |
| 6 | **Windows: số hiệu nằm trong metadata .exe + UI hiện version** để đối chiếu mốc server | Windows harness phát hành; Mac chỉ **verify** link |
| 7 | **PUBLISHER lo CẢ publish LẪN email.** Windows harness chỉ phát hành **bản Windows**, không tự gửi email khách | §2 bước 10 |
| 8 | **Audit toàn kênh định kỳ**; kênh nào chưa phải latest ⇒ cập nhật link + set mốc + **thông báo khách** | §7 |
| 9 | Chỉ phát **bản MỚI NHẤT đã được test**; publisher **không tự chọn** bản | §2 bước 1b |

**Công cụ dùng chung** (máy thiếu công cụ ⇒ cổng báo `KHÔNG KIỂM ĐƯỢC` exit 2 — **không** giả vờ đạt:
DMG cần macOS, `.exe` cần Windows, APK cần `aapt2`):

```bash
# TRƯỚC upload
python3 scripts/check-publish-version.py --platform <ios|macos|android|android-legacy|windows> \
    --file <artifact> --version <định phát> [--build <n>] [--app-exe <exe>]
# SAU upload (đọc version file ĐANG PHÁT + đối chiếu mốc)
python3 scripts/check-publish-version.py --platform <p> --mode post --version <định phát>
# Audit toàn bộ kênh
python3 scripts/audit-releases.py
```
Mã thoát cổng: `0` = ĐẠT · `1` = KHÔNG ĐẠT ⇒ **DỪNG** · `2` = không kiểm được ⇒ chạy lại trên máy đủ công cụ.

## 1. Bảng version đang phát
> ⚠️ Nguồn xác thực = `python3 scripts/audit-releases.py` (đọc version **BÊN TRONG** từng file đang
> phát) + nhật ký `docs/PUBLISHER_PROCESS.md` §6. **Không** chép số từ tên file / size / nhật ký cũ.
> Bảng dưới là ảnh chụp gần nhất — cập nhật lại sau mỗi lần phát hành.

| Nền tảng | Version | Build/Code | File trên node-2 (route) |
|---|---|---|---|
| iOS | 1.4.0 | 16 | `/root/flowvpn-ipa/VPNFlow-latest.ipa` · `GET /v1/downloads/ios` |
| Android (modern) | 1.4.0 | 20 | `/root/flowvpn-apk/VPNFlow-latest.apk` · `GET /v1/downloads/android` |
| Android (legacy) | 1.4.0 | 20 | `/root/flowvpn-apk/VPNFlow-android7.apk` · `GET /v1/downloads/android-legacy` |
| macOS (DMG) | 1.4.0 | 14 | `/root/flowvpn-mac/VPNFlow-mac.dmg` · `GET /v1/downloads/mac` |
| Windows | 1.4.2 | — | `/var/www/flowvpn/dl/VPNFlow-Setup-*.exe` · `GET /dl/…` (Windows harness phát hành) |

## 2. Hợp đồng bàn giao từ bên build (template)
```
iOS <version> (build <n>) — IPA ad-hoc
  file: <đường dẫn tuyệt đối trên Mac>
  sha256: <hash>
  release notes: release/<file>.md
  đích node-2: /root/flowvpn-ipa/VPNFlow-latest.ipa
  mốc phiên bản: latest_version=<version>, ipa_build=<n>
  xác nhận Dev: ai · ngày · thiết bị thật · kết quả (bảng 7 mục §2c)

Android <version> (versionCode <n>) — APK
  modern: <path>  sha256 <hash>
  legacy: <path>  sha256 <hash>
  release notes: release/<file>.md
  đích node-2: /root/flowvpn-apk/… (đúng tên route /v1/downloads/android đọc)
  mốc: latest_version=<version>
```

## 3. Quy trình iOS (có cổng chặn + test máy thật)
1. **Claim** vùng phát hành (luật §6 AGENTS.md):
   `ssh root@165.101.114.162 flowvpn-coord claim --owner mac --area release --files /root/flowvpn-ipa/ --note "phat hanh iOS <ver>"`
1b. **XÁC NHẬN ĐÚNG BẢN MỚI NHẤT ĐÃ TEST** (`PUBLISHER_PROCESS.md` §2b): đối chiếu manifest
   `docs/RELEASE_ARTIFACTS_<ngày>.md` + commit + xác nhận của Dev (ai · ngày · thiết bị · kết quả)
   cho **đúng sha256/version** sắp phát. Lệch/mơ hồ ⇒ **DỪNG**, hỏi bên build.
2. **Test trên iPhone THẬT theo bảng 7 mục §2c** (Simulator không tính) — thiếu 1 mục ⇒ **DỪNG,
   không phát, không gửi email**. Dán bằng chứng vào claim + nhật ký §6.
3. **Verify file local**: `shasum -a 256 <ipa>` phải **khớp hash bên build gửi**.
   Kiểm nội dung IPA (**đọc từ trong file**, không tin tên file):
   `unzip -q <ipa> -d /tmp/ipachk && PlistBuddy -c 'Print :CFBundleShortVersionString' /tmp/ipachk/Payload/*.app/Info.plist`
   → đúng `<version>`/`<build>`; `ls Payload/*.app/PlugIns/` phải có `PrivateVPNPacketTunnel.appex`.
   **Keychain group phải có trong CẢ HAI nguồn** (luật 3):
   ```bash
   codesign -d --entitlements - /tmp/ipachk/Payload/*.app | grep -A2 keychain-access-groups
   security cms -D -i /tmp/ipachk/Payload/*.app/embedded.mobileprovision | plutil -p - | grep -A3 keychain-access-groups
   ```
   Binary khai `G6XW3RN6LJ.com.privatevpn.shared` **và** profile phải cấp **đúng nhóm cụ thể đó**
   (profile thiếu nhóm hoặc chỉ wildcard `…*` ⇒ PASS nhầm ⇒ khách kẹt đăng nhập — ca thật 22/09/2026).
   Chỉ soi code signature là **KHÔNG đủ**.
4. **Backup bản đang phát** trên node-2: `cp VPNFlow-latest.ipa VPNFlow-<ver-cũ>-<date>.ipa`.
5. **CỔNG CHẶN VERSION (bắt buộc, tự động — không đạt thì DỪNG)**:
   `python3 scripts/check-publish-version.py --platform ios --file <ipa> --version <ver> --build <n>`
   (cổng tự kiểm cả code signature lẫn profile). `exit 1`/`exit 2` ⇒ **không upload**.
6. **Upload**: `scripts/upload-ios-ipa.sh <đường-dẫn-ipa>` (script tự verify qua `/v1/downloads/ios`).
7. **Verify phát hành**: `curl -sI https://t1.meetflowai.site/v1/downloads/ios` → 200 và
   `content-length` khớp size file.
8. **Cập nhật mốc phiên bản**: PATCH `/v1/admin/app-version` với `latest_version=<version>`,
   `ipa_build=<n>` — **đọc JSON trả về thật**, không tin exit code curl (`PATCH` có thể fail im lặng).
9. **CHẠY LẠI CỔNG Ở `--mode post`** (đọc version file ĐANG PHÁT, đối chiếu mốc):
   `python3 scripts/check-publish-version.py --platform ios --mode post --version <ver>`.
10. **Đăng release notes + EMAIL cho user** (publisher lo cả email — luật 7):
    `scripts/send-release-announcement.py` (Resend, gửi từ `support@meetflowai.site`, gửi thử
    `ALERT_EMAIL` trước). Nội dung **chỉ nêu tính năng ĐÃ xong**.
11. **Kiểm chứng cuối + báo cáo**: mở `/install/ios` và `/buy` xem link mới; dán bằng chứng; `release` claim.

## 4. macOS (DMG) — staple là điều kiện sống còn
Build Release → ký → notarize (`notarytool … --wait` = `Accepted`) → **staple**. Thứ tự **bắt buộc**:
ký → submit → staple (ký lại SAU staple là mất vé). Chi tiết: `docs/MACOS_SIGN_NOTARIZE.md` §4.
```bash
xcrun stapler staple VPNFlow-mac.dmg && xcrun stapler validate VPNFlow-mac.dmg
```
**Cổng chặn (luật 5)** — chạy trên macOS, phải ĐẠT **cả 4**:
```bash
python3 scripts/check-publish-version.py --platform macos --file VPNFlow-mac.dmg --version <ver> --build <n>
```
Cổng kiểm `stapler validate` trên DMG, `stapler validate` trên `.app` bên trong,
`spctl -a -t open --context context:primary-signature`, và `codesign --verify --deep --strict`.
⚠️ `spctl` trên **máy build** vẫn báo `Notarized Developer ID` dù DMG **chưa staple** ⇒ không thay được staple.
Sau upload: verify `/v1/downloads/mac` (200 + size) rồi **chạy lại cổng `--mode post`**, PATCH mốc,
gửi email (`scripts/send-mac-announcement.py`), cập nhật `/install/mac`.

## 5. Quy trình Android (có cổng chặn)
1. Claim `release` (như §3 bước 1) + xác nhận bản mới nhất đã test (§2b).
2. `shasum -a 256` **cả 2 APK** (modern + legacy) — khớp hash bên build.
3. Kiểm **bên trong** APK: `aapt2 dump badging <apk> | grep ^package:` → `versionName`/`versionCode`
   khớp manifest; **cả modern + legacy cùng cert**.
4. **Cổng chặn version (luật 1)** — cả 2 file:
   `python3 scripts/check-publish-version.py --platform android --file <apk> --version <ver>` và
   `--platform android-legacy …`. Không đạt ⇒ **DỪNG**.
5. Backup APK đang phát trên node-2.
6. Upload vào **đúng đường dẫn route đọc** (`/root/flowvpn-apk/…`); legacy đi route riêng.
7. Verify: `curl -sI https://t1.meetflowai.site/v1/downloads/android` (và `-legacy`) → 200 + size khớp.
8. PATCH `latest_version=<version>` — **đọc JSON trả về thật**.
9. **Chạy lại cổng `--mode post`**, gửi email, `release` claim + dán bằng chứng.

## 6. Windows (publisher Mac chỉ verify)
Windows harness build + phát hành; số hiệu phải nằm trong metadata `.exe` và UI **Settings → About**
(luật 6). Link `/buy` tự cập nhật khi họ phát hành. Publisher Mac **verify** link trên `/buy` trỏ
đúng file mới + size/hash khớp; **không** tự build Windows, **không** gửi email thay họ (luật 7).

### 6b. Ký số bộ cài (NFR-WIN-002) - BẮT BUỘC trước khi phát hành

Vì sao: máy khách bật **Smart App Control** CHẶN file chưa ký. Đo thật 23/09/2026 trên máy harness
Windows: bộ cài chưa ký bị chặn ngay khi chạy, khách bấm Yes ở UAC vẫn không cài được -
`os error 4551`, event `CodeIntegrity` 3033/3077/3118, policy `{0283ac0f-fff1-49ae-ada1-8a933130cad6}`.
Đây cũng là lý do SmartScreen cảnh báo "Windows protected your PC".

**Chứng chỉ (việc của chủ dự án - Q2 trong `docs/spec/WINDOWS_CLIENT_REQUIREMENTS.md`):**
repo **chưa có** chứng chỉ code-signing nào. Cần một trong hai:
- **OV/EV code signing** mua từ CA (DigiCert / Sectigo / SSL.com...): ký bằng token hoặc HSM, cert
  nằm trong certificate store của máy build.
- **Azure Trusted Signing** (rẻ hơn, không cần token): dùng `signtool` với `/dlib` + metadata file,
  khi đó truyền `-SigntoolPath` và tự cấu hình theo tài liệu Microsoft.

**KHÔNG được hard-code chứng chỉ/mật khẩu vào repo.** Cấu hình qua biến môi trường (hoặc tham số):

| Biến | Ý nghĩa |
|---|---|
| `VPNFLOW_SIGN_CERT_THUMBPRINT` | thumbprint cert trong store. **KHUYẾN NGHỊ**: không có mật khẩu ở đâu cả |
| `VPNFLOW_SIGN_PFX_PATH` + `VPNFLOW_SIGN_PFX_PASSWORD` | nếu dùng file `.pfx` (mật khẩu không bao giờ được in ra log) |
| `VPNFLOW_SIGN_TIMESTAMP_URL` | mặc định `http://timestamp.digicert.com` |
| `VPNFLOW_SIGNTOOL` | đường dẫn `signtool.exe`; để trống thì tự dò |

`signtool` lấy được **không cần cài cả Windows SDK** (đã kiểm chứng 23/09/2026): gói NuGet
`Microsoft.Windows.SDK.BuildTools` chứa `bin/<ver>/x64/signtool.exe`. `build.ps1` tự dò
`%LOCALAPPDATA%\VPNFlowTools\signtool\signtool.exe`, rồi tới Windows Kits, rồi PATH.

**Build có ký:**
```powershell
$env:VPNFLOW_SIGN_CERT_THUMBPRINT = "<thumbprint>"
powershell -ExecutionPolicy Bypass -File windows\installer\build.ps1 -RequireSigning
```
`build.ps1` sẽ: ký `PrivateVPNWindows.App.exe` + `PrivateVPNWindows.*.dll` + `flowvpnrelay.exe` trong bộ
publish, rồi ký **cả Setup lẫn uninstaller** (`VPNFlow.iss` chỉ bật `SignTool` + `SignedUninstaller` khi
có `/DSignedBuild`), rồi **cổng chặn cuối**: mọi file phát hành phải có chữ ký VÀ `signtool verify /pa` ĐẠT.

Không cấu hình gì thì vẫn build được nhưng in CẢNH BÁO TO (bản chưa ký sẽ bị SAC/SmartScreen chặn).
`-RequireSigning` biến cảnh báo đó thành lỗi cứng - đường phát hành nên dùng. `-AllowUntrustedSignature`
chỉ để THỬ dây ký bằng cert tự ký, **KHÔNG** dùng để phát hành.

**Bằng chứng phải có khi phát hành** (NFR-WIN-002): output `signtool verify /pa` + `Get-AuthenticodeSignature`
của **cả** `VPNFlow-Setup-*.exe` **và** `PrivateVPNWindows.App.exe`, cho thấy `Status = Valid` và có timestamp.

**Không ký lại binary bên thứ ba** (`sing-box.exe`, `wireguard-go.exe`, `wintun.dll`): ký đè lên chữ ký
của người khác là việc không được phép làm. Ghi nhận: `sing-box.exe` từng bị SAC chặn (19/09/2026, 16 lần);
đo 23/09/2026 thì `sing-box version` chạy bình thường, tức Microsoft đã cho qua.

## 7. Audit toàn kênh (định kỳ — luật 8)
Mỗi nền tảng phải đang phục vụ **đúng bản latest**. Kênh lệch ⇒ (a) cập nhật lại link tải + set mốc,
(b) **thông báo khách**, rồi ghi nhật ký §6.
```bash
python3 scripts/audit-releases.py            # tải TỪNG artifact thật rồi đọc version BÊN TRONG
python3 scripts/audit-releases.py --no-download   # chỉ mốc + size (nhanh, KHÔNG kết luận đạt)
python3 scripts/audit-releases.py --platform ios  # một nền tảng
```
Mã thoát: `0` mọi kênh khớp · `1` có kênh **LỆCH** (phải xử lý) · `2` có kênh chưa đối chiếu được
(macOS cần máy Mac, APK cần `aapt2`, `.exe` cần Windows — Mac đọc được size/sha256 nhưng không đọc
được `VersionInfo`). Kết quả audit dán vào nhật ký §6.

**Chạy định kỳ (health-watch, luật 8)** — cài 1 lần bằng launchd, ghi log JSONL, gọi alert Telegram
khi có kênh lệch. Audit tải ~230 MB mỗi vòng nên đặt nhịp thưa (6h):
```bash
scripts/install-release-audit-watch.sh            # launchd StartInterval 21600s
INTERVAL=3600 scripts/install-release-audit-watch.sh   # đổi nhịp
scripts/install-release-audit-watch.sh --dry-run  # chỉ in plist
# hoặc không dùng launchd:
python3 scripts/audit-releases.py --interval 21600 \
    --log ~/.vpnflow-release-audit.jsonl \
    --alert-cmd 'scripts/release-audit-alert.sh'
```
`--alert-cmd` nhận JSON kết quả qua stdin + env `AUDIT_EXIT`/`AUDIT_VERDICT`/`AUDIT_BASE`.
⚠️ Mac đọc version `.exe` **không được** (cần Windows) ⇒ trên Mac kênh Windows luôn là
"không kiểm được", **không phải lệch**; Windows harness phải verify riêng số hiệu `.exe`.

## 8. Rollback (khi bản mới lỗi)
1. Đổi `VPNFlow-latest.ipa` (hoặc APK/DMG) về file backup **cùng tên** ⇒ link tải cũ hoạt động lại ngay.
2. PATCH `latest_version` về bản cũ (nếu đã đẩy) ⇒ app không còn bị hối cập nhật.
3. Ghi rõ lý do rollback + thời điểm vào `docs/` (hoặc Telegram) để không mất dấu.

## 9. Lỗi đã từng xảy ra (đọc để không lặp lại)
- **Tên file/mốc không phải version thật (21/09)**: installer `VPNFlow-Setup-1.4.1.exe` nhưng app bên
  trong ghi `FileVersion = 1.0.0` ⇒ **luôn đọc version từ BÊN TRONG artifact** (cổng 1c/5b).
- **Phát hành bản không phải latest đã test (20/09)**: route `/v1/downloads/mac` phục vụ DMG 1.3.3
  trong khi bản đã test là 1.4.0 ⇒ khách tải nhầm bản cũ 5 ngày (nay là bước 1b/§2b bắt buộc).
- **iOS ký lại mất nhóm keychain** ⇒ app kẹt màn hình đăng nhập (nay cổng kiểm cả signature lẫn profile).
- **macOS `spctl` báo Notarized nhưng DMG chưa staple** ⇒ khách "không thể mở" (nay staple là bắt buộc).
- **Sai host trong link**: `/buy` từng trỏ `api.meetflowai.site/dl/...` ⇒ 401. Link tải phải là host
  **`t1.meetflowai.site`** hoặc `meetflowai.site` (`/dl/...`), không phải `api.`.
- **Link 404 oan do cache Cloudflare**: thêm `?v=<số>` khi test; gọi thẳng origin để phân biệt.
- **PATCH `latest_version` thất bại mà im lặng**: phải đọc response JSON, không chỉ exit code curl.
- **Thiếu handle Caddy**: thêm route trong Node là chưa đủ — phải thêm `handle` ở Caddy.
- **Đổi relay/hạ tầng mà client còn cache URL cũ** ⇒ toàn bộ khách "mất mạng". Giữ host relay
  `wss://api.meetflowai.site/relay/*`; release nào đổi hạ tầng phải chạy song song đường cũ.

## 10. Bằng chứng tối thiểu cho mỗi lần phát hành
```
shasum -a 256 <file>                     (khớp hash bên build)
version/build đọc từ trong file          (không tin tên file)
cổng chặn: pre exit 0  +  post exit 0    (check-publish-version.py)
[macOS] stapler validate + spctl + codesign --deep --strict đều đạt
[iOS]   keychain group có trong cả code signature lẫn provisioning profile
[iOS]   bảng 7 mục §2c trên iPhone THẬT (ảnh + log)
curl -sI <link phát hành> → 200 + size
PATCH version → response JSON thật
email: kết quả gửi (số người nhận / id)
link trên /buy và /install/* đã trỏ bản mới
audit-releases.py (định kỳ) → exit 0 hoặc danh sách kênh lệch đã xử lý
```
