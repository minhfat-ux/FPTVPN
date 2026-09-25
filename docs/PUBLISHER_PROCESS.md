# PUBLISHER PROCESS — luật & quy trình phát hành app/version

> **Vai trò publisher tách theo KÊNH (chủ dự án chốt 23/09/2026):**
> - **harness Mac** = publisher cho **iOS + macOS** (IPA ad-hoc/TestFlight, DMG).
> - **harness Windows** = publisher cho **Windows + Android** (bộ cài `.exe`, APK modern/legacy).
> Mỗi bên chạy các bước §1 **chỉ cho kênh của mình**; kênh không thuộc phần mình ⇒ **không tự phát**
> (chuyển sang bên kia hoặc báo chủ dự án). Dùng chung: `release/releases.jsonl`, `check-publish-version.py`,
> `audit-releases.py`.
> Tài liệu này là **luật**: làm sai thứ tự ⇒ dừng, hỏi chủ dự án.
> Đọc kèm: `docs/RELEASE_RUNBOOK.md` (lệnh chi tiết), `docs/RELEASE_ARTIFACTS_<ngày>.md` (bàn giao từ bên build).

## 0. PROCESS ĐÃ ĐỔI (22/09/2026) — MỌI BÊN ĐỌC TRƯỚC KHI PUBLISH
> Sinh ra từ **3 sự cố thật trong cùng một ngày** (khách Windows cài bản ghi `FileVersion 1.0.0`;
> khách iOS nhập code xong không vào được app; khách macOS cài xong báo *"không thể mở"*).
> Bảng này là **việc phải cập nhật vào process của từng bên** — không phải gợi ý.

| # | Luật mới | Mục | Ai phải làm |
|---|---|---|---|
| 1 | **Cổng chặn version bắt buộc trước upload**: đọc version TỪ BÊN TRONG artifact (không tin tên file/size/nhật ký), đối chiếu số định phát + mốc; chặn phát lùi/phát trùng | §1c bước 1c, §2 | publisher (mọi nền tảng) |
| 2 | **Sau upload chạy lại cổng ở `--mode post`** — đọc version trong file ĐANG PHÁT, đối chiếu mốc | §1c bước 5b | publisher |
| 3 | **iOS: nhóm keychain phải có trong CẢ code signature LẪN provisioning profile.** Profile thiếu nhóm (hoặc chỉ có wildcard `…*`) ⇒ `SecItemAdd` trả `-34018` ⇒ khách **không đăng nhập được** | §2, `IOS_INSTALL_TROUBLESHOOTING.md` §0a | bên ký iOS (Mac) + publisher verify |
| 4 | **iOS: test trên iPhone THẬT** (Simulator không tính) theo bảng 7 mục §2c trước khi phát | §2c | bên build iOS (Mac) |
| 5 | **macOS: DMG phải STAPLE**; `stapler validate` + `spctl` + `codesign --deep --strict` đều phải đạt. `spctl` một mình **KHÔNG đủ** (máy build báo Notarized dù chưa staple) | `MACOS_SIGN_NOTARIZE.md` §4a | bên ký macOS (Mac) |
| 6 | **Windows: số hiệu phải nằm trong metadata .exe** (`<Version>` trong csproj + `/p:Version` khi publish) và **UI hiện version** để đối chiếu mốc server | `windows/installer/build.ps1` bước 3b, Settings → About | Windows harness |
| 7 | **PUBLISHER lo CẢ publish LẪN email.** Windows harness chỉ phát hành bản Windows rồi bàn giao số liệu — **không tự gửi email khách** | §5 | publisher |
| 8 | **Audit toàn kênh định kỳ**: kênh nào chưa phải latest ⇒ cập nhật lại link tải + set mốc + **thông báo khách** | §7 mục 5 (`scripts/audit-releases.py`) | publisher |
| 9 | Chỉ phát **bản mới nhất đã được test** — publisher không tự chọn bản | §2b | publisher |
| 10 | **ĐỌC HẾT HANDOFF TRƯỚC KHI LÀM** (thêm 22/09 sau ca *báo trùng việc đã xong*): trước khi claim / kiểm / publish phải chạy `ls -t docs/handoff/` → **đọc file mới nhất**, rồi đối chiếu `release/releases.jsonl` + `git tag -l`; việc đã xong ⇒ **không báo lại, không phát lại** (phát trùng cùng version khác hash = cấm) | §0 luật này · `docs/VERSIONING.md` §3.3 | **mọi agent** — nhất là publisher khi nhận lệnh "check & publish" |
| 11 | **Windows: bộ cài PHẢI được KÝ SỐ trước khi publish** (NFR-WIN-002). Máy khách bật Smart App Control **chặn bộ cài chưa ký** (`os error 4551`, event `CodeIntegrity` 3077/3033/3118) ⇒ khách tải từ `/buy` vẫn **không cài được**. Bằng chứng bắt buộc thêm khi publish: `signtool verify /pa` **và** `Get-AuthenticodeSignature` cho **cả** `VPNFlow-Setup-*.exe` **và** `PrivateVPNWindows.App.exe` (`Status = Valid` + có timestamp). **Chưa có chứng chỉ ⇒ KHÔNG publish bản Windows** | `RELEASE_RUNBOOK.md` §6b · `docs/handoff/HANDOFF_WINDOWS_KY_SO_2026-09-23.md` §0.2–3, §5, §10.4 | Windows harness (build + ký) + publisher (chạy/đối chiếu bằng chứng) |

> **Ngoại lệ luật 11 — chốt 23/09/2026 (chủ dự án):** bản **`1.4.5` đã được phát CHƯA KÝ** (sha256 `d6db58cb…167a2`), đúng như mọi bản Windows trước đó (1.4.0→1.4.4 đều
> `NotSigned`). Lý do: máy có SAC bật vẫn cài được, kênh Windows mới có 3 thiết bị, và **Mac xác nhận không có chứng chỉ Authenticode** (bus #307:
> `docs/handoff/HANDOFF_MAC_CERT_WINDOWS_2026-09-23.md`). Ngoại lệ **có ghi sổ** (`release/releases.jsonl`, dòng `windows 1.4.5`), cổng pre ghi rõ mục chữ ký
> `KHÔNG ĐẠT` và post `ĐẠT`. **Ngoại lệ hết hiệu lực ngay khi có chứng chỉ** — từ bản kế tiếp phải ký theo luật này.

| 12 | **Phân chia publisher theo kênh** (chốt 23/09/2026): **Mac → iOS + macOS**; **Windows harness → Windows + Android**. Bên nào cũng phải tự chạy cổng §1c/§5b + ghi sổ cho kênh của mình; **không publish kênh không thuộc phần mình**. Email thông báo khách do publisher của kênh đó gửi | §0 (đầu tài liệu) | mọi publisher |
| 13 | **Cổng LOG MÁY THẬT phải chạy kèm `--crash-dir`** (25/09/2026, sau ba lỗi LỌT cổng cũ): phiên chứa `JetsamEvent`/`PrivateVPNPacketTunnel-*.ips` (iOS giết extension vì `per-process-limit`, `rpages=3202` ≈ 51 MB) ⇒ KHÔNG ĐẠT; thêm tiêu chí **CHIỀU VỀ ĐÓNG BĂNG một chiều** (Mac relay `vn1hy` 19:42–19:43: máy gửi 1277 gói mà `Go→packetFlow` đứng ở 360729 gói) và **phiên đầu file** (trước mốc `build:` đầu tiên). **Còn bug mức `high` chưa đóng trên bản định phát ⇒ KHÔNG publish** | AGENTS.md §7d · `scripts/ios-log-acceptance.py` · `.privatevpn/status/bugs.json` | bên build iOS/macOS + publisher |

**Công cụ dùng chung cho mọi bên:**
```bash
python3 scripts/check-publish-version.py --platform <ios|macos|android|windows> \
    --file <artifact> --version <định phát> [--build <n>] [--app-exe <exe>]   # TRƯỚC khi upload
python3 scripts/check-publish-version.py --platform <p> --mode post --version <định phát>   # SAU khi upload
python3 scripts/audit-releases.py        # audit toàn bộ kênh (đọc version bên trong từng artifact)
```
`check-publish-version.py` chạy trên máy **không đủ công cụ** sẽ báo `KHÔNG KIỂM ĐƯỢC` (exit 2) —
**không** giả vờ đạt. DMG cần macOS, `.exe` cần Windows, APK cần `aapt2`.

## 1. Luồng bắt buộc: BUILD → HANDOFF → PUBLISH → ANNOUNCE
```
[máy build]  build xong, ghi docs/RELEASE_ARTIFACTS_<ngày>.md (bảng: file, size, sha256, version, ký, đích node-2, mốc)
             ⚠️ manifest ghi rõ mục "Việc chưa xong" — publisher KHÔNG được quảng cáo mấy mục đó
      ↓
[publisher]  1. CLAIM vùng release trên bảng việc chung (AGENTS.md §6)
             1b. XÁC NHẬN ĐÚNG BẢN MỚI NHẤT ĐÃ TEST (§2b) — đối chiếu manifest + commit với bản
                 Dev đã test/verify; lệch hoặc mơ hồ ⇒ DỪNG, hỏi lại bên build
             1c. CỔNG CHẶN VERSION (bắt buộc, TỰ ĐỘNG — không đạt thì DỪNG):
                 python3 scripts/check-publish-version.py --platform <ios|macos|android|windows> \
                     --file <artifact> --version <định phát> [--build <build>] [--app-exe <exe>]
                 · exit 0 = được upload
                 · exit 1 = DỪNG (version trong file ≠ định phát, thiếu extension, hoặc PHÁT LÙI)
                 · exit 2 = KHÔNG KIỂM ĐƯỢC (thiếu công cụ: DMG cần macOS, .exe cần Windows,
                   APK cần aapt2) ⇒ chạy trên máy đủ công cụ rồi mới upload
             2. VERIFY từng file (bảng §2) — sai/không khớp ⇒ DỪNG, báo lại bên build
             3. BACKUP bản đang phát trên node-2 (đổi tên có ngày)
             4. UPLOAD đúng đường dẫn route đọc (§3)
             5. VERIFY link phát hành: HTTP 200 + content-length KHỚP size file
             5b. CHẠY LẠI CỔNG ở chế độ SAU-upload (đọc version trong file ĐANG PHÁT, đối chiếu mốc):
                 python3 scripts/check-publish-version.py --platform <p> --mode post --version <định phát>
                 (đây là bước bắt được ca macOS 21/09: file đang phát là 1.3.3 nhưng mốc ghi 1.4.0)
             6. SET MỐC version (§4) ×em response thật, không tin exit code curl
             7. RELEASE NOTES đã có trong repo ⇒ ghi nhật ký (§6)
             8. EMAIL thông báo user (§5) — nội dung chỉ nêu tính năng ĐÃ xong
             9. Xác nhận trên kênh khách: /buy, /install/ios, /install/mac trỏ bản mới
            10. Báo cáo bằng chứng + RELEASE claim
```

### 1d. Vì sao có cổng chặn 1c/5b (hai sự cố thật, 21/09/2026)
- **macOS**: route `/v1/downloads/mac` phát DMG **21.617.309 B** (bản **1.3.3 build 13** theo nhật ký §6)
  trong khi mốc `latest_mac_version` quảng bá **1.4.0**, và `minimum_mac_version = 0.0.0` nên không ai
  được nhắc cập nhật ⇒ khách tải "1.4.0" nhưng nhận 1.3.3. Tin tên file / tin mốc là **không thấy**.
  - **ĐÍNH CHÍNH 22/09/2026 (Mac chạy cổng §5b, đọc TỪ TRONG DMG)**: file đang phát
    (21.617.309 B · sha256 `9d05f271232b75ddbae281059ff48355d5162032cb2a86114fafc130bfd54597`,
    giống nhau trên `meetflowai.site` và `t1.meetflowai.site`) chứa **1.4.0 / build 14**
    (`com.privatevpn.mac`), **không** phải 1.3.3/13 như suy từ size + nhật ký §6 ⇒ mốc
    `latest_mac_version=1.4.0` **đang khớp** bản phát. Bài học rộng hơn: đừng tin cả size/nhật ký,
    luôn đọc version từ trong artifact (đúng tinh thần cổng 1c/5b). Cổng macOS cũng đã sửa để đọc
    `VPNFlow.app/Contents/Info.plist` (trước chỉ tìm `.app/Info.plist` nên luôn báo "không thấy").
- **Windows**: bộ cài tên `VPNFlow-Setup-1.4.1.exe` nhưng app bên trong khai `FileVersion = 1.0.0.0`
  (`windows/installer/build.ps1` giải version **sau** bước `dotnet publish` nên không truyền
  `/p:Version`) ⇒ không cách nào biết bản đã cài là bản nào. Đã sửa thứ tự + thêm cổng ngay trong
  `build.ps1` (bước 3b) và hiện số hiệu ở **Settings → About** của app (số của app + mốc trên server,
  khác nhau là thấy ngay).


## 2. Bắt buộc verify trước khi upload (không có ngoại lệ)
| Kiểm | Lệnh | Điều kiện đạt |
|---|---|---|
| sha256 | `shasum -a 256 <file>` | **khớp 100%** hash trong manifest |
| Version iOS | `unzip -q <ipa> -d /tmp/x && PlistBuddy -c 'Print :CFBundleShortVersionString' /tmp/x/Payload/*.app/Info.plist` | khớp `version` + `build` trong manifest (**đọc từ trong file**, không tin tên file) |
| Extension iOS | `ls /tmp/x/Payload/*.app/PlugIns/` | có `PrivateVPNPacketTunnel.appex` |
| Keychain group iOS (**cả code signature LẪN profile**) | `codesign -d --entitlements - /tmp/x/Payload/*.app \| grep -A2 keychain-access-groups` **và** `security cms -D -i /tmp/x/Payload/*.app/embedded.mobileprovision \| plutil -p - \| grep -A3 keychain-access-groups` (hoặc chạy thẳng `scripts/check-publish-version.py --platform ios` — đã tự kiểm mục này) | binary khai `G6XW3RN6LJ.com.privatevpn.shared` **và profile PHẢI cấp đúng nhóm đó**. Profile thiếu nhóm ⇒ `SecItemAdd` trả `errSecMissingEntitlement (-34018)` ⇒ **nhập code xong không vào được app** (ca thật 22/09/2026). ⚠️ Chỉ soi code signature là **KHÔNG đủ** — bản lỗi đó vẫn PASS lệnh cũ |
| APK | `aapt2 dump badging <apk> \| grep ^package:` | `versionName`/`versionCode` khớp manifest; **cả modern + legacy cùng cert** |
| Size sau upload | `stat -c %s <file>` trên node-2 | khớp size file local |
| Cổng chặn version §2b (chạy TRƯỚC khi upload) | `python3 scripts/check-publish-version.py --platform <ios\|android\|android-legacy\|macos\|windows> --file <artifact> --version <ver> [--build <n>]` | exit **0 = ĐẠT** · **1 = KHÔNG ĐẠT ⇒ DỪNG** · **2 = không kiểm được ⇒ chạy lại trên máy đủ công cụ** (macOS cho DMG, Windows cho `.exe`, Android SDK cho APK). Sau khi upload kiểm lại bằng `--mode post` |

## 2b. Bắt buộc: chỉ phát hành bản MỚI NHẤT đã được test + verify với Dev
> Thêm 2026-09-22 (yêu cầu chủ dự án). Publisher **không tự chọn** bản để phát hành — chỉ phát đúng
> bản mà Dev đã test và xác nhận. **Thiếu 1 trong 4 điều kiện dưới đây ⇒ DỪNG**, báo lại bên build.

| # | Kiểm | Điều kiện đạt |
|---|---|---|
| 1 | Manifest bàn giao | `docs/RELEASE_ARTIFACTS_<ngày>.md` có bảng version/size/sha256/commit **đúng nền tảng**; đọc cả mục "Việc chưa xong" trước khi viết email |
| 2 | Bản mới nhất về nguồn | commit trong manifest là commit mới nhất đã verify: `git log -1` khớp, và **không** có commit sau nó đụng `ios/**`, `android/**`, `mac/**`, `windows/**` mà chưa test |
| 3 | Xác nhận của Dev | có dấu "đã test + verify" của người làm ra bản đó: **ai · ngày · máy/thiết bị · kết quả thật** (log/số đo/evidence). Chỉ nhận xác nhận cho **đúng sha256 + version** mình sắp phát |
| 4 | So với bản đang phát | file trên node-2 + mốc `latest_version` đang phát phải **cũ hơn** bản mới; bản định phát **≤** bản đang phát ⇒ DỪNG (tránh phát lùi/phát trùng) |

**Kênh xác nhận:** note trong `claim` ở bảng việc chung (AGENTS.md §6) + Telegram. Hai bên build đưa 2 bản
khác nhau cho **cùng một version** ⇒ chỉ lấy bản có xác nhận test **mới hơn**; còn mơ hồ ⇒ **dừng**, hỏi
chủ dự án/orchestrator — publisher không tự phán.

### 2c. iOS: BẮT BUỘC test trên iPhone THẬT trước khi publish (chủ dự án chốt 22/09/2026)
Simulator/máy ảo **không tính** (tunnel, NetworkExtension, khoá keychain, watchdog chỉ đúng trên máy thật).
Điều kiện #3 ở §2b với iOS được cụ thể hoá thành:

| Mục | Yêu cầu | Bằng chứng |
|---|---|---|
| Thiết bị | iPhone **thật**, ghi rõ model + phiên bản iOS | ảnh `Settings → General → About` |
| Đúng bản | cài từ IPA **đúng sha256** định phát (không phải build khác cùng version) | ảnh `Settings → About` trong app hiện đúng version/build |
| Luồng cơ bản | đăng nhập → kết nối → xác nhận IP thoát → dùng thật **≥10 phút** (duyệt web/app) | ảnh + log chẩn đoán |
| Đổi mạng | chuyển **Wi-Fi ↔ 4G** giữa phiên: ghi lại hành vi (tự phục hồi hay phải bấm Connect lại) | log + mô tả |
| Ngắt VPN | ngắt ⇒ máy **không mất mạng** (route về đường trực tiếp) | ảnh + kết quả `curl`/duyệt web |
| Watchdog (bản 1.4.1+) | log chứng minh **0 lần kết luận oan**; chủ động chặn/kill đường relay ⇒ app **tự dựng lại** trong bao lâu | log có mốc thời gian |
| UI version | `Settings → About` hiện số hiệu + đối chiếu mốc server | ảnh màn hình |

**Thiếu bất kỳ mục nào ⇒ DỪNG: không phát hành, không gửi email.** Bằng chứng dán vào claim + nhật ký §6.

## 3. Đích trên node-2 (route nào đọc file nào)

> **Ngoại lệ KHÔNG được đổi host: relay WS.** Mọi link khách bấm đều dùng `t1.meetflowai.site`, nhưng
> relay (`wss://api.meetflowai.site/relay/vn1wg|vn1hy|vn2wg|vn2hy`) **phải giữ host `api.meetflowai.site`**
> vì Caddy chỉ route `/relay/*` trên host đó — đổi là toàn bộ khách mất mạng. `check-public-surface.py`
> có mục kiểm riêng cho việc này.
| Nền tảng | File trên node-2 | Route phát |
|---|---|---|
| iOS (IPA ad-hoc) | `/root/flowvpn-ipa/VPNFlow-latest.ipa` | `GET /v1/downloads/ios` |
| Android modern | `/root/flowvpn-apk/VPNFlow-latest.apk` | `GET /v1/downloads/android` |
| Android legacy | `/root/flowvpn-apk/VPNFlow-android7.apk` | `GET /v1/downloads/android-legacy` |
| macOS | `/root/flowvpn-mac/VPNFlow-mac.dmg` | `GET /v1/downloads/mac` |
| Windows | `/var/www/flowvpn/dl/VPNFlow-Setup-*.exe` | `GET /dl/…` (harness Windows phát hành; publisher chỉ **verify** link trên `/buy`) |
Luôn kiểm bằng host vào được từ TQ: `https://t1.meetflowai.site/...`. Gặp 404 oan ⇒ thêm `?v=<hash>` (cache Cloudflare).

## 4. Mốc phiên bản (để app biết có bản mới)
| Nền tảng | Endpoint | Field |
|---|---|---|
| iOS | `PATCH /v1/admin/app-version` | `latest_version`, `ipa_build` |
| Android | `PATCH /v1/admin/android-version` | `latest_version` |
| Windows | `PATCH /v1/admin/windows-version` | `latest_version` (script `scripts/send-update-announcement.sh`) |
**Luật:** chỉ set `latest_version` (+ `ipa_build`). **KHÔNG** đặt `minimum_version` (buộc cập nhật) trừ khi chủ dự án chốt rõ.
`ipa_build` phải khớp `CFBundleVersion` trong IPA — lệch là manifest OTA sai.

## 5. Email thông báo cho user
- **Ai gửi (chủ dự án chốt 22/09/2026): PUBLISHER lo cả publish lẫn email.** Harness Windows chỉ
  phát hành **bản Windows** (§3) rồi bàn giao số liệu; **không tự gửi email** cho khách.
- Kênh: Resend, gửi từ `support@meetflowai.site` (env `RESEND_API_KEY` trong drop-in của control-plane).
- Danh sách người nhận: user trong `auth.json` (script tự đọc).
- **Nội dung phải có**: tên nền tảng + version, 2–4 tính năng ĐÃ XONG (lấy từ release notes), link tải (`t1.meetflowai.site`), câu hỗ trợ `support@meetflowai.site`.
- **Cấm**: quảng cáo mục nằm trong "Việc chưa xong" của manifest; hứa hẹn ngày phát hành; gửi khi mốc version chưa set xong.
- Trạng thái hiện tại: script `send-update-announcement.sh` có template Windows (zh) ⇒ **cần bổ sung template iOS/Android** trước khi dùng cho 2 nền tảng đó (việc tồn, xem §7).

## 5b. Khách chưa tải được / chưa chạy được (rà soát sau mỗi lần phát hành)
Dùng `scripts/send-reinstall-guide.py` (chạy trên node-2, đọc `auth.json` + `devices.json`):

```bash
python3 scripts/send-reinstall-guide.py --stuck        # chỉ LIỆT KÊ (không gửi)
python3 scripts/send-reinstall-guide.py --all-stuck    # gửi hết danh sách
python3 scripts/send-reinstall-guide.py --email a@b.com,c@d.com
python3 scripts/send-reinstall-guide.py --all-stuck --test   # gửi thử tới ALERT_EMAIL
```

- Tiêu chí "bị tắc" (bằng chứng dữ liệu, không đoán): **(a)** có gói còn hạn nhưng **không có device nào** ⇒ app chưa từng chạy/đăng ký; **(b)** có device nhưng `lastSeenAt` rỗng ⇒ app chạy nhưng chưa từng kết nối.
- Nội dung email: 3 ngôn ngữ, 4 nền tảng, link `t1.meetflowai.site`, nêu rõ **bản Ad Hoc không cần Developer Mode**, xoá app cũ trước khi cài, và xin ảnh lỗi + model máy.
- Vết gửi: `/root/flowvpn-cp/data/reinstall-guide-log.jsonl`; đối chiếu trạng thái thật bằng Resend list API (`last_event = delivered`).
- Nhịp: chạy `--stuck` sau mỗi lần phát hành; khách đăng ký mới mà quá 24h chưa có device ⇒ thêm vào danh sách gửi.

## 5c. Guard tự động (khách mới chưa cài/chưa chạy được)
`flowvpn-guard.service` trên node-2 chạy mỗi 5 phút: phát hiện khách **mới đăng ký** mà không có
device (`never_installed`) hoặc có device nhưng `lastSeenAt` rỗng (`never_connected`) → tự gửi email
hướng dẫn theo đúng nền tảng + phiên bản đang phát; ≥3 khách cùng nền tảng trong 24h → tạo task +
alert Telegram, **chờ chủ dự án `/approve` mới được sửa**; khi bản mới publish → tự đóng task và mời
lại khách bị ảnh hưởng. Chính sách: `/etc/flowvpn-guard.env`. Chi tiết: `PROTOCOL.md` §9.

## 6. Nhật ký phát hành (cập nhật mỗi lần)
| Ngày | Nền tảng | Version/build | Ghi chú |
|---|---|---|---|
| 2026-09-22 | Windows | **1.4.4** | 🔒 **LOCKED** (vẫn giữ máy test) — **KHÔNG đổi chức năng so với 1.4.3**, chỉ **khớp lại mốc commit build**. Lý do: bản 1.4.3 build từ cây làm việc ở HEAD cũ nên app khai `ProductVersion = 1.4.3+7ae07f0…` trong khi sổ/tag ghi `64e07c7` ⇒ lệch mốc "khách chạy build từ mã nguồn nào"; **không phát lại cùng số 1.4.3 với hash khác** vì luật artifact bất biến (`docs/VERSIONING.md` §3.3). Nay `ProductVersion = 1.4.4+8466b18…` **khớp** sổ + tag. Bằng chứng không đổi chức năng: `git diff 64e07c7..8466b18 -- windows` **chỉ** khác `csproj` (dòng `<Version>`) + `build.ps1`, **không file `.cs` nào đổi**. Setup **52.792.515 B** · sha256 `d9956056…ae1be` · `/buy` trỏ `?v=d9956056` · mốc `latest_version=1.4.4` · **cổng chặn: pre ĐẠT, post ĐẠT** · `dotnet test` 202/202 · release notes `docs/RELEASE_NOTES_1.4.4.md`. **Sửa gốc chống tái diễn** (`build.ps1`): DỪNG nếu `windows/` còn thay đổi chưa commit + nhúng commit tường minh (`SourceRevisionId`) + **cổng 3c** đọc lại `ProductVersion` phải bằng `<version>+<commit>` — cổng này bắt được ngay 1 lỗi thật ở lần build đầu (`<v>+<sha>.<sha>`) |
| 2026-09-22 | Windows | ~~**1.4.3**~~ | ⚠️ **ĐÃ BỊ THAY bởi 1.4.4** (cùng nội dung, khác mốc commit). **A7 IPv6** (dải TQ đi thẳng, IPv6 còn lại vẫn chặn — server không có IPv6) + **sửa lỗi nghiêm trọng**: script PowerShell dò gateway chứa dấu `"` bị mất khi truyền `-Command` ⇒ `TryGetPhysicalGatewayAsync` luôn `null` ⇒ máy có **Clash/Mihomo/Tailscale** thêm route loại trừ endpoint qua chính adapter ảo ⇒ **vòng lặp, tunnel không lên** (lỗi im lặng). Sửa bằng `-EncodedCommand`. Setup 52.791.547 B · sha256 `fdd6f73a…ee7c1`. ⚠️ **`ProductVersion` ghi SAI commit (`7ae07f0`)** — xem dòng 1.4.4. **IPv6 đã BỎ QUA** theo chốt của chủ dự án 22/09 |
| 2026-09-22 | Windows | **1.4.2** | Sửa **metadata version** (bản 1.4.1 phát ra có `FileVersion 1.0.0.0` dù installer tên 1.4.1) + `Settings → About` hiện số hiệu và đối chiếu mốc server. Setup 52.794.169 B · sha256 `60ea6f31…86c6` · `/buy` trỏ `?v=60ea6f31` · mốc `latest_version=1.4.2` · **cổng chặn `scripts/check-publish-version.py` chạy cả 2 chế độ: pre ĐẠT, post ĐẠT** (đọc version trong file ĐANG PHÁT = 1.4.2) |
| 2026-09-20 | iOS | 1.4.0 (16) | **Ký lại Ad Hoc cho 8 UDID** (`get-task-allow=false` ⇒ khách KHÔNG cần Developer Mode) · IPA đang phát 8.135.823 B · manifest `bundle-version` 16 |
| 2026-09-19 | iOS | 1.4.0 (15) | IPA 5.049.845 B · sha256 `b6bf9a04…0677` · đã upload + set mốc |
| 2026-09-19 | Android | 1.4.0 (20) | file đang phát trên node-2: modern 96.536.145 B (`/root/flowvpn-apk/VPNFlow-latest.apk`, 19/09 22:25 — sau fix timeout `a41bc6e`+`2c34cfb`) · legacy 96.536.152 B |
| 2026-09-19 | Android | 1.4.0 (20) | modern 96.519.741 B `a780a773…56e8` · legacy 96.536.114 B `e36b4fcb…bc46` · đã upload + set mốc |
| 2026-09-18 | Windows | Setup 1.0.7 | do harness Windows phát hành; link `/buy` có `?v=<hash>` |
| 2026-09-18 | iOS | 1.3.3 (14) | bản trước, đã được thay bằng 1.4.0 |
| 2026-09-18 | Android | 1.3.9 | trước 1.4.0 |
| 2026-09-20 | macOS | 1.3.3 (13) | **Ký Developer ID + notarize + staple** (DMG 21.617.309 B) → khách mở không cảnh báo · email 3 ngôn ngữ gửi 17/17 khách |
| 2026-09-22 | macOS | 1.4.0 (14) | **Đo lại bằng cổng chặn §5b**: DMG đang phát (21.617.309 B · sha256 `9d05f271…`) đọc từ trong file ra `CFBundleShortVersionString=1.4.0`, `CFBundleVersion=14` → **khớp** mốc `latest_mac_version=1.4.0`; đính chính mục 1d |

| 2026-09-21 | dev | guard + link | **Thống nhất mọi link khách tải về `t1.meetflowai.site`** (env `PUBLIC_SITE_URL`+`API_HOSTS`, `ios_ipa_url`/`android_apk_url(_legacy)`/`windows_installer_url`) · thêm `flowvpn-guard` (email tự động cho khách mới bị tắc + task chờ approve trên Telegram: `/guard`, `/approve`, `/reject`) |

| 2026-09-23 | iOS | 1.4.1 (18) | **Trang buy**: IPA ad-hoc mới `/root/flowvpn-ipa/VPNFlow-latest.ipa` 8.119.092 B · sha256 `89a17e4d…ba73` · mốc `latest_ios_version=1.4.1` + `ipa_build=18` (minimum giữ 1.3.3) · backup bản cũ `VPNFlow-latest.bak-1.4.0-b16-20260923-105752.ipa`. **App Store Connect/TestFlight**: build 18 đã `VALID`, internal `IN_BETA_TESTING`; external `READY_FOR_BETA_SUBMISSION`. Profile ad-hoc 8 UDID **không đổi** so với bản 16; `get-task-allow=False` ⇒ khách không cần Developer Mode |

### 6b. iOS có HAI kênh — đừng lẫn
- **Trang buy / khách cài trực tiếp**: IPA **ad-hoc** (`/root/flowvpn-ipa/VPNFlow-latest.ipa`, route `/v1/downloads/ios`),
  mốc `latest_ios_version` + `ipa_build`. Bản này chỉ cài được trên máy có UDID trong profile.
- **TestFlight / App Store Connect**: build **app-store-connect** (export `scripts/archive-appstore.sh ios direct`),
  app id `6804150049` (bundle `com.privatevpn.app`), key `~/.appstoreconnect/private_keys/AuthKey_8GW3662G64.p8`
  (issuer `7a64d085-c03d-4b10-9b96-ff8e00c42e79`). Kiểm tra bằng API: `GET /v1/builds?filter[app]=…`
  → `processingState=VALID`; `buildBetaDetail.internalBuildState=IN_BETA_TESTING` là tester nội bộ dùng được,
  `externalBuildState=READY_FOR_BETA_SUBMISSION` là còn phải nộp Beta App Review mới tới tester ngoài.
- **Không dùng IPA ad-hoc để nộp TestFlight** và ngược lại (profile app-store có 0 UDID nên cài trực tiếp sẽ fail).

| 2026-09-23 | iOS | 1.4.1 (18) — thông báo | Gửi email 3 ngôn ngữ cho khách **đang dùng iOS** (script `scripts/send-ios-1.4.1-announcement.py`): **6/6 delivered** (04:09 UTC). Nội dung chỉ nêu tính năng có trong build 18 (watchdog tự phục hồi, tự dựng lại, sửa mất mạng IPv6, đường TQ đi thẳng, Settings hiện version). Release notes: `release/ios/RELEASE_NOTES_1.4.1.md` |
| 2026-09-23 | iOS | 1.4.1 (18) — TestFlight | Nộp **Beta App Review** cho tester ngoài: build vào nhóm `External Test`, "What to Test" 3 ngôn ngữ (en-GB/vi/zh-Hans), state `WAITING_FOR_REVIEW` (nộp 11:08 VN, submission id = build id `14c65fa9-…`) |

| 2026-09-23 | iOS | **1.4.2 (19)** | **Trang buy**: IPA ad-hoc 8.152.677 B · sha256 `eba2e856…ea31b` · mốc `latest_ios_version=1.4.2` + `ipa_build=19` (minimum giữ 1.3.3) · manifest `bundle-version 19` · tải thật qua t1 khớp sha. Gồm `7c98e53` (tự đăng xuất thiết bị khác) + `820b9d2`/`ff08f5b` (watchdog) + bỏ nhóm keychain dùng chung. **Email**: 6/6 khách iOS `delivered` (kèm thông báo đăng nhập lại 1 lần) · §2c: chủ dự án xác nhận "iOS verified and Passed". Sự cố khi phát: SSH key mất quyền + quoting lệnh claim ⇒ upload đứt, file đang phát bị cụt 2,85 MB — đã đẩy lại bản đầy đủ, verify sha256 rồi mới set mốc; tool đã sửa thành **upload nguyên tử** (file tạm + verify + mv). **TestFlight build 19: chờ bản export app-store-connect** |

| 2026-09-24 | iOS | 1.4.3 (20) — **backfill sổ** | Bản 1.4.3 (20) đã phát lúc 07:53 (+07) nhưng **thiếu dòng sổ**; đã ghi bù khi phát 1.4.4 (`--origin backfill`): 8.175.010 B · sha256 `b2432247…282bc1` · mtime `2026-09-24T00:53:05Z`. Đây cũng là lý do 1.4.4 phải **tăng số** thay vì phát lại 1.4.3: cùng version mà khác sha256 = vi phạm artifact bất biến (`docs/VERSIONING.md` §3.3) |

| 2026-09-24 | iOS | **1.4.4 (21)** | **Trang buy**: IPA ad-hoc 8.162.432 B · sha256 `c7b540d1…f95dc5` · app **và** appex đều `1.4.4/21` · mốc `latest_ios_version=1.4.4` + `ipa_build=21` (minimum giữ **1.3.3**) · manifest `bundle-version 21` · tải thật qua t1 khớp sha · profile 9 UDID `get-task-allow=false`, không nhóm keychain dùng chung · backup bản cũ `VPNFlow-latest.bak-1.4.3-b20-20260924-131447.ipa`. **Cổng chặn pre + post: ĐẠT**. Nội dung: **chỉ sửa đường HIỂN THỊ thẻ Diagnostics** (giữ `serving` suốt phiên, số live lấy trung bình 3 mẫu, "Khai báo hiện tại" in số đang áp dụng) — đo trên binary `__text` extension **+1.216 B** so với 1.4.3 (20). Release notes `docs/RELEASE_NOTES_IOS_1.4.4.md` · manifest `docs/RELEASE_ARTIFACTS_2026-09-24.md`. **§2c: chủ dự án chốt "phát hành chính thức luôn"** khi iPhone/iPad đều `unavailable` (không cắm cáp) và deploy không dây không khả dụng ⇒ **phát trước, test máy thật ngay sau khi cài OTA** (như 1.4.2/19); **chưa gửi email** — chờ chủ dự án xác nhận |

## 7. Việc tồn của publisher
1. ~~Template email iOS/Android~~ **ĐÃ XONG 20/09**: `scripts/send-release-announcement.py` (iOS+Android 1.4.0, 3 ngôn ngữ) và `scripts/send-mac-announcement.py` (bản macOS đã ký+notarize, 3 ngôn ngữ, cờ `--all` để gửi toàn bộ khách). Cả hai có bước gửi thử tới ALERT_EMAIL trước khi gửi thật.
2. Đưa **release notes** lên web (hiện chỉ nằm trong repo `release/<platform>/RELEASE_NOTES_<ver>.md`).
3. Tự động hoá:
   - ~~`publish-ios.sh`~~ **ĐÃ XONG 23/09**: `scripts/publish-ios.sh <ipa> <version> <build> [--dry-run]`
     chạy đủ §1 — verify TỪ TRONG IPA (version/build/bundle/appex/profile ad-hoc + `get-task-allow=false`
     + keychain group) → claim → backup bản cũ → upload → verify sha256/size trên server → PATCH mốc
     (đọc JSON trả về) → verify app-version + manifest + tải thật + `/install/ios` + `/buy` → release claim.
   - **TestFlight**: `scripts/asc-beta.mjs status | submit <build> [--group "External Test"] [--whatsnew <json>] [--wait]`
     (gán nhóm external + "What to Test" nhiều ngôn ngữ + nộp Beta App Review, đọc trạng thái từ API).
   - Còn lại: `publish-android.sh` (APK modern+legacy, các bước tương tự).
4. Kiểm tra định kỳ: link phát hành còn 200 + size khớp (đưa vào `health-watch`).
5. **AUDIT toàn kênh (chủ dự án yêu cầu 22/09/2026)** — mỗi nền tảng phải đang phục vụ ĐÚNG bản latest;
   kênh nào lệch thì **cập nhật lại link tải + set mốc + thông báo khách**:
   ```bash
   python3 scripts/audit-releases.py            # tải TỪNG artifact thật rồi đọc version BÊN TRONG
   python3 scripts/audit-releases.py --no-download   # chỉ mốc + size (nhanh, KHÔNG kết luận đạt)
   ```
   Mã thoát: `0` mọi kênh khớp · `1` có kênh LỆCH (phải xử lý) · `2` có kênh chưa đối chiếu được
   (macOS cần chạy trên máy Mac, APK cần `aapt2`). Lần chạy đầu (22/09): Windows **khớp 1.4.2**;
   iOS **LỆCH** — phát đúng 1.4.0 nhưng profile thiếu nhóm keychain `.shared` nên khách không đăng
   nhập được ⇒ phải sửa + ký lại + thông báo khách.

5. **ĐANG CHỜ (23/09)**: bản iOS kế tiếp (**> build 18**) gồm 2 fix đã commit nhưng *chưa* nằm trong
   build 18 — `7c98e53` (tự đăng xuất khỏi thiết bị khác) và `820b9d2` (watchdog không còn mù, đếm
   datagram khi dùng lại transport). Chủ dự án chốt: **chờ session Mac build xong rồi mới publish**.
   Khi có bản mới, làm đủ 3 kênh: trang buy (IPA ad-hoc + mốc `latest_ios_version`/`ipa_build`) →
   TestFlight (Beta App Review + "What to Test" 3 ngôn ngữ) → email khách iOS
   (`scripts/send-ios-1.4.1-announcement.py` là mẫu, đổi nội dung theo release notes mới).
   ⚠️ Trước khi publish phải verify từ trong IPA: version/build, `get-task-allow=false`, keychain group
   `G6XW3RN6LJ.com.privatevpn.shared`, có `PrivateVPNPacketTunnel.appex`, sha256 khớp handover.

7. **iOS TestFlight build mới — TODO tối 23/09**: export app-store-connect đã build được (`scripts/archive-appstore.sh ios direct`, bản 1.4.3/20) nhưng Apple chặn **90171** — `Hysteria.framework` không phải bundle hợp lệ (thiếu symlink chuẩn `Versions/Current` + `Hysteria`/`Resources`, hoặc phải **static link**). Đã sửa 2 lỗi trước: **90360** (vá `MinimumOSVersion` — plist trong `Hysteria.xcframework` là `{}` rỗng) và **90206** (chuyển framework từ `PlugIns/…appex/Frameworks` sang `FlowVPN.app/Frameworks` rồi ký lại). Còn phải: (i) thêm symlink chuẩn cho framework, hoặc (ii) static link — (ii) đụng `project.yml` ⇒ **xin handoff session Mac**. Sau khi upload được: `node scripts/asc-beta.mjs submit <build> --whatsnew release/ios/whatsnew-next.json` + Beta App Review. **Yêu cầu chủ dự án: TestFlight phải TRÙNG version với bản phát hành trên website.** External testers: **14/14 email khách** đã ở nhóm "External Test" ✓.
8. **macOS 1.4.3/20 — đang xử lý (23/09 chiều)**: DMG đã Developer ID + notarize **Accepted** + staple (23.288.272 B, sha256 `242740b7…`), `spctl` ĐẠT, nhưng cổng `codesign --verify --deep --strict` fail ở `Hysteria.framework` trong appex (`Info.plist` rỗng `{}`) ⇒ **CHƯA phát**. Đã vá plist (xcframework + app đã build) và đang chạy lại `scripts/mac-sign-notarize.sh /Applications/VPNFlow.app 1.4.3-20 --dmg`. Khi cổng ĐẠT: upload nguyên tử → mốc `latest_mac_version=1.4.3` → **email toàn bộ user** (`scripts/send-mac-announcement.py --all`).
9. **Sổ phát hành**: dòng `ios 1.4.2 (19)` trong `release/releases.jsonl` **chưa commit** được (hook coordination chặn vì claim `[windows] release` — họ đang phát Windows 1.4.6 hotfix DNS). Claim nhả là commit ngay; nội dung đã nằm trong cây làm việc.

## 8. Lỗi đã từng xảy ra (đọc để không lặp)
- Link trên `/buy` trỏ sai host (`api.` ⇒ 401). Link tải phải là `t1.` hoặc `meetflowai.site`.
- PATCH mốc version thất bại **im lặng** (curl exit 0 dù 401) ⇒ phải đọc JSON trả về.
- Quên `handle` Caddy ⇒ edge 404 dù Node 200.
- Ký lại IPA làm mất keychain group ⇒ app kẹt đăng nhập.
- Đổi relay/hạ tầng khi client còn cache URL cũ ⇒ toàn bộ khách mất mạng (phải chạy song song đường cũ).
- Upload xong **không** verify size ⇒ phát hành file cụt.
- **Khách TQ tải file lớn hay đứt**: log Caddy 20 ngày có 58 lượt `/v1/downloads/*` bị `aborting with incomplete response` (27 lượt từ CN, phần lớn UA WeChat/`MicroMessenger`). Server **đã** hỗ trợ `Range` (206) nên tải lại là tiếp, không mất phần đã tải ⇒ hướng dẫn khách tải bằng Chrome/Safari, **không mở trong WeChat**.
- **Link cài iOS dùng host bị chặn ở TQ**: manifest + nút cài lấy từ `siteBaseUrl()` = `PUBLIC_SITE_URL` (mặc định `https://meetflowai.site`). Khách ở TQ bấm "Cài đặt VPNFlow" có thể fail vì host này bị chặn theo SNI. Trang cài nên tự dùng host khách đang mở (host-aware) rồi fallback `t1.meetflowai.site` — sửa trong `control-plane/src/index.js` (**vùng bảo vệ: cần handoff owner windows**). Tạm thời: luôn gửi khách link `t1.` trong email.
- **Phát hành bản KHÔNG phải bản mới nhất đã test (20/09)**: route `/v1/downloads/mac` phục vụ DMG
  `1.3.3 / build 13` (last-modified 15/09) trong khi bản đã test là `1.4.0 / build 14` ⇒ khách tải nhầm
  bản cũ **5 ngày** (nguồn: `docs/RELEASE_ARTIFACTS_2026-09-19.md` §2.1). Từ 22/09 việc này là bước
  **1b/§2b** bắt buộc: chỉ phát hành bản mới nhất đã được test + Dev xác nhận.
- **Tên file/mốc không phải version thật (21/09)**: bản Windows cài trên máy ghi `FileVersion = 1.0.0`
  trong khi installer tên `VPNFlow-Setup-1.4.1.exe` (ghi nhận trong `scripts/check-publish-version.py`)
  ⇒ **luôn đọc version từ BÊN TRONG artifact**, không tin tên file lẫn mốc `latest_version`.
