# BÀN GIAO → **PUBLISHER** (kênh macOS) — **1.4.7 / build 22** (System Extension), 26/09/2026

> Người soạn: harness Mac. Luật: `docs/PUBLISHER_PROCESS.md` §0/§1/§2b/§4 · `docs/VERSIONING.md`.
> **Đây là bản thay thế `HANDOFF_PUBLISHER_MACOS_1.4.6_2026-09-26.md`** (bản 1.4.6/21 đã phát và **không mở được**).

## 0. Vì sao có bản 1.4.7 và vì sao là System Extension (3 chứng minh, đừng đi lại)

| # | Sự thật | Bằng chứng |
|---|---|---|
| 1 | Bản **1.4.6/21** (và bản nền **1.4.0/14**) **không mở được** trên máy khách | `amfid … AppleMobileFileIntegrityError Code=-413 "No matching profile found"` · `Unsatisfied Entitlements: com.apple.developer.networking.networkextension` · `ASP: Security policy would not allow process` ⇒ hộp thoại *"The application \"VPNFlow\" can't be opened."* |
| 2 | **Không thể xin quyền cũ cho Developer ID** | Profile `MAC_APP_DIRECT` **luôn chỉ cấp bộ `*-systemextension`**, kể cả khi tạo cho **App ID iOS** mà profile Ad Hoc của nó cấp bộ `packet-tunnel-provider` ⇒ do **loại profile**, không do App ID/capability. Portal không có mục chọn provider con; API App Store Connect trả `'NETWORK_EXTENSIONS' is not a valid value for settings/0/key` |
| 3 | **Appex plugin không dùng được quyền systemextension** | Bản Developer ID ký với `packet-tunnel-provider-systemextension` **qua được AMFI** (app mở) nhưng bật tunnel: `pkd: could not create extension point record … Code=-10814`, `scutil --nc status` = `Disconnected` |

⇒ macOS phải đóng gói provider thành **System Extension**, quyền `com.apple.developer.networking.networkextension = [packet-tunnel-provider-systemextension]` — **profile Developer ID hiện có đã cấp sẵn quyền này** (`~/.vpnflow-macrelease/profiles/{app,appex}.provisionprofile`).

## 0b. 5 điều BẮT BUỘC rút ra khi làm System Extension (đo thật 26/09/2026 — thiếu 1 điều là hỏng)

1. **Đóng gói**: target `type: system-extension`, sản phẩm nằm ở
   `VPNFlow.app/Contents/Library/SystemExtensions/<bundle-id>.systemextension`; tên gói **phải bằng bundle identifier**
   (đặt `PRODUCT_NAME` = `com.privatevpn.mac.packet-tunnel`); entry point `main.swift` gọi `NEProvider.startSystemExtensionMode()`.
2. **Quyền/profile**: app + extension khai `com.apple.developer.networking.networkextension = [packet-tunnel-provider-systemextension]`
   (giá trị của appex plugin **không dùng được** với profile Developer ID); **app** khai thêm
   `com.apple.developer.system-extension.install`. Bật capability qua API (không cần portal):
   `SYSTEM_EXTENSION_INSTALL` + `NETWORK_EXTENSIONS` + **`APP_GROUPS`** — rồi `node scripts/asc-mac-devid-profiles.mjs`.
3. **App Group + Mach service**: `NEMachServiceName` **phải bắt đầu bằng một App Group** khai trong
   `com.apple.security.application-groups` (thiếu ⇒ `NetworkExtensionErrorDomain Code=6` rồi sysextd gỡ extension).
   Đang dùng: group `G6XW3RN6LJ.com.privatevpn.shared`, Mach service `G6XW3RN6LJ.com.privatevpn.shared.tunnel`.
4. **BẮT BUỘC NOTARIZE**: system extension chỉ ký Developer ID (chưa notarize) ⇒
   `OSSystemExtensionError … codeSignatureInvalid`; notarize + staple xong mới qua được `syspolicyd`.
5. **Build phải có credential hysteria2**: thiếu ⇒ tunnel không dựng được
   (`configuration: Bản build thiếu credential hysteria2 …`). Luôn `eval "$(bash scripts/dev-hysteria-build-env.sh)"`
   **trước** `xcodebuild` (và truyền `HYST_PASSWORD=` / `HYST_OBFS=`).
   Ngoài ra khách **bấm Allow một lần** trong System Settings → General → Login Items & Extensions → Network Extensions
   (app đã map lỗi này thành thông báo tiếng Việt; trạng thái `[activated waiting for user]` ⇒ chưa bật,
   `[activated disabled]` ⇒ bị tắt lại, `[activated enabled]` + cột `active` có `*` ⇒ chạy được).

6. **Tranh chấp với app VPN/mạng khác (yêu cầu chủ dự án 26/09)**: bản Mac phải có hành vi **tương đương bản Windows**
   (`windows/…/NetworkConflictDetector.cs`): phát hiện tunnel khác đang Connected / tiến trình Clash·Mihomo·sing-box·v2ray·
   WireGuard·Tailscale·Surge… / system proxy đang bật / default route v4-v6 không thuộc tunnel mình / resolver DNS lạ
   không tới được (ca thật: `202.96.134.133` timeout ⇒ Safari không vào được YouTube) ⇒ **hiện thông báo đa ngôn ngữ
   yêu cầu khách tắt các app đó rồi Connect lại** (mức Blocking chặn, Warning chỉ nhắc), ghi log + hiện trong thẻ Diagnostics.
   Trước khi kết luận lỗi sản phẩm, luôn kiểm ca "2 VPN cùng lúc" (Tailscale tự bật theo Login Item là ca thật 26/09).

## 1. Số version & vị trí file

| | |
|---|---|
| Version / build | **macOS 1.4.7 / build 22** — **bắt buộc > 1.4.6** (bản 1.4.6/21 đã chiếm sha256 `c95b4fab00f9fe…`; VERSIONING §3.3 cấm phát lại) |
| Bump ở đâu | `project.yml`: **2 target macOS** → `MARKETING_VERSION "1.4.7"`, `CURRENT_PROJECT_VERSION "22"` · **KHÔNG đụng 2 target iOS** (đang 1.4.6/54 đã phát) |
| Layout mới | `VPNFlow.app/Contents/Library/SystemExtensions/com.privatevpn.mac.packet-tunnel.systemextension` — **không còn** `Contents/PlugIns/…appex` |
| Đích | `/root/flowvpn-mac/VPNFlow-mac.dmg` — `GET /v1/downloads/mac` |
| Mốc | `latest_mac_version=1.4.7` **rồi mới** `minimum_mac_version=1.4.7` (chốt chủ dự án 25/09: *"force khách update nếu đã cài"*) |
| Đang phát | macOS 1.4.6/21 (**lỗi**) · `minimum_mac_version` đã hạ về `0.0.0` lúc 04:45Z 26/09 |

## 2. Cổng BẮT BUỘC theo thứ tự (chưa ĐẠT ⇒ không phát, không gửi email)

```bash
# 1) sinh project + build Release (kiểm ổ đĩa trước: df -h /Volumes/BIWIN | tail -1)
xcodegen generate
# 2) LAYOUT: phải có system extension, KHÔNG còn appex
ls -l <VPNFlow.app>/Contents/Library/SystemExtensions/
ls    <VPNFlow.app>/Contents/PlugIns/ 2>&1   # phải KHÔNG còn PrivateVPNMacPacketTunnel.appex

# 3) ký + notarize + staple app & DMG (trong script: cổng 4b quyền/profile, cổng 6b DMG sạch)
bash scripts/mac-sign-notarize.sh <đường-dẫn>/VPNFlow.app 1.4.7-22 --dmg

# 4) cổng chặn version (đọc version TỪ TRONG DMG)
python3 scripts/check-publish-version.py --platform macos \
  --file ~/.vpnflow-macrelease/VPNFlow-mac-1.4.7-22.dmg --version 1.4.7 --build 22   # exit 0

# 5) MỞ THỬ APP THẬT (cổng §4a không bắt được lỗi quyền)
open -a <VPNFlow.app>; sleep 4
ps -axo pid,command | grep "VPNFlow.app/Contents/MacOS" | grep -v grep      # phải CÓ tiến trình
log show --last 2m --predicate 'eventMessage CONTAINS "VPNFlow"' | grep -iE "amfi|unsatisfied|not allow"   # phải TRỐNG
```

**6) Nghiệm thu tunnel (cần chủ dự án bấm `Allow` một lần cho system extension):**
Connect → có IP thoát; chạy **3 ca**: (a) A7/Tencent Meeting đi thẳng (route qua `en0`, tải Tencent nhanh hơn hẳn);
(b) bộ nhớ: footprint leo tới ~46 MB mà tunnel **không** tự hạ; (c) failover: chặn `relay-cf-vn2hy` trên node-2 ⇒ tự đổi đường, mạng tự hồi, khách không bấm gì.

```bash
# 7) upload NGUYÊN TỬ (file tạm + verify sha256/size + mv), rồi cổng §4a TRÊN CHÍNH FILE ĐANG PHÁT
python3 scripts/check-publish-version.py --platform macos --mode post --version 1.4.7 --build 22
# 8) mốc: latest_mac_version=1.4.7 → verify API → SAU ĐÓ minimum_mac_version=1.4.7
#    (mốc macOS KHÔNG có route admin: sửa app_config trên node-2, backup DB trước)
# 9) email khách macOS kèm link mới (3 ngôn ngữ, nói thẳng bản trước lỗi) — mẫu: scripts/send-mac-correction-2026-09-26.py
# 10) sổ: release-record.mjs append … --platform macos --version 1.4.7 --build 22 … + tag macos-v1.4.7
```

## 2b. NGHIỆM THU MÁY THẬT (26/09/2026, bản system extension — dùng làm bằng chứng §2b#3)

| Hạng mục | Kết quả đo được | Ghi chú |
|---|---|---|
| Cài từ DMG (như khách) | `1.4.7/22` cài đè, app mở được, `systemextensionsctl` → `*  *  VPNFlow Tunnel [activated enabled]` | cập nhật đè **không** bắt duyệt lại extension |
| Connect | tunnel `Connected`, IP thoát `165.101.114.162` (node) | |
| **Đổi mạng Wi-Fi → 5G (hotspot)** | tunnel **vẫn Connected**, không cần bấm lại; IP thoát không đổi; 11 dòng lỗi lúc chuyển rồi 0 | "chập chờn khi đổi mạng" đã hết |
| **IPv6 (mạng di động có IPv6)** | `curl -6 https://www.google.com` → **thất bại sau 0,30 s** (trước: 5,006 s; `ping6`: 12 s) · log `ipv6-reject #n … code=4` tăng theo gói | sửa gốc: XNU coi ICMPv6 code 0 là lỗi **mềm** (TCP vẫn retransmit SYN); **code 4** ⇒ `connect()` trả lỗi ngay. **Lỗi này đúng cả iOS** |
| Google/YouTube | IPv4 `200` (0,8–1,6 s) trên cả Wi-Fi và 5G; Chrome YouTube **2K và 4K** chạy tốt (chủ dự án xác nhận 26/09); Safari vào được **sau khi tắt Tailscale** | ca "2 VPN cùng lúc" ⇒ bản 26 sẽ tự cảnh báo |
| Tốc độ | 4,0–7,1 MB/s qua tunnel (32–57 Mbps), tải 20 ảnh song song 0,35–0,46 s | |
| Bộ nhớ | extension RSS **32–58 MB** trong 25 phút liên tục, `teardown` không kích hoạt (ngưỡng macOS 200/400 MB) | "Mac tự tắt VPN" đã hết |
| Ổn định | monitor 25 phút: tunnel Connected suốt, **0 lần đổi đường**, IP không nhảy, 1 dòng lỗi heartbeat lúc chuyển mạng | |
| CHƯA test | **failover chặn relay** (ca 3) và **cài mới hoàn toàn trên máy sạch** (bước bấm Allow) | làm trước khi phát hành |
| Ghi chú kỹ thuật | **system extension chỉ nạp lại khi VERSION đổi** — cùng version mà khác nội dung thì `/Library/SystemExtensions/` vẫn chạy ảnh cũ ⇒ mỗi lần sửa extension phải bump build | mất thời gian nếu quên |

## 3. Việc chưa xong / rủi ro phải nói thật
- **Chưa nghiệm thu được tunnel thật cho tới khi có bản System Extension chạy trên máy chủ dự án** (bước 6).
- Khách sẽ thấy **một hộp thoại mới**: macOS hỏi cho cài system extension ⇒ **một cú bấm Allow** (không phải chạy lệnh, đúng luật §4b).
- Bản cũ 1.4.0/14 cũng lỗi ⇒ khách macOS hiện **không có bản nào chạy được**; email đính chính đã gửi 21/21 lúc 04:5xZ 26/09.
- `BUG-IOS-JETSAM-001` / `BUG-IOS-ONEWAY-001` / `BUG-20260823-001` vẫn `open` mức `high` — chốt cho phát đã ghi ở `PUBLISHER_PROCESS.md` §6 dòng 26/09.
