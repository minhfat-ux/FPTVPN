# iOS Ad Hoc OTA — phát app không qua App Store

> Trạng thái: **đã chạy thật trên iPhone thật (2026-09-15)** — thu UDID → tự đăng ký Apple →
> cài IPA đã ký kèm UDID → cập nhật trong app. Tài liệu này ghi lại đúng những chỗ dễ sai nhất
> (5 bug đã từng làm khách không cài được) để không phải mò lại.

## 0. Luồng tổng thể

```
Khách mở /buy (web)  →  /install/ios  →  tải .mobileconfig  →  iOS gửi UDID (POST, ngầm)
                                                                    │
                        server lưu UDID + tự đăng ký lên Apple (App Store Connect API)
                                                                    │
                        shop ký lại IPA (provisioning profile có UDID) → upload
                                                                    │
                        khách bấm "Tải & cài" → itms-services + manifest.plist → iOS cài app
                                                                    │
                        Trust certificate (Settings → General → VPN & Device Management)
```

Cập nhật về sau: trong app bấm **Update** là iOS tải + cài luôn (mục 6).

## 1. Trang `/install/ios`

- **Hai bước, hai vòng tròn xanh đánh số**: ① Đăng ký thiết bị (có nút đăng ký) ② Cài ứng dụng
  (có nút Tải & cài). Khách nhìn là biết làm gì trước.
- **Trạng thái nút** (JS poll `/install/ios/status`):
  | Tình trạng | Nút Đăng ký | Nút Tải & cài |
  |---|---|---|
  | chưa đăng ký | BẬT | KHÓA + dòng nhắc "Hoàn thành bước 1…" |
  | đã đăng ký | KHÓA, nhãn "✅ Đã đăng ký thiết bị này" | BẬT |
  | đã đăng ký + bản cài sẵn sàng | KHÓA | BẬT + nhấp nháy |
- **Mã phiên (`s`)**: iOS gửi UDID **ngầm** (khách không thấy trang callback), nên trang không thể
  biết "máy này đã đăng ký" qua UDID. Server sinh `sid` khi mở trang → nhét vào link hồ sơ → callback
  lưu `device.sessionId`; trang lưu `sid` trong `localStorage` và poll `?session=<sid>`.
  **Thiếu cơ chế này thì khách cài hồ sơ xong trang không hiện nút cài** (đã từng xảy ra).
- Hồ sơ phát ra luôn có `&ts=<timestamp>` mới ⇒ không thể cài lại bản tải dở (đã từng gây
  "Invalid Profile").
- Popup hướng dẫn (4 bước vào Cài đặt) hiện **ngay khi bấm nút đăng ký**, đủ 5 ngôn ngữ, chọn theo
  **ngôn ngữ của máy** (thẻ ưu tiên cao nhất trong `Accept-Language`).

## 2. Hồ sơ `.mobileconfig` — CẤU TRÚC BẮT BUỘC

Cơ chế cũ "Profile Service": **`PayloadType` ở cấp cao nhất phải là `Profile Service`** và
**`PayloadContent` phải là `<dict>`** (chứa `URL` + `DeviceAttributes`).

```xml
<plist version="1.0">
<dict>
  <key>PayloadContent</key>
  <dict>
    <key>URL</key><string>https://meetflowai.site/install/ios/udid?lang=vi</string>
    <key>DeviceAttributes</key>
    <array><string>UDID</string><string>VERSION</string><string>PRODUCT</string><string>SERIAL</string></array>
  </dict>
  <key>PayloadDisplayName</key><string>VPNFlow — Device registration</string>
  <key>PayloadIdentifier</key><string>site.meetflowai.vpnflow.registration</string>
  <key>PayloadUUID</key><string>…</string>
  <key>PayloadRemovalDisallowed</key><false/>
  <key>PayloadType</key><string>Profile Service</string>
  <key>PayloadVersion</key><integer>1</integer>
</dict>
</plist>
```

⚠️ **Bọc `Profile Service` trong `<array>` của một profile `Configuration` thì iOS VẪN cho cài
nhưng KHÔNG gửi gì về** — đây là bug khó thấy nhất đã gặp. Mọi giá trị chèn vào XML phải được
escape (`&` → `&amp;`), nếu không iOS báo **Invalid Profile**.

## 3. Callback iOS gửi về

- iOS 26 gửi `Content-Type: application/pkcs7-signature`: body là **CMS/PKCS#7 đã ký**, plist XML
  nằm **bên trong khối nhị phân** (trước là header DER, sau là chuỗi chứng chỉ Apple).
- Server (`decodeDevicePayload`) nhận **raw body** rồi tự nhận dạng: PKCS#7 (cắt `<?xml … </plist>`) ·
  plist thẳng · form-urlencoded (base64 hoặc plist URL-encode) · JSON.
- Body cuối cùng được lưu vào `/root/flowvpn-cp/data/last-ios-callback.txt` (0600, 8KB) để chẩn đoán
  — **nhờ file này mới biết iOS 26 gửi PKCS#7** thay vì đoán. Xoá được khi không cần.
- iOS gửi `VERSION` là **số build** (vd `23H24`), không phải `26.0`.
- **iOS LUÔN hiện "Invalid Profile" sau khi đã gửi UDID** (bản chất cơ chế) — vô hại; popup trên
  trang đã nói rõ với khách.

## 4. Tự đăng ký UDID lên Apple

- Panel: tab **iOS UDID** → panel *App Store Connect API* (nạp `Key ID` + `Issuer ID` + nội dung `.p8`;
  có `Team ID` thì tốt). Lưu xong server **gọi thử Apple ngay** và báo OK hoặc lỗi nguyên văn.
- Khoá lưu tại `/root/flowvpn-cp/data/apple-asc.json` (0600), **không** vào git; API chỉ trả
  `configured/keyId`, không bao giờ trả khoá.
- Endpoint: `GET /v1/admin/ios/apple` · `POST|DELETE /v1/admin/ios/apple/credentials` ·
  `POST /v1/admin/ios/devices/:udid/register-apple` · `POST /v1/admin/ios/apple/register-pending`.
- JWT ES256: payload `{iss, iat, exp, aud:"appstoreconnect-v1"}`; chữ ký Node là DER ⇒ **phải đổi
  sang raw `r||s` 64 byte** (không thì Apple trả 401).
- Apple trả **409 = UDID đã có** ⇒ coi là thành công (`appleAlreadyRegistered`), không phải lỗi.
- Khách đăng ký máy mới ⇒ server tự đẩy UDID lên Apple; **máy cũ chưa có trên Apple cũng được đẩy lại**
  khi khách đăng ký lại hồ sơ.

## 4b. Có UDID mới — CHỈ KÝ LẠI, KHÔNG build lại

**Build lại code là không cần thiết** khi chỉ có thêm máy mới: binary app không đổi, chỉ có
provisioning profile (danh sách UDID) và chữ ký đổi. Một lệnh duy nhất:

```bash
scripts/ios-resign-ipa.sh                 # tải IPA đang phát → cập nhật profile (ASC API)
                                          # → thay profile + ký lại .appex/.app → upload + báo đã ký
scripts/ios-resign-ipa.sh --no-upload      # chỉ tạo IPA mới ở build/ios-resign/
scripts/ios-resign-ipa.sh --src file.ipa   # ký lại file khác
```

Script làm đúng 5 việc (không gọi Xcode, không cần archive):
1. Tải IPA đang phát từ `/v1/downloads/ios`.
2. Tạo lại profile Ad Hoc (**Apple không cho PATCH profile** ⇒ xoá rồi tạo cùng tên) với **đủ UDID**
   đang có trong tài khoản, cho cả `com.privatevpn.app` và `com.privatevpn.app.packet-tunnel`.
3. Thay `embedded.mobileprovision` trong `.appex` và `.app`, **ký lại bằng entitlements cũ**
   (lấy từ chính chữ ký cũ — ký lại không được đổi quyền).
4. Kiểm `codesign --verify --deep --strict` + in danh sách UDID trong profile.
5. Upload lên node-2 (đi vòng qua node-1) và **kiểm sha256 ở đích**, rồi báo server "đã ký lại".

### 4b-bis. Ký lại NGAY TRÊN SERVER (Linux, zsign) — bỏ phụ thuộc máy Mac

Máy Mac không cần bật nữa: node-2 (Ubuntu 24.04) tự ký bằng **zsign** (bản dựng sẵn
`zsign-linux-x86_64` v1.1.2, đã kiểm sha256 với `SHA256SUMS.txt` của release).

| Thành phần trên node-2 | Việc |
|---|---|
| `/root/flowvpn-sign/refresh-profiles.mjs` | tạo lại profile Ad Hoc đủ UDID qua **ASC API** (khoá đã lưu trong control plane) |
| `/root/flowvpn-sign/resign-ipa.sh` | thay profile + ký lại từng bundle bằng zsign → phát IPA mới → báo server |
| `/root/flowvpn-sign/make-p12.sh` | ghép **khoá riêng** với **chuỗi chứng chỉ Apple** (leaf + WWDR + Root trích từ chính IPA đang phát) |
| `/root/flowvpn-sign/watch.sh` + `flowvpn-sign.timer` | timer 15s: thấy máy chờ ký là tự ký (thay watcher trên Mac) |

⚠️ **zsign đòi p12 PHẢI có đủ chuỗi chứng chỉ** — chỉ có khoá trơ thì báo
`Unknown issuer hash … no usable CA chain` và ký hỏng. `make-p12.sh` lo phần ghép chuỗi.

🔐 **Khoá riêng phải nằm trên server ⇒ cân nhắc bảo mật**: ai có root trên máy ký đều ký được app
bằng chứng chỉ của shop. Nếu rò rỉ phải **revoke** chứng chỉ (mọi bản phát sau đó phải ký lại).
Vì vậy có thể chọn máy ký ít lộ hơn (node-1) thay vì node-2 (đang chạy control plane + Caddy).

Bật tự động (sau khi đã có `dist.p12`):

```bash
systemctl enable --now flowvpn-sign.timer      # từ đó khách đăng ký là tự có bản cài
systemctl status flowvpn-sign.timer
```

**Chỉ build lại khi CODE đổi** (paywall, subscription, sửa bug trong app…): lúc đó
`bash scripts/archive-appstore.sh ios adhoc` → `scripts/ios-adhoc-export.sh --no-upload` → upload.
Bump `CURRENT_PROJECT_VERSION` trong `project.yml` khi phát bản mới.

## 5. Manifest + IPA

- `manifest.plist`: `https://meetflowai.site/install/ios/manifest.plist` (route cũng có ở
  `/v1/downloads/ios/manifest.plist`), `software-package` trỏ `/v1/downloads/ios`.
- IPA **phải được ký với provisioning profile chứa UDID của máy** — kiểm tra nhanh file đang phát:

```bash
python3 - <<'PY'
import zipfile, re
z = zipfile.ZipFile("/root/flowvpn-ipa/VPNFlow-latest.ipa")
raw = z.read("Payload/FlowVPN.app/embedded.mobileprovision").decode("utf-8", "replace")
udids = set(re.findall(r"[0-9A-F]{8}-[0-9A-F]{16}", raw))
print("UDID trong profile:", len(udids))
print("có UDID cần tìm:", "00008120-00010D102E40C01E" in udids)
print("hết hạn:", re.search(r"<key>ExpirationDate</key>\s*<date>([^<]*)", raw).group(1))
PY
```

- Manifest và IPA phải khớp `CFBundleIdentifier` / `CFBundleVersion` (đọc từ `Payload/*.app/Info.plist`).
- **Không đặt `Content-Disposition: attachment`** cho `.mobileconfig` — Safari sẽ coi là file tải về
  và luồng cài hỏng (đã thử và phải bỏ). Chỉ cần `Content-Type: application/x-apple-aspen-config`
  + `Cache-Control: no-store`.

## 6. Cập nhật trong app (không cần vào trang install)

- `/v1/app-version` (kênh iOS) trả thêm `ipa_manifest_url` (+ `install_page_url`).
- App dựng `itms-services://?action=download-manifest&url=<manifest encode>`; màn **Cập nhật bắt buộc**
  bấm Update ⇒ iOS tải IPA và **cài luôn**. Server cũ không có khoá này thì app lùi về mở link web.

## 7. Paywall trong app + mục Subscription

- Paywall mở `/buy?inapp=1`: **ẩn hết khối tải app / hướng dẫn cài**, chỉ còn **ô email (tạo tài khoản)
  + danh sách gói + nút thanh toán** + câu "bạn đã có app rồi…". Trang web thường không đổi.
- Mục Subscription: chưa mua ⇒ "chọn gói" + nút **Nâng cấp**; **đã mua ⇒ hiện gói đang dùng + ngày hết
  hạn + số ngày còn lại + nút Gia hạn** (mở paywall). Áp dụng iOS, macOS, Android.
- Tên gói lấy từ backend: `subscription_status.plan_badge` (hook `setPlanLabelResolver` → plan-store:
  `monthly → Monthly`, `quarterly → 3 Months`, `yearly → Yearly`).

## 8. Bẫy đã gặp thật (đừng lặp lại)

| Triệu chứng khách thấy | Nguyên nhân thật | Fix |
|---|---|---|
| Cài hồ sơ xong, không có gì gửi về | `Profile Service` bọc trong `<array>` của profile `Configuration` | `PayloadType` cấp cao nhất = `Profile Service`, `PayloadContent` = `<dict>` |
| **Invalid Profile** | `&` thô trong XML (khi thêm `?token=`) | escape XML mọi giá trị nội suy |
| **Invalid Profile** (lần khác) | `Content-Disposition: attachment` | bỏ header đó |
| **Invalid Profile** (lần khác) | cài lại **file tải dở** (server restart giữa lúc tải) | link hồ sơ có `&ts=` mới mỗi lần mở trang |
| Server trả **400** dù máy đã gửi | parser chỉ nhận form-urlencoded base64 | nhận raw body + tự nhận dạng |
| Vẫn 400 | body là **CMS/PKCS#7** (iOS 26) | cắt plist XML trong khối nhị phân |
| Không hiện nút cài app | trang không biết máy đã đăng ký (iOS gửi ngầm) | **mã phiên** + luôn có nút Tải & cài |
| iOS báo "Unable to Install" | UDID chưa có trong provisioning profile của IPA | ký lại IPA (hoặc đăng ký UDID rồi ký) |

## 9. Việc còn lại

- **macOS**: chưa có link build cho Mac ⇒ nút Update của app Mac vẫn mở web. Cần chốt cách phát bản Mac
  (`.pkg` / `.dmg` / `.zip`, có notarize không) rồi thêm `mac_url` vào payload.
- **Android**: nút Update đã tải APK trực tiếp (không qua trang cài); muốn tải **trong app** rồi mở
  trình cài thì cần `FileProvider` + quyền `REQUEST_INSTALL_PACKAGES`.
- **Ký IPA khi có UDID mới**: server tự thêm UDID lên Apple **và** tự ký lại bằng zsign (xem §4b-bis) —
  chỉ cần nạp khoá `.p12` một lần; sau đó máy Mac không phải bật.
- Provisioning profile Ad Hoc hết hạn theo năm tài khoản ⇒ nhớ lịch ký lại.

## 10. Kiểm tra nhanh

```bash
# hồ sơ hợp lệ (XML parse được, URL đã escape)
curl -s "https://meetflowai.site/install/ios/register.mobileconfig?lang=vi" | python3 -c "import sys,plistlib;plistlib.loads(sys.stdin.buffer.read());print('XML OK')"
# payload cập nhật trong app
curl -s -A "VPNFlow (iPhone)" "https://api.meetflowai.site/v1/app-version?platform=ios"
# log luồng UDID trên node-2
journalctl -u flowvpn-cp -f | grep -E "ios-trace|ios-udid"
```
