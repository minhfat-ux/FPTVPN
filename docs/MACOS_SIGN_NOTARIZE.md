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
Script tham chiếu: `/tmp/asc-profiles.mjs` (tạo lại nhanh: JWT + 3 request trên).

## 2. Ký (inside-out, KHÔNG dùng export của Xcode để tránh “Cloud signing permission error”)
```bash
ID="Developer ID Application: Minh Nguyen (G6XW3RN6LJ)"
APP=…/VPNFlow.app; APPEX="$APP/Contents/PlugIns/PrivateVPNMacPacketTunnel.appex"

# (a) nhúng profile vào app + extension
cp com.privatevpn.mac.provisionprofile                "$APP/Contents/embedded.provisionprofile"
cp com.privatevpn.mac.packet-tunnel.provisionprofile  "$APPEX/Contents/embedded.provisionprofile"

# (b) KÝ FRAMEWORK CON TRƯỚC (nếu bỏ bước này, notarize sẽ Invalid)
codesign --force --options runtime --timestamp --sign "$ID" "$APPEX/Contents/Frameworks/Hysteria.framework/Versions/A/Hysteria"
codesign --force --options runtime --timestamp --sign "$ID" "$APPEX/Contents/Frameworks/Hysteria.framework"

# (c) rồi mới tới extension và app (giữ nguyên quyền bằng entitlements hiện có)
codesign -d --entitlements :- "$APPEX" > /tmp/ext.ent ; codesign -d --entitlements :- "$APP" > /tmp/app.ent
codesign --force --options runtime --timestamp --sign "$ID" --entitlements /tmp/ext.ent "$APPEX"
codesign --force --options runtime --timestamp --sign "$ID" --entitlements /tmp/app.ent "$APP"
codesign --verify --deep --strict --verbose=2 "$APP"      # phải "valid on disk"
spctl -a -vv "$APP"    # trước notarize sẽ là: rejected / source=Unnotarized Developer ID  ← ĐÚNG, không phải lỗi
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

### 4b. Phải staple CẢ app + appex BÊN TRONG DMG — không chỉ staple file DMG
> Bài học P0 22/09/2026: DMG đang phát **đã staple** (spctl `accepted`), nhưng `stapler validate`
> trên `VPNFlow.app` (và `PrivateVPNMacPacketTunnel.appex`) bên trong lại báo **chưa có vé** ⇒ khách
> cài xong mở app bị Gatekeeper chặn (nhất là máy không ra được dịch vụ notarize của Apple, ví dụ ở TQ).
> `stapler staple <file>.dmg` **chỉ** gắn vé cho file DMG, KHÔNG gắn cho code bên trong.

Quy trình sửa lại một DMG đã notarize (không cần build lại app):
```bash
# 1) mở DMG ra bản đọc-ghi, staple app + extension BÊN TRONG
hdiutil convert VPNFlow-mac.dmg -format UDRW -o rw.dmg
hdiutil attach rw.dmg -nobrowse -readwrite -mountpoint /tmp/vpnflow-rw
APP=/tmp/vpnflow-rw/VPNFlow.app
xcrun stapler staple "$APP"
xcrun stapler staple "$APP/Contents/PlugIns/PrivateVPNMacPacketTunnel.appex"
xcrun stapler validate "$APP"     # "The validate action worked!"
hdiutil detach /tmp/vpnflow-rw
# 2) đóng gói lại rồi ký MỚI → notarize → staple theo đúng §3–§4
hdiutil convert rw.dmg -format UDZO -o VPNFlow-mac.dmg
codesign --force --timestamp --sign "$ID" VPNFlow-mac.dmg
xcrun notarytool submit VPNFlow-mac.dmg --key ~/.vpnflow-asc/AuthKey.p8 \
      --key-id "$KEYID" --issuer "$ISSUER" --wait          # Accepted
xcrun stapler staple VPNFlow-mac.dmg
```
Kiểm chứng cuối — **cả 3** phải đạt: `xcrun stapler validate <DMG>`, `xcrun stapler validate <app-trong-DMG>`
(và `.appex`), `spctl -a -t open --context context:primary-signature -vv <DMG>`.
⚠️ `Hysteria.framework` bên trong appex có thể không có vé riêng (stapler trả *Error 73*) — bỏ qua được,
miễn app + appex đã có vé.

## 5. Phát hành
```bash
cp backup: mv /root/flowvpn-mac/VPNFlow-mac.dmg /root/flowvpn-mac/VPNFlow-mac-unsigned-<date>.dmg
scp/ssh cat > /root/flowvpn-mac/VPNFlow-mac.dmg
curl -sI https://t1.meetflowai.site/v1/downloads/mac     # 200 + content-length khớp
```

## 6. Lỗi đã gặp & cách xử
| Lỗi | Nguyên nhân | Xử |
|---|---|---|
| `exportArchive Cloud signing permission error` / `No profiles for 'com.privatevpn.mac'` | ASC key **không đủ quyền** tạo profile Developer ID qua Xcode cloud signing | Tạo profile bằng **API** (§1) rồi **ký tay** (§2) |
| `MAC_APP_DEVELOPER_ID is not a valid value` | sai enum | dùng **`MAC_APP_DIRECT`** |
| notarize **Invalid**: *“…/Hysteria.framework/…/Hysteria: binary is not signed with a valid Developer ID certificate / no secure timestamp”* | framework Go nhúng chưa ký | ký framework **trước** appex/app (§2b) |
| TestFlight: *90171 Invalid bundle structure … standalone executables* | App Store **cấm** binary rời trong framework (luật khác macOS) | phải **bỏ/đóng gói lại** framework cho bản App Store (chưa xong — xem manifest “Việc chưa xong”) |
| Khách vẫn thấy cảnh báo dù đã notarize | DMG chưa ký hoặc staple sai thứ tự | làm đúng §3–§4 rồi `spctl` kiểm lại |
| Khách cài xong mở app báo *“không thể mở”*, mà `spctl` trên DMG vẫn `accepted` | DMG **đã** staple nhưng **app/.appex bên trong chưa có vé** (stapler chỉ gắn vé cho file DMG) | staple app + appex bên trong rồi đóng gói/ký/notarize/staple lại — xem §4b (đã xử 22/09/2026) |
