# macOS — KÝ DEVELOPER ID + NOTARIZE (quy trình chuẩn, đã chạy thật 20/09/2026)

> Mục đích: khách tải DMG về **mở được ngay**, không còn cảnh báo *“Apple không thể xác minh…”*.
> Trước đây DMG không ký/không notarize ⇒ Gatekeeper chặn (`source=no usable signature`).

## 0. Khoá & chứng chỉ (KHÔNG hỏi lại chủ dự án — đã có sẵn)
| Thứ | Ở đâu |
|---|---|
| `.p8` (App Store Connect API key) | Mac: `~/.vpnflow-asc/AuthKey.p8` · VPS: `/root/flowvpn-cp/data/apple-asc.json` (field `privateKey`, kèm `keyId`, `issuerId`) |
| keyId / issuerId | trong chính `apple-asc.json` (ví dụ keyId `8GW366…`, issuer `7a64d085…`) |
| Cert ký | `security find-identity -v -p codesigning` → **Developer ID Application: Minh Nguyen (G6XW3RN6LJ)** |
| altool dùng key | copy `.p8` vào `~/.appstoreconnect/private_keys/AuthKey_<keyId>.p8` |

## 1. Tạo provisioning profile Developer ID bằng API (không cần portal, không cần Xcode account)
Profile Developer ID cho macOS **không cần UDID**. Tạo bằng script JS (Node có sẵn, không cần thư viện):
- JWT ES256: ký bằng `crypto.createSign('SHA256')` với `dsaEncoding: 'ieee-p1363'` (raw R||S — **bắt buộc**, DER sẽ sai).
- `aud: 'appstoreconnect-v1'`, `kid: <keyId>`, `iss: <issuerId>`, hạn 15 phút.
- Lấy bundle id: `GET /v1/bundleIds` → map theo `attributes.identifier`.
- Lấy cert: `GET /v1/certificates?filter[certificateType]=DEVELOPER_ID_APPLICATION`.
- Tạo: `POST /v1/profiles` với `attributes.profileType = **MAC_APP_DIRECT**`
  ⚠️ **KHÔNG** dùng `MAC_APP_DEVELOPER_ID` — API trả 409 *“not a valid value”* (đã mất thời gian vì lỗi này).
- `attributes.profileContent` (base64) → ghi ra `<bundle>.provisionprofile`.
Script tham chiếu: `scripts/asc-mac-devid-profiles.mjs` (JWT + 3 request trên, tự in quyền của profile vừa tạo).

> ⛔ **BẮT BUỘC — bản ký Developer ID phải dùng SYSTEM EXTENSION, không dùng appex plugin.**
> Profile Developer ID (`MAC_APP_DIRECT`) **về bản chất** chỉ cấp bộ `*-systemextension`
> (`packet-tunnel-provider-systemextension`, `app-proxy-provider-systemextension`, …). Giá trị appex
> `packet-tunnel-provider` **chỉ có ở profile không phải Developer ID** (Mac App Store / Mac Team
> Provisioning) ⇒ kênh DMG **không thể** dùng appex, và **portal/API không đổi được bộ giá trị đó**
> (`'NETWORK_EXTENSIONS' is not a valid value for settings/0/key`; đã thử cả App ID khác và
> `platform=UNIVERSAL`).
>
> Vì vậy từ 26/09/2026 gói macOS phát cho khách có:
> `VPNFlow.app/Contents/Library/SystemExtensions/com.privatevpn.mac.packet-tunnel.systemextension`
> (KHÔNG còn `Contents/PlugIns/…appex`), quyền `packet-tunnel-provider-systemextension` ở **cả** app
> và extension, `CFBundlePackageType = SYSX`, **bỏ** `NSExtension`, thêm dict `NetworkExtension`
> (`NEMachServiceName` + `NEProviderClasses`) + `NSSystemExtensionUsageDescription` (Apple: thiếu khoá
> này ⇒ **lỗi ngay lúc activation**), và app gọi `OSSystemExtensionRequest.activationRequest` trước khi
> dựng tunnel. Sau khi ký, cổng §2(d) kiểm đúng cặp quyền `/ profile`.
>
> **Bằng chứng hai chiều đo trên máy thật 26/09/2026** (bản app cũ copy sang `/tmp`, ký lại rồi chạy):
> | Chữ ký app khai | Kết quả chạy |
> |---|---|
> | `packet-tunnel-provider` | `Killed: 9` — `amfid … Code=-413` · `taskgated-helper: Unsatisfied entitlements: com.apple.developer.networking.networkextension` |
> | `packet-tunnel-provider-systemextension` | **chạy được** (`ALIVE` sau 4 s) ⇒ app mở bình thường |
>
> ### 1b. `com.apple.developer.system-extension.install` — CHƯA cấp, ĐỪNG khai thêm
> Apple ghi khoá `com.apple.developer.system-extension.install` là quyền để app **activate/deactivate
> system extension** (“Add this entitlement for all system extension types”). **Profile Developer ID
> hiện tại KHÔNG cấp khoá này** và nó là quyền hạn chế ⇒ khai thêm vào chữ ký là app **chết ngay**:
> đo thật 26/09/2026 (cùng phép thử ở bảng trên, chỉ thêm khoá này):
> ```
> taskgated-helper: com.privatevpn.mac: Unsatisfied entitlements: com.apple.developer.system-extension.install
> taskgated-helper: Disallowing: com.privatevpn.mac   →   Killed: 9
> ```
> Nên **không** đưa khoá này vào `app.ent.plist` cho tới khi profile cấp được nó. Nếu lần chạy thật
> `OSSystemExtensionRequest` trả `OSSystemExtensionError` **`missingEntitlement`**: bật capability
> **System Extension** cho 2 App ID mac (`com.privatevpn.mac`, `com.privatevpn.mac.packet-tunnel`) trên
> portal → chạy lại `node scripts/asc-mac-devid-profiles.mjs` (kiểm profile **có**
> `com.apple.developer.system-extension.install`) → **rồi mới** thêm
> `<key>com.apple.developer.system-extension.install</key><true/>` vào `app.ent.plist` và ký lại.

## 2. Ký (inside-out, KHÔNG dùng export của Xcode để tránh “Cloud signing permission error”)
```bash
ID="Developer ID Application: Minh Nguyen (G6XW3RN6LJ)"
APP=…/VPNFlow.app
SYSEXT="$APP/Contents/Library/SystemExtensions/com.privatevpn.mac.packet-tunnel.systemextension"

# (a) nhúng profile vào app + system extension (Apple bắt tên gói TRÙNG bundle identifier)
cp com.privatevpn.mac.provisionprofile                "$APP/Contents/embedded.provisionprofile"
cp com.privatevpn.mac.packet-tunnel.provisionprofile  "$SYSEXT/Contents/embedded.provisionprofile"

# (b) KÝ FRAMEWORK CON TRƯỚC (nếu bỏ bước này, notarize sẽ Invalid)
codesign --force --options runtime --timestamp --sign "$ID" "$SYSEXT/Contents/Frameworks/Hysteria.framework/Versions/A/Hysteria"
codesign --force --options runtime --timestamp --sign "$ID" "$SYSEXT/Contents/Frameworks/Hysteria.framework"

# (c) rồi mới tới system extension và app (giữ nguyên quyền bằng entitlements hiện có)
codesign -d --entitlements :- "$SYSEXT" > /tmp/ext.ent ; codesign -d --entitlements :- "$APP" > /tmp/app.ent
codesign --force --options runtime --timestamp --sign "$ID" --entitlements /tmp/ext.ent "$SYSEXT"
codesign --force --options runtime --timestamp --sign "$ID" --entitlements /tmp/app.ent "$APP"
codesign --verify --deep --strict --verbose=2 "$APP"      # phải "valid on disk"
spctl -a -vv "$APP"    # trước notarize sẽ là: rejected / source=Unnotarized Developer ID  ← ĐÚNG, không phải lỗi

# (d) CỔNG BẮT BUỘC: profile nhúng phải cấp ĐỦ quyền mà binary yêu cầu
python3 scripts/mac-check-profile-entitlements.py "$SYSEXT" "$APP"    # exit 1 = DỪNG, không notarize
# `scripts/mac-sign-notarize.sh` tự chạy cổng này ở bước 4b (đường dẫn system extension đã cập nhật).
```

## 3. DMG
```bash
mkdir dmgstage && cp -R "$APP" dmgstage/ && ln -s /Applications dmgstage/Applications
printf 'Hướng dẫn…\n' > "dmgstage/HƯỚNG DẪN.txt"
hdiutil create -volname VPNFlow -srcfolder dmgstage -ov -format UDZO -quiet VPNFlow-mac.dmg
codesign --force --timestamp --sign "$ID" VPNFlow-mac.dmg          # ký file DMG
```

## 4. Notarize + staple (thứ tự BẮT BUỘC)
```bash
xcrun notarytool submit VPNFlow-mac.dmg --key ~/.vpnflow-asc/AuthKey.p8 \
      --key-id "$KEYID" --issuer "$ISSUER" --wait        # phải: status: Accepted
xcrun stapler staple VPNFlow-mac.dmg                     # "The staple and validate action worked!"
xcrun stapler validate VPNFlow-mac.dmg
spctl -a -t open --context context:primary-signature -vv VPNFlow-mac.dmg   # accepted / Notarized Developer ID
```
⚠️ **Ký DMG SAU khi staple sẽ làm vé staple mất hiệu lực** ⇒ nếu ký lại, phải **submit + staple lại** (đúng thứ tự: ký → submit → staple).

### 4a. CỔNG CHẶN BẮT BUỘC (thêm 22/09/2026 — sau sự cố khách báo *"cài xong không mở được"*)
```bash
python3 scripts/check-publish-version.py --platform macos --file VPNFlow-mac.dmg --version 1.4.0 --build 14
```
Cổng này (chạy trên macOS) kiểm **4 thứ** và **chặn** nếu sai: `xcrun stapler validate` trên DMG,
`stapler validate` trên `.app` bên trong, `spctl -a -t open --context context:primary-signature`,
và `codesign --verify --deep --strict`. Trên máy không phải macOS nó báo `KHÔNG KIỂM ĐƯỢC` (exit 2),
**không** giả vờ đạt.

Vì sao cần: `spctl` trên **máy build** vẫn báo `Notarized Developer ID` dù DMG **chưa staple** (macOS
đối chiếu online), nên rất dễ tưởng đã xong — trong khi máy khách (nhất là khi mạng yếu/không mạng)
**không có vé** để đối chiếu ⇒ Gatekeeper chặn: *"không thể mở"*. Đúng ca 22/09/2026.

⚠️ **Cổng §4a KHÔNG bắt được lỗi quyền/profile** — ca 26/09/2026: `stapler validate` DMG + `stapler
validate` app + `spctl accepted / Notarized Developer ID` + `codesign --verify --deep --strict` **đều ĐẠT**
trên bản **không mở được**. Vì vậy trước khi phát hành còn **2 việc bắt buộc**:
1. cổng quyền Ở §2(d) / `scripts/mac-check-profile-entitlements.py` (bắt cặp quyền
   `packet-tunnel-provider-systemextension` của system extension khớp profile);
2. **mở thử app trên máy Mac thật**:
   ```bash
   open -a /Applications/VPNFlow.app; sleep 4
   ps -axo pid,command | grep "VPNFlow.app/Contents/MacOS" | grep -v grep   # KHÔNG có dòng nào = app chết ⇒ DỪNG
   log show --last 2m --predicate 'eventMessage CONTAINS "VPNFlow"' | grep -iE "amfi|unsatisfied|not allow"  # phải TRỐNG
   ```

### 4b. LUẬT: KHÔNG BAO GIỜ bắt khách chạy lệnh (chủ dự án chốt 22/09/2026)

> Nguyên văn: *"đừng có bắt khách chạy lệnh gì cả, tập trung fix trên package của mình thôi"*.

**Cấm** đưa cho khách bất kỳ bước nào thuộc loại:
- `xattr -dr com.apple.quarantine …`, `spctl`, `codesign`, Terminal nói chung;
- "chuột phải → Open", "System Settings → Privacy & Security → Open Anyway";
- tải "bản đặc biệt"/bản vá tay.

**Khách chỉ làm 2 việc**: tải file rồi **bấm đôi**. Mọi thứ khác là **lỗi gói của mình** — phải sửa
trong gói, không đẩy sang khách.

Hệ quả bắt buộc:
1. **Cổng §4a phải ĐẠT trên CHÍNH FILE ĐANG PHÁT** trước khi gửi link cho khách — ĐẠT trên file vừa
   build ở máy là **chưa đủ** (lý do ở §4a). Ghi mốc "đã kiểm §4a trên file đang phát" (ngày + sha256)
   vào `release/releases.jsonl`.
2. Cổng **chưa ĐẠT ⇒ chưa phát hành, chưa gửi khách**. Đã lỡ phát hành thì **thay file ngay**, không
   kèm hướng dẫn vòng.
3. Khách đã nhận bản lỗi ⇒ xử lý bằng **phát hành bản đã staple** + báo khách **tải lại**; tuyệt đối
   không hướng dẫn khách vượt Gatekeeper.
4. Lỗi kiểu này **phải tìm ra trước khi khách báo**: cài lịch kiểm định kỳ **trên máy Mac**
   (`scripts/install-release-audit-watch.sh` → launchd `site.meetflowai.release-audit-watch`,
   mặc định 6 giờ/lần; nó tải file đang phát của **mọi kênh** rồi đọc version + kiểm DMG, alert Telegram
   khi lệch). **Server không làm được việc này** — không có `hdiutil`/`stapler`/`spctl`, chạy từ Windows
   cũng chỉ ra `KHÔNG KIỂM ĐƯỢC`. Đã kiểm 22/09/2026: trên node-2 **chưa** có timer/cron nào ⇒ lỗi này
   không ai bắt được trước khách.

**Vì sao có luật**: khách không phải kỹ thuật — mỗi dòng lệnh là một chỗ để bỏ cuộc; và nếu khách phải
vượt Gatekeeper bằng tay thì app đang phụ thuộc thao tác thủ công, cài lại/đổi máy là hỏng lại.
Sửa ở gói là sửa một lần cho mọi khách.

## 5. Phát hành
```bash
cp backup: mv /root/flowvpn-mac/VPNFlow-mac.dmg /root/flowvpn-mac/VPNFlow-mac-unsigned-<date>.dmg
scp/ssh cat > /root/flowvpn-mac/VPNFlow-mac.dmg
curl -sI https://t1.meetflowai.site/v1/downloads/mac     # 200 + content-length khớp
```

## 5b. CÀI LẠI ĐỂ THỬ: **PHẢI đổi `CURRENT_PROJECT_VERSION`** (đo thật 26/09/2026)
System extension **KHÔNG** được nạp lại khi nội dung app đổi mà **số version giữ nguyên**:
macOS đã chép gói vào `/Library/SystemExtensions/<UUID>/` lúc kích hoạt, nên cài lại cùng
`1.4.7/23` (khác nội dung) thì tiến trình vẫn chạy **ảnh cũ** — đo thật: PID và binary không đổi
sau khi `ditto` bản mới vào `/Applications` + mở lại app + `scutil --nc start`.

```bash
# 1) bump CURRENT_PROJECT_VERSION cho CẢ HAI target macOS trong project.yml (app + system extension,
#    hai số PHẢI trùng nhau), iOS KHÔNG đụng tới.
# 2) build → scripts/mac-sign-notarize.sh <app> 1.4.7-<N> --dmg → cài vào /Applications
# 3) mở app (app gửi OSSystemExtensionRequest.activationRequest) rồi kiểm:
systemextensionsctl list          # phải thấy đúng bản MỚI ở trạng thái [activated enabled]
ps -Ao pid,lstart,comm | grep packet-tunnel   # PID/giờ khởi động PHẢI mới
```
Cùng Team ID + cùng bundle id ⇒ **không cần duyệt lại** (đã kiểm 22→23→24→25: bản cũ chuyển
`[terminated waiting to uninstall on reboot]`, không hiện hộp thoại xin quyền). Đây cũng là luật
artifact bất biến của `docs/VERSIONING.md` §3.3: cùng số version mà khác hash là **cấm** phát.

## 6. Lỗi đã gặp & cách xử
| Lỗi | Nguyên nhân | Xử |
|---|---|---|
| `exportArchive Cloud signing permission error` / `No profiles for 'com.privatevpn.mac'` | ASC key **không đủ quyền** tạo profile Developer ID qua Xcode cloud signing | Tạo profile bằng **API** (§1) rồi **ký tay** (§2) |
| `MAC_APP_DEVELOPER_ID is not a valid value` | sai enum | dùng **`MAC_APP_DIRECT`** |
| notarize **Invalid**: *“…/Hysteria.framework/…/Hysteria: binary is not signed with a valid Developer ID certificate / no secure timestamp”* | framework Go nhúng chưa ký | ký framework **trước** system extension/app (§2b) |
| TestFlight: *90171 Invalid bundle structure … standalone executables* | App Store **cấm** binary rời trong framework (luật khác macOS) | phải **bỏ/đóng gói lại** framework cho bản App Store (chưa xong — xem manifest “Việc chưa xong”) |
| Khách vẫn thấy cảnh báo dù đã notarize | DMG chưa ký hoặc staple sai thứ tự | làm đúng §3–§4 rồi `spctl` kiểm lại |
| **`The application "VPNFlow" can't be opened.`** (hộp thoại trống, không nêu lý do) | `amfid … Code=-413 "No matching profile found"`: app/appex khai quyền **không có trong profile Developer ID**. Hai biến thể: (i) khai `packet-tunnel-provider` (giá trị appex) — profile chỉ có bộ `*-systemextension`; (ii) khai thêm `com.apple.developer.system-extension.install` — profile cũng không cấp. Ký + notarize + staple + spctl **vẫn ĐẠT** nên cổng cũ không thấy | dùng **system extension** + `packet-tunnel-provider-systemextension` (§1) và **không** khai `system-extension.install` khi profile chưa cấp (§1b) → ký lại + notarize; cổng `scripts/mac-check-profile-entitlements.py` (§2d) + mở thử app (§4a) |
| DMG mở ra thấy **2 volume `VPNFlow` / `VPNFlow 1`**, Finder báo *"the item \"VPNFlow\" is in use"*, phải force quit mới cập nhật được | tên volume DMG cố định `VPNFlow` ⇒ mount nhiều bản thì trùng tên; và Finder **không thay được app đang chạy** | `mac-sign-notarize.sh` nay đặt tên volume theo version (`VPNFlow-<ver>`); trước khi cài: thoát app **và ngắt VPN** (appex đang chạy vẫn giữ bundle), đẩy hết volume cũ ra (`hdiutil detach`) |
| `NEMachServiceName` trong Info.plist của system extension ra **thiếu tiền tố team** (`com.privatevpn.mac.packet-tunnel` thay vì `G6XW3RN6LJ.…`) | build Release bằng `CODE_SIGNING_ALLOWED=NO` (rồi ký lại sau) nên `$(TeamIdentifierPrefix)` không được định nghĩa ⇒ `builtin-infoPlistUtility -expandbuildsettings` thay bằng chuỗi rỗng. Khai `TEAM_IDENTIFIER_PREFIX` (HOA) **không** có tác dụng — phải khai **đúng tên biến** | `project.yml` target `PrivateVPNMacPacketTunnel` đặt `TeamIdentifierPrefix: G6XW3RN6LJ.`; kiểm lại sau build: `plutil -extract NetworkExtension.NEMachServiceName raw -o - "<…>.systemextension/Contents/Info.plist"` phải ra `G6XW3RN6LJ.com.privatevpn.mac.packet-tunnel` |
